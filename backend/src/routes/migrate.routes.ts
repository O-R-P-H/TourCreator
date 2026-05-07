import { Router, Request, Response } from 'express';
import { chromium } from 'playwright';

const router = Router();

// ============================================
// ТИПЫ
// ============================================

interface MappedEntity {
    source_id: number;
    source_name: string;
    source_type?: string;
    pazl_id: number | null;
    pazl_name: string | null;
    needs_creation: boolean;
}

interface CreatedEntity {
    type: string;
    source_name: string;
    pazl_id: number;
    original_data?: any;
}

// ============================================
// ХРАНИЛИЩЕ СЕССИЙ ДЛЯ SSE
// ============================================

const sessions = new Map<string, {
    res: Response;
    status: string;
    log: string[];
    tourData?: any;
    mappings?: any;
    stats?: any;
    createdEntities?: CreatedEntity[];
    tourCreated?: boolean;
    error?: string;
}>();

function sendSSE(sessionId: string, event: string, data: any) {
    const session = sessions.get(sessionId);
    if (session && session.res) {
        try {
            session.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (e) {
            console.log('SSE send error:', e);
        }
    }
}

// ============================================
// API КЛИЕНТ AVIANNA
// ============================================

class AviannaApiClient {
    private cache = new Map<string, any>();

    constructor(private page: any) {}

    private async fetchApi<T>(url: string): Promise<T | null> {
        const cacheKey = url;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey) as T;
        }

        const fullUrl = url.startsWith('http') ? url : `https://gate.avianna24.ru/api${url}`;

        try {
            const result = await this.page.evaluate(async (fetchUrl: string) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);

                try {
                    const response = await fetch(fetchUrl, {
                        credentials: 'include',
                        headers: {
                            'Accept': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest'
                        },
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    if (!response.ok) return null;
                    return response.json();
                } catch (e: any) {
                    clearTimeout(timeoutId);
                    return null;
                }
            }, fullUrl);

            if (result) {
                this.cache.set(cacheKey, result);
            }

            return result as T;

        } catch (error: any) {
            console.log(`      ⚠️ Ошибка Avianna запроса: ${url} - ${error.message}`);
            return null;
        }
    }

    async getTours(query: string = ''): Promise<any> {
        const params = new URLSearchParams({ query, limit: '20', page: '1' });
        return this.fetchApi(`/tours?${params}`);
    }

    async getTour(id: number): Promise<any> {
        return this.fetchApi(`/tours/${id}`);
    }

    async getHotel(id: number): Promise<any> {
        return this.fetchApi(`/hotels/${id}`);
    }

    async getTransport(id: number): Promise<any> {
        return this.fetchApi(`/transports/${id}`);
    }

    async getTransportation(): Promise<any> {
        return this.fetchApi('/transportation');
    }

    async getCityById(cityId: number): Promise<string | null> {
        const cities = await this.fetchApi<any>('/cities/list');
        if (cities?.data) {
            const city = cities.data.find((c: any) => c.id === cityId);
            if (city) return city.name;
        }
        return null;
    }

    async getCategoryName(categoryId: number): Promise<string | null> {
        const categories = await this.fetchApi<any>('/tours/excursion/categories');
        if (categories?.data) {
            const category = categories.data.find((c: any) => c.id === categoryId);
            if (category) return category.name;
        }
        return null;
    }

    async getTourServiceName(serviceId: number): Promise<string | null> {
        const toursData = await this.fetchApi<any>('/tours/data');
        if (toursData?.services) {
            const service = toursData.services.find((s: any) => s.id === serviceId);
            if (service) return service.name;
        }
        const service = await this.fetchApi<any>(`/tours/services/${serviceId}`);
        if (service?.name) return service.name;
        return null;
    }

    async getTourServiceFull(serviceId: number): Promise<any | null> {
        return this.fetchApi(`/tours/services/${serviceId}`);
    }
}

// ============================================
// ИЗВЛЕЧЕНИЕ ДАННЫХ ИЗ AVIANNA
// ============================================

async function extractTourData(api: AviannaApiClient, tourId: number, sessionId: string): Promise<any> {
    sendSSE(sessionId, 'step', { step: 1, status: 'active', message: 'Загрузка данных тура...' });

    const tour = await api.getTour(tourId);

    if (!tour) {
        sendSSE(sessionId, 'step', { step: 1, status: 'error', message: 'Не удалось загрузить тур' });
        return null;
    }

    sendSSE(sessionId, 'step', { step: 1, status: 'active', message: `Тур найден: ${tour.name}. Загрузка связанных данных...` });

    const result: any = {
        id: tour.id,
        name: tour.name,
        slug: tour.slug,
        duration: tour.duration,
        is_active: tour.is_active,
        adult_price: tour.adult_price,
        child_price: tour.child_price,
        commission_agency_sum: tour.commission_agency_sum,
        short_description: tour.short_description,
        description: tour.description,
        info: tour.info,
        additional_price: tour.additional_price,
        additional_price_includes: tour.additional_price_includes,
        additional_extra_price: tour.additional_extra_price,
        seo_h1: tour.seo_h1,
        seo_title: tour.seo_title,
        seo_description: tour.seo_description,
        dates: tour.dates,
        days: tour.days,
        meals: tour.meals,
        photos: tour.photos,
        files: tour.files,
        category_id: tour.category_id,
        tour_type_id: tour.tour_type_id,
        city_id: tour.city_id,
        transport_forth_id: tour.transport_forth_id,
        transport_back_id: tour.transport_back_id,
        trade_offers: tour.trade_offers,
        catalog_sections: tour.catalog_sections || [],
        services: tour.services || [],
        required_services: tour.required_services || [],
        additional_services: tour.additional_services || [],
    };

    if (tour.transport_forth_id) {
        sendSSE(sessionId, 'step', { step: 1, status: 'active', message: 'Загрузка транспорта...' });
        const transport = await api.getTransport(tour.transport_forth_id);
        if (transport) {
            result.transport_forth = transport;
            if (transport.transportation_id) {
                const transportation = await api.getTransportation();
                if (transportation?.data) {
                    const transportType = transportation.data.find((t: any) => t.id === transport.transportation_id);
                    if (transportType) {
                        result.transport_forth.transportation = transportType;
                    }
                }
            }
        }
    }

    if (tour.transport_back_id) {
        const transport = await api.getTransport(tour.transport_back_id);
        if (transport) {
            result.transport_back = transport;
        }
    }

    if (tour.hotels && tour.hotels.length > 0) {
        sendSSE(sessionId, 'step', { step: 1, status: 'active', message: `Загрузка гостиниц (${tour.hotels.length})...` });
        result.hotels = [];
        for (const hotelRef of tour.hotels) {
            const hotel = await api.getHotel(hotelRef.id);
            if (hotel) {
                result.hotels.push({
                    ...hotel,
                    arrival_day: hotelRef.arrival_day,
                    departure_day: hotelRef.departure_day,
                    meal_id: hotelRef.meal_id,
                });
            }
        }
    }

    // Города
    sendSSE(sessionId, 'step', { step: 1, status: 'active', message: 'Загрузка названий городов...' });
    result.city_names = {};
    const cityIds = new Set<number>();
    if (result.transport_forth?.routes) {
        const routes = result.transport_forth.routes;
        const addCityId = (point: any) => {
            if (point?.point_city_id) cityIds.add(point.point_city_id);
        };
        addCityId(routes.start);
        addCityId(routes.finish);
        routes.intermediates?.forEach(addCityId);
    }
    result.hotels?.forEach((hotel: any) => {
        if (hotel.city?.id) cityIds.add(hotel.city.id);
    });

    for (const cityId of cityIds) {
        const cityName = await api.getCityById(cityId);
        if (cityName) result.city_names[cityId] = cityName;
    }

    // Категория
    if (result.category_id) {
        const categoryName = await api.getCategoryName(result.category_id);
        result.category_name = categoryName || 'Автобусные туры';
    }

    // Услуги
    const serviceIds = new Set<number>();
    [...(tour.services || []), ...(tour.required_services || []), ...(tour.additional_services || [])].forEach((s: any) => {
        if (s.id) serviceIds.add(s.id);
    });

    if (serviceIds.size > 0) {
        sendSSE(sessionId, 'step', { step: 1, status: 'active', message: `Загрузка услуг (${serviceIds.size})...` });
        result.services_data = {};
        result.service_names = {};
        for (const serviceId of serviceIds) {
            const serviceName = await api.getTourServiceName(serviceId);
            if (serviceName) result.service_names[serviceId] = serviceName;
            const serviceData = await api.getTourServiceFull(serviceId);
            if (serviceData) result.services_data[serviceId] = serviceData;
        }
    }

    sendSSE(sessionId, 'step', { step: 1, status: 'completed', message: `Тур "${tour.name}" загружен полностью` });
    return result;
}

// ============================================
// API КЛИЕНТ PAZL TOURS
// ============================================

class PazlApiClient {
    private xsrfToken: string = '';

    constructor(private page: any) {}

    async init(): Promise<void> {
        this.xsrfToken = await this.page.evaluate(() => {
            const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
            return match ? decodeURIComponent(match[1]) : '';
        });
    }

    async apiRequest<T>(url: string, options?: { method?: string; body?: any }): Promise<T | null> {
        await this.init();
        const fullUrl = url.startsWith('http') ? url : `https://gate.pazltours.online/api${url}`;
        const method = options?.method || 'GET';

        try {
            const result = await Promise.race([
                this.page.evaluate(async (params: { fetchUrl: string; fetchMethod: string; fetchBody?: any; xsrfToken: string }) => {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 30000);
                    try {
                        const headers: Record<string, string> = {
                            'Accept': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                            'X-XSRF-TOKEN': params.xsrfToken
                        };
                        if (params.fetchMethod !== 'GET') headers['Content-Type'] = 'application/json';
                        const fetchOptions: RequestInit = {
                            method: params.fetchMethod,
                            headers: headers,
                            credentials: 'include',
                            signal: controller.signal
                        };
                        if (params.fetchMethod !== 'GET' && params.fetchBody) fetchOptions.body = JSON.stringify(params.fetchBody);
                        const response = await fetch(params.fetchUrl, fetchOptions);
                        clearTimeout(timeoutId);
                        if (!response.ok) {
                            const errorText = await response.text();
                            return { __error: true, __status: response.status, __body: errorText };
                        }
                        const text = await response.text();
                        if (!text) return { status: 'OK' };
                        try { return JSON.parse(text); } catch { return { data: text }; }
                    } catch (e: any) {
                        clearTimeout(timeoutId);
                        return { __error: true, __status: 0, __body: e.message };
                    }
                }, { fetchUrl: fullUrl, fetchMethod: method, fetchBody: options?.body, xsrfToken: this.xsrfToken }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Pazl API timeout')), 35000))
            ]);

            if (result?.__error) return null;
            return result as T;
        } catch (error: any) {
            return null;
        }
    }

    async findEntity(endpoint: string, name: string): Promise<{ id: number; name: string } | null> {
        if (!name) return null;
        const result = await this.apiRequest<any>(`${endpoint}?query=${encodeURIComponent(name)}&limit=10`);
        if (result?.data && Array.isArray(result.data) && result.data.length > 0) {
            const exactMatch = result.data.find((item: any) => item.name === name);
            if (exactMatch) return { id: exactMatch.id, name: exactMatch.name };
            return { id: result.data[0].id, name: result.data[0].name };
        }
        return null;
    }

    async findCity(name: string) { return this.findEntity('/cities', name); }
    async findTransportation(name: string) { return this.findEntity('/transportation', name); }
    async findTransport(name: string) { return this.findEntity('/transports', name); }
    async findHotelMeal(name: string) { return this.findEntity('/hotels/meals', name); }
    async findHotelAccommodation(name: string) { return this.findEntity('/hotels/accommodations', name); }
    async findHotelInfrastructureType(name: string) { return this.findEntity('/hotels/infrastructure-types', name); }
    async findHotelInfrastructure(name: string) { return this.findEntity('/hotels/infrastructures', name); }
    async findRoomType(name: string) { return this.findEntity('/hotels/rooms/types', name); }
    async findRoomPlace(name: string) { return this.findEntity('/hotels/rooms/places', name); }
    async findRoomDescription(name: string) { return this.findEntity('/hotels/rooms/descriptions', name); }
    async findRoomService(name: string) { return this.findEntity('/hotels/rooms/services', name); }
    async findRoomEquipment(name: string) { return this.findEntity('/hotels/rooms/equipment', name); }
    async findRoomFurniture(name: string) { return this.findEntity('/hotels/rooms/furniture', name); }
    async findRoomBathroom(name: string) { return this.findEntity('/hotels/rooms/bathroom', name); }
    async findHotel(name: string) { return this.findEntity('/hotels', name); }
    async findTourCategory(name: string) { return this.findEntity('/tours/excursion/categories', name); }
    async findTourService(name: string) { return this.findEntity('/tours/services', name); }
    async findCatalogSection(name: string) { return this.findEntity('/catalog-sections', name); }

    async createCity(name: string) {
        return this.apiRequest('/cities', { method: 'POST', body: { name, country_id: 1, near_cities: [], railway_transfer_cities: [], aviation_transfer_cities: [], seo_settings: { meta: {}, hotel: { meta: {}, description: null, bottom_block: { text: null }, faq: [] }, bus_tickets: { meta: {}, description: null, bottom_block: { text: null }, faq: [], advantages: [] } }, catalog: {} } });
    }
    async createTourCategory(name: string) { return this.apiRequest('/tours/excursion/categories', { method: 'POST', body: { name } }); }
    async createHotelMeal(name: string) { return this.apiRequest('/hotels/meals', { method: 'POST', body: { id: null, name, category_type: 1 } }); }
    async createHotelInfrastructureType(name: string) { return this.apiRequest('/hotels/infrastructure-types', { method: 'POST', body: { name } }); }
    async createHotelInfrastructure(name: string, typeId: number) { return this.apiRequest('/hotels/infrastructures', { method: 'POST', body: { is_filter: true, is_point_filter: false, name, infrastructure_type_id: typeId } }); }
    async createTourService(name: string, serviceClass: string = 'group', dates: any[] = []) {
        const serviceDates = dates.length > 0 ? dates : [{ id: null, from: "2026-01-01", to: "2026-12-31", vendor_price: "0", adult_price: "0", child_prices: [], commission_adult_type: 1, commission_adult_sum: 0, commission_child_type: 1, commission_child_sum: 0 }];
        return this.apiRequest('/tours/services', { method: 'POST', body: { name, class: serviceClass, vendor_id: 2, is_dealer_vendor: false, description: name, dates: serviceDates } });
    }
    async createTransport(transportationId: number, name: string, data: any, citiesMap: Map<number, number>) {
        const routes: any = {
            start: { info: data.transport_forth?.routes?.start?.info || null, point_city_id: data.transport_forth?.routes?.start?.point_city_id ? citiesMap.get(data.transport_forth.routes.start.point_city_id) || data.transport_forth.routes.start.point_city_id : null, start_time: data.transport_forth?.routes?.start?.start_time || '10:00', finish_time: null },
            intermediates: [],
            finish: { info: data.transport_forth?.routes?.finish?.info || null, point_city_id: data.transport_forth?.routes?.finish?.point_city_id ? citiesMap.get(data.transport_forth.routes.finish.point_city_id) || data.transport_forth.routes.finish.point_city_id : null, start_time: null, finish_time: data.transport_forth?.routes?.finish?.finish_time || '11:00' }
        };
        if (data.transport_forth?.routes?.intermediates) {
            for (const point of data.transport_forth.routes.intermediates) {
                routes.intermediates.push({ point_city_id: citiesMap.get(point.point_city_id) || point.point_city_id, info: point.info || null, finish_time: point.finish_time || '', start_time: point.start_time || '', arrival_day: point.arrival_day || 1, departure_day: point.departure_day || 1, tariffs: [], can_delete: true });
            }
        }
        const allCityIds = new Set<number>();
        if (routes.start.point_city_id) allCityIds.add(routes.start.point_city_id);
        if (routes.finish.point_city_id) allCityIds.add(routes.finish.point_city_id);
        routes.intermediates.forEach((p: any) => { if (p.point_city_id) allCityIds.add(p.point_city_id); });
        const cityArray = Array.from(allCityIds);
        const tariffs: any[] = [];
        for (const fromCity of cityArray) { for (const toCity of cityArray) { tariffs.push({ from_city_id: fromCity, to_city_id: toCity, tariff: 0 }); } }
        const dates = data.transport_forth?.dates?.map((d: any) => d.start_date) || [];
        const payload = { transportation_id: transportationId, vendor_id: 2, name, duration: data.transport_forth?.duration?.toString() || "1", adult_price: data.transport_forth?.adult_price || "0", child_price: data.transport_forth?.child_price || "0", start_date: data.transport_forth?.start_date || dates[0] || "2026-01-01", finish_date: data.transport_forth?.finish_date || dates[dates.length - 1] || "2026-12-31", departure_type: data.transport_forth?.departure_type || 1, is_excursion: true, application_auto_confirm: false, auto_confirm_status: null, days: [], dates: dates.map((d: string) => ({ id: null, start_date: d, commission_type: 1, commission_sum: 0, freight: 0 })), routes, tariffs, catalog: { title: null, price: 0, image: null, sort: 0, seo_settings: { meta: { h1: null, title: null, description: null }, advantages: [], faq: [], top_block: { title: null, text: null }, bottom_block: { title: null, text: null } } } };
        return this.apiRequest('/transports', { method: 'POST', body: { payload: JSON.stringify(payload) } });
    }
    async createHotel(hotelName: string, hotelData: any, mappings: any) {
        let cityId = null;
        const cityMapping = mappings.cities.find((c: MappedEntity) => c.source_id === hotelData.city?.id);
        if (cityMapping && !cityMapping.needs_creation) cityId = cityMapping.pazl_id;
        if (!cityId && hotelData.city?.name) {
            const foundCity = await this.findCity(hotelData.city.name);
            if (foundCity) cityId = foundCity.id;
        }
        if (!cityId && hotelData.city?.name) {
            await this.createCity(hotelData.city.name);
            const newCity = await this.findCity(hotelData.city.name);
            if (newCity) cityId = newCity.id;
        }
        if (!cityId) return null;

        const meals: any[] = [];
        if (hotelData.meals) {
            for (const meal of hotelData.meals) {
                const mealMapping = mappings.hotel_meals.find((m: MappedEntity) => m.source_id === meal.id);
                if (mealMapping && !mealMapping.needs_creation) meals.push({ id: mealMapping.pazl_id, sum: meal.sum || "0" });
            }
        }

        const infrastructures: any[] = [];
        if (hotelData.infrastructures && hotelData.infrastructures.length > 0) {
            for (const infra of hotelData.infrastructures) {
                let infraId = null, typeId = null;
                const infraMapping = mappings.hotel_infrastructures.find((i: MappedEntity) => i.source_id === infra.id);
                if (infraMapping && !infraMapping.needs_creation) infraId = infraMapping.pazl_id;
                if (infra.infrastructure_type?.id) {
                    const typeMapping = mappings.hotel_infrastructure_types.find((t: MappedEntity) => t.source_id === infra.infrastructure_type.id);
                    if (typeMapping && !typeMapping.needs_creation) typeId = typeMapping.pazl_id;
                }
                if (infraId && typeId) infrastructures.push({ id: infraId, pay: infra.pay || 0, type: typeId });
            }
        }

        if (infrastructures.length === 0) {
            let typeId = 1;
            let typeFound = await this.findHotelInfrastructureType('Удобства');
            if (!typeFound) { await this.createHotelInfrastructureType('Удобства'); typeFound = await this.findHotelInfrastructureType('Удобства'); }
            if (typeFound) typeId = typeFound.id;
            let infraFound = await this.findHotelInfrastructure('Огороженная территория');
            if (!infraFound) { await this.createHotelInfrastructure('Огороженная территория', typeId); infraFound = await this.findHotelInfrastructure('Огороженная территория'); }
            if (infraFound) infrastructures.push({ id: infraFound.id, pay: 0, type: typeId });
        }

        const rooms: any[] = [];
        if (hotelData.rooms) {
            for (const room of hotelData.rooms) {
                const accommodationMapping = mappings.hotel_accommodations.find((a: MappedEntity) => a.source_id === room.accommodation?.id);
                const typeMapping = mappings.room_types.find((t: MappedEntity) => t.source_id === room.type?.id);
                const placeMapping = mappings.room_places.find((p: MappedEntity) => p.source_id === room.place?.id);
                const descriptionMapping = mappings.room_descriptions.find((d: MappedEntity) => d.source_id === room.description?.id);
                if (accommodationMapping && typeMapping && placeMapping && descriptionMapping && !accommodationMapping.needs_creation && !typeMapping.needs_creation && !placeMapping.needs_creation && !descriptionMapping.needs_creation) {
                    rooms.push({ accommodation_id: accommodationMapping.pazl_id, type_id: typeMapping.pazl_id, place_id: placeMapping.pazl_id, adult_count: "0", child_count: "0", adult_price: "", child_price: "", description_id: descriptionMapping.pazl_id, meals: [], dates: [], place: { id: placeMapping.pazl_id, name: placeMapping.pazl_name }, type: { id: typeMapping.pazl_id, name: typeMapping.pazl_name }, description: { id: descriptionMapping.pazl_id, name: descriptionMapping.pazl_name } });
                }
            }
        }

        const payload = { city_id: cityId, name: hotelName, address: hotelData.address || "", category_type: 1, meals, infrastructures, rooms, departure_time: "12:00", arrival_time: "12:00", vendor_id: 2, status: 1 };
        return this.apiRequest('/hotels', { method: 'POST', body: { payload: JSON.stringify(payload) } });
    }
}

// ============================================
// ВХОД В PAZL
// ============================================

async function loginToPazl(page: any, email: string, password: string): Promise<boolean> {
    await page.goto('https://manager.pazltours.online/auth');
    await page.waitForTimeout(3000);
    const emailInput = await page.$('input[type="text"]') || await page.$('input[name="login"]');
    const passwordInput = await page.$('input[type="password"]');
    if (!emailInput || !passwordInput) return false;
    await emailInput.fill(email);
    await passwordInput.fill(password);
    const submitButton = await page.$('button[type="submit"]');
    if (submitButton) await submitButton.click();
    else await passwordInput.press('Enter');
    await page.waitForTimeout(5000);
    return page.url().includes('/welcome') || page.url().includes('/dashboard');
}

// ============================================
// МАППИНГ
// ============================================

async function performMapping(pazlApi: PazlApiClient, tourData: any, sessionId: string): Promise<any> {
    sendSSE(sessionId, 'step', { step: 3, status: 'active', message: 'Поиск соответствий в Pazl Tours...' });

    const mappings: any = {
        cities: [] as MappedEntity[], transportations: [] as MappedEntity[], transports: [] as MappedEntity[],
        hotel_meals: [] as MappedEntity[], hotel_accommodations: [] as MappedEntity[],
        hotel_infrastructure_types: [] as MappedEntity[], hotel_infrastructures: [] as MappedEntity[],
        room_types: [] as MappedEntity[], room_places: [] as MappedEntity[], room_descriptions: [] as MappedEntity[],
        room_services: [] as MappedEntity[], room_equipments: [] as MappedEntity[], room_furnitures: [] as MappedEntity[],
        room_bathrooms: [] as MappedEntity[], hotels: [] as MappedEntity[], tour_categories: [] as MappedEntity[],
        tour_services: [] as MappedEntity[], catalog_sections: [] as MappedEntity[],
    };

    const mapEntity = async (sourceId: number, sourceName: string, pazlFindMethod: (name: string) => Promise<{ id: number; name: string } | null>, targetArray: MappedEntity[], sourceType?: string) => {
        const found = await pazlFindMethod(sourceName);
        targetArray.push({ source_id: sourceId, source_name: sourceName, source_type: sourceType, pazl_id: found?.id || null, pazl_name: found?.name || null, needs_creation: !found });
    };

    // Города
    sendSSE(sessionId, 'step', { step: 3, status: 'active', message: 'Маппинг городов...' });
    const cityIds = new Set<number>();
    if (tourData.transport_forth?.routes) {
        const routes = tourData.transport_forth.routes;
        const addCityId = (point: any) => { if (point?.point_city_id) cityIds.add(point.point_city_id); };
        addCityId(routes.start); addCityId(routes.finish);
        routes.intermediates?.forEach(addCityId);
    }
    tourData.hotels?.forEach((hotel: any) => { if (hotel.city?.id) cityIds.add(hotel.city.id); });

    for (const cityId of cityIds) {
        const cityName = tourData.city_names?.[cityId] || tourData.hotels?.find((h: any) => h.city?.id === cityId)?.city?.name;
        if (cityName) await mapEntity(cityId, cityName, (name) => pazlApi.findCity(name), mappings.cities);
    }

    // Транспорт
    if (tourData.transport_forth?.transportation) {
        sendSSE(sessionId, 'step', { step: 3, status: 'active', message: 'Маппинг транспорта...' });
        const t = tourData.transport_forth.transportation;
        await mapEntity(t.id, t.name, (name) => pazlApi.findTransportation(name), mappings.transportations);
    }
    if (tourData.transport_forth) await mapEntity(tourData.transport_forth.id, tourData.transport_forth.name, (name) => pazlApi.findTransport(name), mappings.transports);
    if (tourData.transport_back) await mapEntity(tourData.transport_back.id, tourData.transport_back.name, (name) => pazlApi.findTransport(name), mappings.transports);

    // Категория
    if (tourData.category_id) {
        await mapEntity(tourData.category_id, tourData.category_name || 'Автобусные туры', (name) => pazlApi.findTourCategory(name), mappings.tour_categories);
    }

    // Гостиницы
    if (tourData.hotels) {
        sendSSE(sessionId, 'step', { step: 3, status: 'active', message: `Маппинг гостиниц (${tourData.hotels.length})...` });
        for (const hotel of tourData.hotels) {
            await mapEntity(hotel.id, hotel.name, (name) => pazlApi.findHotel(name), mappings.hotels);
        }
    }

    // Питание
    const hotelMealsMap = new Map<number, string>();
    tourData.hotels?.forEach((hotel: any) => { hotel.meals?.forEach((meal: any) => { if (!hotelMealsMap.has(meal.id)) hotelMealsMap.set(meal.id, meal.name); }); });
    for (const [id, name] of hotelMealsMap) await mapEntity(id, name, (n) => pazlApi.findHotelMeal(n), mappings.hotel_meals);

    // Услуги тура
    const tourServicesToFind = new Map<number, any>();
    [...(tourData.services || []), ...(tourData.required_services || []), ...(tourData.additional_services || [])].forEach((s: any) => {
        if (!tourServicesToFind.has(s.id)) {
            const name = tourData.service_names?.[s.id];
            if (name) tourServicesToFind.set(s.id, { name, type: 'service' });
        }
    });

    if (tourServicesToFind.size > 0) {
        sendSSE(sessionId, 'step', { step: 3, status: 'active', message: `Маппинг услуг (${tourServicesToFind.size})...` });
        for (const [id, data] of tourServicesToFind) {
            await mapEntity(id, data.name, (name) => pazlApi.findTourService(name), mappings.tour_services, data.type);
        }
    }

    // Сущности номеров
    const collectMaps = () => {
        const maps = {
            accommodations: new Map<number, string>(), infraTypes: new Map<number, string>(),
            infrastructures: new Map<number, string>(), roomTypes: new Map<number, string>(),
            roomPlaces: new Map<number, string>(), roomDescriptions: new Map<number, string>(),
            roomServices: new Map<number, string>(), roomEquipments: new Map<number, string>(),
            roomFurnitures: new Map<number, string>(), roomBathrooms: new Map<number, string>(),
        };
        tourData.hotels?.forEach((hotel: any) => {
            hotel.rooms?.forEach((room: any) => {
                if (room.accommodation?.id) maps.accommodations.set(room.accommodation.id, room.accommodation.name);
                if (room.type?.id) maps.roomTypes.set(room.type.id, room.type.name);
                if (room.place?.id) maps.roomPlaces.set(room.place.id, room.place.name);
                if (room.description?.id) maps.roomDescriptions.set(room.description.id, room.description.name);
                room.r_services?.forEach((s: any) => maps.roomServices.set(s.id, s.name));
                room.r_equipments?.forEach((e: any) => maps.roomEquipments.set(e.id, e.name));
                room.r_furnitures?.forEach((f: any) => maps.roomFurnitures.set(f.id, f.name));
                room.r_bathrooms?.forEach((b: any) => maps.roomBathrooms.set(b.id, b.name));
            });
            hotel.infrastructures?.forEach((infra: any) => {
                maps.infrastructures.set(infra.id, infra.name);
                if (infra.infrastructure_type?.id) maps.infraTypes.set(infra.infrastructure_type.id, infra.infrastructure_type.name);
            });
        });
        return maps;
    };

    const maps = collectMaps();
    const totalEntities = maps.accommodations.size + maps.infraTypes.size + maps.infrastructures.size + maps.roomTypes.size + maps.roomPlaces.size + maps.roomDescriptions.size + maps.roomServices.size + maps.roomEquipments.size + maps.roomFurnitures.size + maps.roomBathrooms.size;

    if (totalEntities > 0) {
        sendSSE(sessionId, 'step', { step: 3, status: 'active', message: `Маппинг сущностей гостиниц (${totalEntities})...` });
        for (const [id, name] of maps.accommodations) await mapEntity(id, name, (n) => pazlApi.findHotelAccommodation(n), mappings.hotel_accommodations);
        for (const [id, name] of maps.infraTypes) await mapEntity(id, name, (n) => pazlApi.findHotelInfrastructureType(n), mappings.hotel_infrastructure_types);
        for (const [id, name] of maps.infrastructures) await mapEntity(id, name, (n) => pazlApi.findHotelInfrastructure(n), mappings.hotel_infrastructures);
        for (const [id, name] of maps.roomTypes) await mapEntity(id, name, (n) => pazlApi.findRoomType(n), mappings.room_types);
        for (const [id, name] of maps.roomPlaces) await mapEntity(id, name, (n) => pazlApi.findRoomPlace(n), mappings.room_places);
        for (const [id, name] of maps.roomDescriptions) await mapEntity(id, name, (n) => pazlApi.findRoomDescription(n), mappings.room_descriptions);
        for (const [id, name] of maps.roomServices) await mapEntity(id, name, (n) => pazlApi.findRoomService(n), mappings.room_services);
        for (const [id, name] of maps.roomEquipments) await mapEntity(id, name, (n) => pazlApi.findRoomEquipment(n), mappings.room_equipments);
        for (const [id, name] of maps.roomFurnitures) await mapEntity(id, name, (n) => pazlApi.findRoomFurniture(n), mappings.room_furnitures);
        for (const [id, name] of maps.roomBathrooms) await mapEntity(id, name, (n) => pazlApi.findRoomBathroom(n), mappings.room_bathrooms);
    }

    // Каталоги
    if (tourData.catalog_sections?.length > 0) {
        for (const section of tourData.catalog_sections) {
            await mapEntity(section.id, section.name || `Каталог ${section.id}`, (name) => pazlApi.findCatalogSection(name), mappings.catalog_sections);
        }
    }

    // Статистика
    let totalToCreate = 0, totalExists = 0;
    for (const items of Object.values(mappings)) {
        const typedItems = items as MappedEntity[];
        totalToCreate += typedItems.filter(i => i.needs_creation).length;
        totalExists += typedItems.filter(i => !i.needs_creation).length;
    }

    sendSSE(sessionId, 'step', { step: 3, status: 'completed', message: `Маппинг завершён. Найдено: ${totalExists}, создать: ${totalToCreate}` });

    return { mappings, stats: { totalToCreate, totalExists } };
}

// ============================================
// СОЗДАНИЕ СУЩНОСТЕЙ
// ============================================

async function createMissingEntities(pazlApi: PazlApiClient, mappings: any, tourData: any, sessionId: string): Promise<Map<string, CreatedEntity>> {
    const createdEntities = new Map<string, CreatedEntity>();
    const citiesMap = new Map<number, number>();
    for (const city of mappings.cities) { if (!city.needs_creation && city.pazl_id) citiesMap.set(city.source_id, city.pazl_id); }

    sendSSE(sessionId, 'step', { step: 4, status: 'active', message: 'Создание недостающих сущностей...' });

    // Города
    const citiesToCreate = mappings.cities.filter((c: MappedEntity) => c.needs_creation);
    for (const city of citiesToCreate) {
        sendSSE(sessionId, 'step', { step: 4, status: 'active', message: `Создание города: ${city.source_name}` });
        const result = await pazlApi.createCity(city.source_name);
        if (result) {
            const found = await pazlApi.findCity(city.source_name);
            if (found) { city.pazl_id = found.id; city.needs_creation = false; citiesMap.set(city.source_id, found.id); createdEntities.set(`city_${city.source_id}`, { type: 'city', source_name: city.source_name, pazl_id: found.id }); }
        }
    }

    // Категории
    for (const cat of mappings.tour_categories.filter((c: MappedEntity) => c.needs_creation)) {
        sendSSE(sessionId, 'step', { step: 4, status: 'active', message: `Создание категории: ${cat.source_name}` });
        const result = await pazlApi.createTourCategory(cat.source_name);
        if (result) { const found = await pazlApi.findTourCategory(cat.source_name); if (found) { cat.pazl_id = found.id; cat.needs_creation = false; createdEntities.set(`cat_${cat.source_id}`, { type: 'tour_category', source_name: cat.source_name, pazl_id: found.id }); } }
    }

    // Питание
    for (const meal of mappings.hotel_meals.filter((m: MappedEntity) => m.needs_creation)) {
        const result = await pazlApi.createHotelMeal(meal.source_name);
        if (result) { const found = await pazlApi.findHotelMeal(meal.source_name); if (found) { meal.pazl_id = found.id; meal.needs_creation = false; createdEntities.set(`meal_${meal.source_id}`, { type: 'hotel_meal', source_name: meal.source_name, pazl_id: found.id }); } }
    }

    // Инфраструктура
    for (const type of mappings.hotel_infrastructure_types.filter((t: MappedEntity) => t.needs_creation)) {
        const result = await pazlApi.createHotelInfrastructureType(type.source_name);
        if (result) { const found = await pazlApi.findHotelInfrastructureType(type.source_name); if (found) { type.pazl_id = found.id; type.needs_creation = false; createdEntities.set(`infraType_${type.source_id}`, { type: 'hotel_infrastructure_type', source_name: type.source_name, pazl_id: found.id }); } }
    }
    for (const infra of mappings.hotel_infrastructures.filter((i: MappedEntity) => i.needs_creation)) {
        let typeId = 1;
        const result = await pazlApi.createHotelInfrastructure(infra.source_name, typeId);
        if (result) { const found = await pazlApi.findHotelInfrastructure(infra.source_name); if (found) { infra.pazl_id = found.id; infra.needs_creation = false; createdEntities.set(`infra_${infra.source_id}`, { type: 'hotel_infrastructure', source_name: infra.source_name, pazl_id: found.id }); } }
    }

    // Услуги
    for (const service of mappings.tour_services.filter((s: MappedEntity) => s.needs_creation)) {
        sendSSE(sessionId, 'step', { step: 4, status: 'active', message: `Создание услуги: ${service.source_name}` });
        const serviceClass = service.source_type === 'required_service' ? 'individual' : 'group';
        const serviceData = tourData.services_data?.[service.source_id];
        const dates = serviceData?.dates?.map((d: any) => ({ id: null, from: d.from || "2026-01-01", to: d.to || "2026-12-31", vendor_price: "0", adult_price: "0", child_prices: [], commission_adult_type: 1, commission_adult_sum: 0, commission_child_type: 1, commission_child_sum: 0 })) || [];
        const result = await pazlApi.createTourService(service.source_name, serviceClass, dates);
        if (result) { const found = await pazlApi.findTourService(service.source_name); if (found) { service.pazl_id = found.id; service.needs_creation = false; createdEntities.set(`service_${service.source_id}`, { type: 'tour_service', source_name: service.source_name, pazl_id: found.id }); } }
    }

    // Транспорт
    for (const transport of mappings.transports.filter((t: MappedEntity) => t.needs_creation)) {
        sendSSE(sessionId, 'step', { step: 4, status: 'active', message: `Создание транспорта: ${transport.source_name}` });
        let transportationId = 1;
        if (tourData.transport_forth?.transportation) {
            const tm = mappings.transportations.find((t: MappedEntity) => t.source_id === tourData.transport_forth.transportation.id);
            if (tm && !tm.needs_creation) transportationId = tm.pazl_id!;
        }
        const result = await pazlApi.createTransport(transportationId, transport.source_name, tourData, citiesMap);
        if (result) { const found = await pazlApi.findTransport(transport.source_name); if (found) { transport.pazl_id = found.id; transport.needs_creation = false; createdEntities.set(`transport_${transport.source_id}`, { type: 'transport', source_name: transport.source_name, pazl_id: found.id }); } }
    }

    // Гостиницы
    for (const hotel of mappings.hotels.filter((h: MappedEntity) => h.needs_creation)) {
        sendSSE(sessionId, 'step', { step: 4, status: 'active', message: `Создание гостиницы: ${hotel.source_name}` });
        const hotelData = tourData.hotels?.find((h: any) => h.id === hotel.source_id);
        if (hotelData) {
            const result = await pazlApi.createHotel(hotel.source_name, hotelData, mappings);
            if (result) { const found = await pazlApi.findHotel(hotel.source_name); if (found) { hotel.pazl_id = found.id; hotel.needs_creation = false; createdEntities.set(`hotel_${hotel.source_id}`, { type: 'hotel', source_name: hotel.source_name, pazl_id: found.id }); } }
        }
    }

    sendSSE(sessionId, 'step', { step: 4, status: 'completed', message: `Создано сущностей: ${createdEntities.size}` });
    return createdEntities;
}

// ============================================
// СОЗДАНИЕ ТУРА
// ============================================

async function createTour(pazlApi: PazlApiClient, tourData: any, mappings: any, sessionId: string): Promise<boolean> {
    sendSSE(sessionId, 'step', { step: 5, status: 'active', message: 'Формирование данных тура...' });

    let category = mappings.tour_categories.find((c: MappedEntity) => c.source_id === tourData.category_id);
    if (!category || category.needs_creation) {
        const result = await pazlApi.createTourCategory('Автобусные туры');
        if (result) { const found = await pazlApi.findTourCategory('Автобусные туры'); if (found) category = { source_id: tourData.category_id, source_name: 'Автобусные туры', pazl_id: found.id, pazl_name: found.name, needs_creation: false }; }
    }

    const transportForth = mappings.transports.find((t: MappedEntity) => t.source_id === tourData.transport_forth_id);

    const hotels: any[] = [];
    if (tourData.hotels) {
        for (const hotel of tourData.hotels) {
            const mh = mappings.hotels.find((h: MappedEntity) => h.source_id === hotel.id);
            if (mh && !mh.needs_creation) {
                const cityId = hotel.city?.id;
                const mc = cityId ? mappings.cities.find((c: MappedEntity) => c.source_id === cityId) : null;
                hotels.push({ id: mh.pazl_id, city_id: mc?.pazl_id || null, arrival_day: hotel.arrival_day?.toString() || "1", departure_day: hotel.departure_day?.toString() || "2" });
            }
        }
    }

    const servicesInTour: any[] = [];
    if (tourData.services) {
        for (const s of tourData.services) {
            const ms = mappings.tour_services.find((ts: MappedEntity) => ts.source_id === s.id);
            if (ms && !ms.needs_creation) servicesInTour.push({ id: ms.pazl_id, day: s.day?.toString() || "1", service_class: "group" });
        }
    }

    const requiredServices: any[] = [];
    if (tourData.required_services) {
        for (const s of tourData.required_services) {
            const ms = mappings.tour_services.find((ts: MappedEntity) => ts.source_id === s.id);
            if (ms && !ms.needs_creation) requiredServices.push({ id: ms.pazl_id, day: s.day?.toString() || "1", service_class: "individual" });
        }
    }

    const additionalServices: any[] = [];
    if (tourData.additional_services) {
        for (const s of tourData.additional_services) {
            const ms = mappings.tour_services.find((ts: MappedEntity) => ts.source_id === s.id);
            if (ms && !ms.needs_creation) additionalServices.push({ id: ms.pazl_id, day: s.day?.toString() || "1", service_class: "group" });
        }
    }

    const dates: any[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (tourData.dates) {
        for (const date of tourData.dates) {
            const dateStr = date.start_date || date;
            const formattedDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
            const checkDate = new Date(formattedDate);
            if (!isNaN(checkDate.getTime()) && checkDate >= today) dates.push({ start_date: formattedDate });
        }
    }

    if (dates.length === 0) {
        sendSSE(sessionId, 'step', { step: 5, status: 'error', message: 'Нет будущих дат тура' });
        return false;
    }

    const days: any[] = [];
    if (tourData.days?.length > 0) {
        for (const day of tourData.days) days.push({ name: day.name || "День", description: day.description || "", photos: [] });
    } else if (tourData.description) {
        days.push({ name: "День 1", description: tourData.description, photos: [] });
    }

    const tourPayload = {
        id: null, name: tourData.name, is_active: tourData.is_active || false, is_hotel_selection: false,
        application_auto_confirm: false, auto_confirm_status: null, duration: tourData.duration?.toString() || "1",
        tour_type_id: tourData.tour_type_id || 1, city_id: null, hotels, dates, days,
        services: servicesInTour, required_services: requiredServices, additional_services: additionalServices,
        catalog_sections: [], trade_offers: [], photos: [], files: [], videos: [],
        short_description: tourData.short_description || "", description: tourData.description || "", info: tourData.info || "",
        additional_dates: "", additional_cities: tourData.info || "",
        additional_price: tourData.additional_price || "", additional_price_includes: tourData.additional_price_includes || "",
        additional_extra_price: tourData.additional_extra_price || "",
        commission_transport_type: 1, commission_transport_sum: "0", commission_accommodation_type: 1, commission_accommodation_sum: "0",
        commission_agency_type: "2", commission_agency_sum: tourData.commission_agency_sum?.toString() || "0",
        meal_price: null, commission_meal_type: 1, commission_meal_sum: null,
        adult_price: tourData.adult_price?.toString() || null, commission_adult_type: 1, commission_adult_sum: null,
        child_price: tourData.child_price?.toString() || null, commission_child_type: 1, commission_child_sum: null,
        meals: [], status: 1, category_id: category?.pazl_id || null, transport_forth_id: transportForth?.pazl_id || null
    };

    sendSSE(sessionId, 'step', { step: 5, status: 'active', message: 'Отправка тура в Pazl Tours...' });
    const result = await pazlApi.apiRequest('/tours', { method: 'POST', body: { payload: JSON.stringify(tourPayload) } });

    if (result) {
        sendSSE(sessionId, 'step', { step: 5, status: 'completed', message: 'Тур успешно создан!' });
        return true;
    } else {
        sendSSE(sessionId, 'step', { step: 5, status: 'error', message: 'Ошибка при создании тура' });
        return false;
    }
}

// ============================================
// SSE ЭНДПОИНТ
// ============================================

router.get('/stream/:sessionId', (req: Request, res: Response) => {
    const { sessionId } = req.params;
    console.log('📡 SSE подключение:', sessionId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.write(`event: connected\ndata: ${JSON.stringify({ sessionId })}\n\n`);

    const session = sessions.get(sessionId);
    if (session) {
        session.res = res;
    }

    const pingInterval = setInterval(() => {
        try { res.write(`: ping ${Date.now()}\n\n`); } catch (e) { clearInterval(pingInterval); }
    }, 15000);

    req.on('close', () => {
        console.log('📡 SSE отключен:', sessionId);
        clearInterval(pingInterval);
    });
});

// ============================================
// MAIN API РОУТ (ЗАПУСКАЕТ МИГРАЦИЮ)
// ============================================

router.post('/start', async (req: Request, res: Response) => {
    const { aviannaEmail, aviannaPassword, pazlEmail, pazlPassword, tourName } = req.body;

    if (!aviannaEmail || !aviannaPassword || !pazlEmail || !pazlPassword || !tourName) {
        return res.status(400).json({ success: false, error: 'Все поля обязательны' });
    }

    const sessionId = `migrate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    sessions.set(sessionId, {
        res: null as any,
        status: 'starting',
        log: []
    });

    // Возвращаем sessionId сразу
    res.json({ success: true, data: { sessionId } });

    // Запускаем миграцию асинхронно
    runMigration(sessionId, aviannaEmail, aviannaPassword, pazlEmail, pazlPassword, tourName).catch(err => {
        console.error('Migration error:', err);
        sendSSE(sessionId, 'error', { message: err.message });
    });
});

// ============================================
// ВЫПОЛНЕНИЕ МИГРАЦИИ
// ============================================

async function runMigration(
    sessionId: string,
    aviannaEmail: string, aviannaPassword: string,
    pazlEmail: string, pazlPassword: string,
    tourName: string
) {
    let browser: any = null;

    try {
        sendSSE(sessionId, 'step', { step: 0, status: 'active', message: 'Запуск браузера...' });

        browser = await chromium.launch({
            headless: true,
            executablePath: '/snap/bin/chromium',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });

        const context = await browser.newContext();

        // Шаг 0: Вход в Avianna
        sendSSE(sessionId, 'step', { step: 0, status: 'active', message: 'Вход в Avianna...' });
        const aviannaPage = await context.newPage();
        await aviannaPage.goto('https://manager.avianna24.ru/auth');
        await aviannaPage.waitForTimeout(2000);
        await aviannaPage.fill('input[type="text"]', aviannaEmail);
        await aviannaPage.fill('input[type="password"]', aviannaPassword);
        await aviannaPage.click('#kt_login_singin_form_submit_button');
        await aviannaPage.waitForTimeout(5000);

        if (aviannaPage.url().includes('/auth')) {
            sendSSE(sessionId, 'step', { step: 0, status: 'error', message: 'Неверный email или пароль Avianna' });
            await browser.close();
            return;
        }

        sendSSE(sessionId, 'step', { step: 0, status: 'completed', message: 'Вход в Avianna выполнен' });
        const aviannaApi = new AviannaApiClient(aviannaPage);

        // Шаг 1: Поиск и загрузка тура
        sendSSE(sessionId, 'step', { step: 1, status: 'active', message: `Поиск тура: "${tourName}"` });
        const toursResult = await aviannaApi.getTours(tourName);

        if (!toursResult?.data || toursResult.data.length === 0) {
            sendSSE(sessionId, 'step', { step: 1, status: 'error', message: `Тур "${tourName}" не найден` });
            await browser.close();
            return;
        }

        const tourBasic = toursResult.data.find((t: any) => t.name === tourName) || toursResult.data[0];
        const tourData = await extractTourData(aviannaApi, tourBasic.id, sessionId);

        if (!tourData) {
            sendSSE(sessionId, 'step', { step: 1, status: 'error', message: 'Не удалось загрузить данные' });
            await browser.close();
            return;
        }

        await aviannaPage.close();

        // Шаг 2: Вход в Pazl
        sendSSE(sessionId, 'step', { step: 2, status: 'active', message: 'Вход в Pazl Tours...' });
        const pazlPage = await context.newPage();
        const pazlLoggedIn = await loginToPazl(pazlPage, pazlEmail, pazlPassword);

        if (!pazlLoggedIn) {
            sendSSE(sessionId, 'step', { step: 2, status: 'error', message: 'Неверный email или пароль Pazl' });
            await browser.close();
            return;
        }

        sendSSE(sessionId, 'step', { step: 2, status: 'completed', message: 'Вход в Pazl выполнен' });
        const pazlApi = new PazlApiClient(pazlPage);

        // Шаг 3: Маппинг
        const { mappings, stats } = await performMapping(pazlApi, tourData, sessionId);

        // Шаг 4: Создание сущностей
        const createdEntities = await createMissingEntities(pazlApi, mappings, tourData, sessionId);

        // Шаг 5: Создание тура
        const tourCreated = await createTour(pazlApi, tourData, mappings, sessionId);

        await browser.close();

        // Финальный результат
        sendSSE(sessionId, 'result', {
            success: true,
            data: {
                tourData: { id: tourData.id, name: tourData.name },
                mappings,
                createdEntities: Array.from(createdEntities.values()),
                stats: {
                    totalToCreate: stats.totalToCreate,
                    totalExists: stats.totalExists,
                    total: stats.totalToCreate + stats.totalExists,
                    created: createdEntities.size
                },
                tourCreated,
                message: tourCreated ? 'Тур успешно создан!' : 'Маппинг выполнен, но тур не создан'
            }
        });

    } catch (error: any) {
        console.error('Migration error:', error);
        sendSSE(sessionId, 'error', { message: error.message });
        if (browser) { try { await browser.close(); } catch (e) {} }
    }
}

export default router;
