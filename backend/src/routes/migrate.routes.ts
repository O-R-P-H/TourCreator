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
// API КЛИЕНТ AVIANNA
// ============================================

class AviannaApiClient {
    private cache = new Map<string, any>();

    constructor(private page: any) {}

    private async fetchApi<T>(url: string): Promise<T | null> {
        const cacheKey = url;

        if (this.cache.has(cacheKey)) {
            console.log(`      📦 Avianna кеш: ${url}`);
            return this.cache.get(cacheKey) as T;
        }

        const fullUrl = url.startsWith('http') ? url : `https://gate.avianna24.ru/api${url}`;

        try {
            console.log(`      🌐 Avianna запрос: ${fullUrl}`);

            const result = await Promise.race([
                this.page.evaluate(async (fetchUrl: string) => {
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

                        if (!response.ok) {
                            return null;
                        }

                        return response.json();
                    } catch (e: any) {
                        clearTimeout(timeoutId);
                        console.error('Avianna fetch error:', e.message);
                        return null;
                    }
                }, fullUrl),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Avianna API timeout')), 35000)
                )
            ]);

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
            if (city) {
                return city.name;
            }
        }
        return null;
    }

    async getCategoryName(categoryId: number): Promise<string | null> {
        const categories = await this.fetchApi<any>('/tours/excursion/categories');
        if (categories?.data) {
            const category = categories.data.find((c: any) => c.id === categoryId);
            if (category) {
                return category.name;
            }
        }
        return null;
    }

    async getTourServiceName(serviceId: number): Promise<string | null> {
        const toursData = await this.fetchApi<any>('/tours/data');
        if (toursData?.services) {
            const service = toursData.services.find((s: any) => s.id === serviceId);
            if (service) {
                return service.name;
            }
        }

        const service = await this.fetchApi<any>(`/tours/services/${serviceId}`);
        if (service?.name) {
            return service.name;
        }

        return null;
    }

    async getTourServiceFull(serviceId: number): Promise<any | null> {
        return this.fetchApi(`/tours/services/${serviceId}`);
    }
}

// ============================================
// ИЗВЛЕЧЕНИЕ ДАННЫХ ИЗ AVIANNA
// ============================================

async function extractTourData(api: AviannaApiClient, tourId: number): Promise<any> {
    console.log(`\n  📥 Загрузка тура ID: ${tourId}`);
    const tour = await api.getTour(tourId);

    if (!tour) {
        console.log('  ❌ Не удалось загрузить тур');
        return null;
    }

    console.log(`  ✅ Тур: ${tour.name}`);

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
        console.log(`\n  🚌 Загрузка транспорта ID: ${tour.transport_forth_id}`);
        const transport = await api.getTransport(tour.transport_forth_id);
        if (transport) {
            result.transport_forth = transport;
            console.log(`    ✅ ${transport.name}`);

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
        console.log(`\n  🚌 Загрузка обратного транспорта ID: ${tour.transport_back_id}`);
        const transport = await api.getTransport(tour.transport_back_id);
        if (transport) {
            result.transport_back = transport;
            console.log(`    ✅ ${transport.name}`);
        }
    }

    if (tour.hotels && tour.hotels.length > 0) {
        console.log(`\n  🏨 Загрузка гостиниц (${tour.hotels.length})`);
        result.hotels = [];

        for (const hotelRef of tour.hotels) {
            console.log(`    Загрузка гостиницы ID: ${hotelRef.id}`);
            const hotel = await api.getHotel(hotelRef.id);

            if (hotel) {
                result.hotels.push({
                    ...hotel,
                    arrival_day: hotelRef.arrival_day,
                    departure_day: hotelRef.departure_day,
                    meal_id: hotelRef.meal_id,
                });
                console.log(`      ✅ ${hotel.name} (${hotel.rooms?.length || 0} номеров)`);
            }
        }
    }

    const serviceIds = new Set<number>();
    [...(tour.services || []), ...(tour.required_services || []), ...(tour.additional_services || [])].forEach((s: any) => {
        if (s.id) serviceIds.add(s.id);
    });

    if (serviceIds.size > 0) {
        console.log(`\n  🛠️ Загрузка информации об услугах (${serviceIds.size})`);
        result.services_data = {};

        for (const serviceId of serviceIds) {
            const serviceData = await api.getTourServiceFull(serviceId);
            if (serviceData) {
                result.services_data[serviceId] = serviceData;
                console.log(`    ✅ Услуга ID ${serviceId}: ${serviceData.name || 'без названия'}`);
            }
        }
    }

    console.log(`\n  ✅ Данные тура "${tour.name}" загружены полностью`);
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
        console.log(`      🔑 XSRF токен: ${this.xsrfToken ? 'получен' : 'НЕ НАЙДЕН!'}`);
    }

    async apiRequest<T>(url: string, options?: { method?: string; body?: any }): Promise<T | null> {
        await this.init();

        const fullUrl = url.startsWith('http') ? url : `https://gate.pazltours.online/api${url}`;
        const method = options?.method || 'GET';

        console.log(`      🌐 Pazl ${method}: ${fullUrl}`);

        try {
            const result = await Promise.race([
                this.page.evaluate(async (params: {
                    fetchUrl: string;
                    fetchMethod: string;
                    fetchBody?: any;
                    xsrfToken: string;
                }) => {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 30000);

                    try {
                        const headers: Record<string, string> = {
                            'Accept': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                            'X-XSRF-TOKEN': params.xsrfToken
                        };

                        if (params.fetchMethod !== 'GET') {
                            headers['Content-Type'] = 'application/json';
                        }

                        const fetchOptions: RequestInit = {
                            method: params.fetchMethod,
                            headers: headers,
                            credentials: 'include',
                            signal: controller.signal
                        };

                        if (params.fetchMethod !== 'GET' && params.fetchBody) {
                            fetchOptions.body = JSON.stringify(params.fetchBody);
                        }

                        const response = await fetch(params.fetchUrl, fetchOptions);
                        clearTimeout(timeoutId);

                        if (!response.ok) {
                            const errorText = await response.text();
                            return {
                                __error: true,
                                __status: response.status,
                                __statusText: response.statusText,
                                __body: errorText
                            };
                        }

                        const text = await response.text();
                        if (!text) {
                            return { status: 'OK' };
                        }

                        try {
                            return JSON.parse(text);
                        } catch {
                            return { status: 'OK', data: text };
                        }
                    } catch (e: any) {
                        clearTimeout(timeoutId);
                        return {
                            __error: true,
                            __status: 0,
                            __statusText: 'Fetch error',
                            __body: e.message
                        };
                    }
                }, {
                    fetchUrl: fullUrl,
                    fetchMethod: method,
                    fetchBody: options?.body,
                    xsrfToken: this.xsrfToken
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Pazl API timeout')), 35000)
                )
            ]);

            if (result?.__error) {
                console.log(`      ❌ API Error ${result.__status}: ${result.__body}`);
                return null;
            }

            console.log(`      ✅ Ответ получен`);
            return result as T;
        } catch (error: any) {
            console.log(`      ⚠️ Ошибка Pazl: ${url} - ${error.message}`);
            return null;
        }
    }

    async findEntity(endpoint: string, name: string): Promise<{ id: number; name: string } | null> {
        if (!name) return null;

        console.log(`      🔍 Поиск: ${endpoint}?query=${encodeURIComponent(name)}`);
        const result = await this.apiRequest<any>(`${endpoint}?query=${encodeURIComponent(name)}&limit=10`);

        if (result?.data && Array.isArray(result.data) && result.data.length > 0) {
            const exactMatch = result.data.find((item: any) => item.name === name);
            if (exactMatch) {
                console.log(`      ✅ Точное: ${exactMatch.name} (ID: ${exactMatch.id})`);
                return { id: exactMatch.id, name: exactMatch.name };
            }
            console.log(`      ✅ Похожее: ${result.data[0].name} (ID: ${result.data[0].id})`);
            return { id: result.data[0].id, name: result.data[0].name };
        }

        console.log(`      ❌ Не найдено`);
        return null;
    }

    async findCity(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/cities', name);
    }

    async findTransportation(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/transportation', name);
    }

    async findTransport(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/transports', name);
    }

    async findHotelMeal(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/hotels/meals', name);
    }

    async findHotelAccommodation(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/hotels/accommodations', name);
    }

    async findHotelInfrastructureType(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/hotels/infrastructure-types', name);
    }

    async findHotelInfrastructure(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/hotels/infrastructures', name);
    }

    async findRoomType(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/hotels/rooms/types', name);
    }

    async findRoomPlace(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/hotels/rooms/places', name);
    }

    async findRoomDescription(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/hotels/rooms/descriptions', name);
    }

    async findRoomService(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/hotels/rooms/services', name);
    }

    async findRoomEquipment(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/hotels/rooms/equipment', name);
    }

    async findRoomFurniture(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/hotels/rooms/furniture', name);
    }

    async findRoomBathroom(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/hotels/rooms/bathroom', name);
    }

    async findHotel(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/hotels', name);
    }

    async findTourCategory(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/tours/excursion/categories', name);
    }

    async findTourService(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/tours/services', name);
    }

    async findCatalogSection(name: string): Promise<{ id: number; name: string } | null> {
        return this.findEntity('/catalog-sections', name);
    }

    async createCity(name: string): Promise<any> {
        console.log(`      🏙️ Создание города: ${name}`);
        const body = {
            name: name,
            country_id: 1,
            near_cities: [],
            railway_transfer_cities: [],
            aviation_transfer_cities: [],
            seo_settings: {
                meta: {},
                hotel: {
                    meta: {},
                    description: null,
                    bottom_block: { text: null },
                    faq: []
                },
                bus_tickets: {
                    meta: {},
                    description: null,
                    bottom_block: { text: null },
                    faq: [],
                    advantages: []
                }
            },
            catalog: {}
        };
        return this.apiRequest('/cities', { method: 'POST', body });
    }

    async createTransportation(name: string): Promise<any> {
        console.log(`      🚌 Создание типа транспорта: ${name}`);
        const body = {
            columns_at_door: 2,
            rear_seats: 4,
            kind: 1,
            name: name,
            seats: 35,
            rows: 4,
            second_door: true,
            second_door_rows: 3,
            second_door_length: 12
        };
        return this.apiRequest('/transportation', { method: 'POST', body });
    }

    async createTransport(transportationId: number, name: string, data: any, citiesMap: Map<number, number>): Promise<any> {
        console.log(`      🚌 Создание транспорта: ${name}`);
        const routes: any = {
            start: {
                info: data.transport_forth?.routes?.start?.info || null,
                point_city_id: data.transport_forth?.routes?.start?.point_city_id
                    ? citiesMap.get(data.transport_forth.routes.start.point_city_id) || data.transport_forth.routes.start.point_city_id
                    : null,
                start_time: data.transport_forth?.routes?.start?.start_time || '10:00',
                finish_time: null
            },
            intermediates: [],
            finish: {
                info: data.transport_forth?.routes?.finish?.info || null,
                point_city_id: data.transport_forth?.routes?.finish?.point_city_id
                    ? citiesMap.get(data.transport_forth.routes.finish.point_city_id) || data.transport_forth.routes.finish.point_city_id
                    : null,
                start_time: null,
                finish_time: data.transport_forth?.routes?.finish?.finish_time || '11:00'
            }
        };

        if (data.transport_forth?.routes?.intermediates) {
            for (const point of data.transport_forth.routes.intermediates) {
                const pcid = citiesMap.get(point.point_city_id) || point.point_city_id;
                routes.intermediates.push({
                    point_city_id: pcid,
                    info: point.info || null,
                    finish_time: point.finish_time || '',
                    start_time: point.start_time || '',
                    arrival_day: point.arrival_day || 1,
                    departure_day: point.departure_day || 1,
                    tariffs: [],
                    can_delete: true
                });
            }
        }

        const allCityIds = new Set<number>();
        if (routes.start.point_city_id) allCityIds.add(routes.start.point_city_id);
        if (routes.finish.point_city_id) allCityIds.add(routes.finish.point_city_id);
        routes.intermediates.forEach((p: any) => {
            if (p.point_city_id) allCityIds.add(p.point_city_id);
        });

        const cityArray = Array.from(allCityIds);
        const tariffs: any[] = [];
        for (const fromCity of cityArray) {
            for (const toCity of cityArray) {
                tariffs.push({
                    from_city_id: fromCity,
                    to_city_id: toCity,
                    tariff: 0
                });
            }
        }

        const dates = data.transport_forth?.dates?.map((d: any) => d.start_date) || [];

        const payload = {
            transportation_id: transportationId,
            vendor_id: 2,
            name: name,
            duration: data.transport_forth?.duration?.toString() || "1",
            adult_price: data.transport_forth?.adult_price || "0",
            child_price: data.transport_forth?.child_price || "0",
            start_date: data.transport_forth?.start_date || dates[0] || "2026-01-01",
            finish_date: data.transport_forth?.finish_date || dates[dates.length - 1] || "2026-12-31",
            departure_type: data.transport_forth?.departure_type || 1,
            is_excursion: true,
            application_auto_confirm: false,
            auto_confirm_status: null,
            days: [],
            dates: dates.map((d: string) => ({
                id: null,
                start_date: d,
                commission_type: 1,
                commission_sum: 0,
                freight: 0
            })),
            routes: routes,
            tariffs: tariffs,
            catalog: {
                title: null,
                price: 0,
                image: null,
                sort: 0,
                seo_settings: {
                    meta: { h1: null, title: null, description: null },
                    advantages: [],
                    faq: [],
                    top_block: { title: null, text: null },
                    bottom_block: { title: null, text: null }
                }
            }
        };

        return this.apiRequest('/transports', { method: 'POST', body: { payload: JSON.stringify(payload) } });
    }

    async createTourCategory(name: string): Promise<any> {
        console.log(`      📁 Создание категории: ${name}`);
        return this.apiRequest('/tours/excursion/categories', { method: 'POST', body: { name } });
    }

    async createHotelMeal(name: string): Promise<any> {
        console.log(`      🍽️ Создание питания: ${name}`);
        return this.apiRequest('/hotels/meals', { method: 'POST', body: { id: null, name, category_type: 1 } });
    }

    async createHotelAccommodation(name: string): Promise<any> {
        console.log(`      🏨 Создание размещения: ${name}`);
        return this.apiRequest('/hotels/accommodations', { method: 'POST', body: { name } });
    }

    async createHotelInfrastructureType(name: string): Promise<any> {
        console.log(`      🏗️ Создание типа инфраструктуры: ${name}`);
        return this.apiRequest('/hotels/infrastructure-types', { method: 'POST', body: { name } });
    }

    async createHotelInfrastructure(name: string, typeId: number): Promise<any> {
        console.log(`      🏗️ Создание инфраструктуры: ${name} (тип: ${typeId})`);
        return this.apiRequest('/hotels/infrastructures', {
            method: 'POST',
            body: { is_filter: true, is_point_filter: false, name, infrastructure_type_id: typeId }
        });
    }

    async createRoomType(name: string): Promise<any> {
        console.log(`      🛏️ Создание типа номера: ${name}`);
        return this.apiRequest('/hotels/rooms/types', { method: 'POST', body: { name } });
    }

    async createRoomPlace(name: string): Promise<any> {
        console.log(`      📍 Создание места размещения: ${name}`);
        return this.apiRequest('/hotels/rooms/places', {
            method: 'POST',
            body: { name, places_count: "2", adv_places_count: "0" }
        });
    }

    async createRoomDescription(name: string): Promise<any> {
        console.log(`      📝 Создание описания номера: ${name}`);
        return this.apiRequest('/hotels/rooms/descriptions', { method: 'POST', body: { name } });
    }

    async createRoomService(name: string): Promise<any> {
        console.log(`      🛠️ Создание услуги номера: ${name}`);
        return this.apiRequest('/hotels/rooms/services', { method: 'POST', body: { name } });
    }

    async createRoomEquipment(name: string): Promise<any> {
        console.log(`      🔧 Создание оборудования: ${name}`);
        return this.apiRequest('/hotels/rooms/equipment', { method: 'POST', body: { name } });
    }

    async createRoomFurniture(name: string): Promise<any> {
        console.log(`      🪑 Создание мебели: ${name}`);
        return this.apiRequest('/hotels/rooms/furniture', { method: 'POST', body: { name } });
    }

    async createRoomBathroom(name: string): Promise<any> {
        console.log(`      🚿 Создание ванной: ${name}`);
        return this.apiRequest('/hotels/rooms/bathroom', { method: 'POST', body: { name } });
    }

    async createTourService(name: string, serviceClass: string = 'group', dates: any[] = []): Promise<any> {
        console.log(`      🛠️ Создание услуги тура: ${name} (класс: ${serviceClass})`);
        const serviceDates = dates.length > 0 ? dates : [{
            id: null,
            from: "2026-01-01",
            to: "2026-12-31",
            vendor_price: "0",
            adult_price: "0",
            child_prices: [],
            commission_adult_type: 1,
            commission_adult_sum: 0,
            commission_child_type: 1,
            commission_child_sum: 0
        }];

        return this.apiRequest('/tours/services', {
            method: 'POST',
            body: {
                name,
                class: serviceClass,
                vendor_id: 2,
                is_dealer_vendor: false,
                description: name,
                dates: serviceDates
            }
        });
    }

    async createHotel(hotelName: string, hotelData: any, mappings: any): Promise<any> {
        console.log(`      🏨 Создание гостиницы: ${hotelName}`);
        let cityId = null;

        const cityMapping = mappings.cities.find((c: MappedEntity) => c.source_id === hotelData.city?.id);
        if (cityMapping && !cityMapping.needs_creation) {
            cityId = cityMapping.pazl_id;
        }

        if (!cityId && hotelData.city?.name) {
            const foundCity = await this.findCity(hotelData.city.name);
            if (foundCity) {
                cityId = foundCity.id;
            }
        }

        if (!cityId && hotelData.city?.name) {
            console.log(`      🏙️ Город "${hotelData.city.name}" не найден, создаём...`);
            const createResult = await this.createCity(hotelData.city.name);
            if (createResult) {
                const newCity = await this.findCity(hotelData.city.name);
                if (newCity) {
                    cityId = newCity.id;
                    console.log(`      ✅ Город "${hotelData.city.name}" создан (ID: ${newCity.id})`);
                }
            }
        }

        if (!cityId) {
            console.log(`      ⚠️ Не удалось определить город для гостиницы "${hotelName}"`);
            return null;
        }

        const meals: any[] = [];
        if (hotelData.meals) {
            for (const meal of hotelData.meals) {
                const mealMapping = mappings.hotel_meals.find((m: MappedEntity) => m.source_id === meal.id);
                if (mealMapping && !mealMapping.needs_creation) {
                    meals.push({ id: mealMapping.pazl_id, sum: meal.sum || "0" });
                }
            }
        }

        const infrastructures: any[] = [];
        if (hotelData.infrastructures && hotelData.infrastructures.length > 0) {
            for (const infra of hotelData.infrastructures) {
                let infraId = null;
                let typeId = null;

                const infraMapping = mappings.hotel_infrastructures.find(
                    (i: MappedEntity) => i.source_id === infra.id
                );
                if (infraMapping && !infraMapping.needs_creation) {
                    infraId = infraMapping.pazl_id;
                }

                if (infra.infrastructure_type?.id) {
                    const typeMapping = mappings.hotel_infrastructure_types.find(
                        (t: MappedEntity) => t.source_id === infra.infrastructure_type.id
                    );
                    if (typeMapping && !typeMapping.needs_creation) {
                        typeId = typeMapping.pazl_id;
                    }
                }
                if (!typeId && infra.infrastructure_type_id) {
                    const typeMapping = mappings.hotel_infrastructure_types.find(
                        (t: MappedEntity) => t.source_id === infra.infrastructure_type_id
                    );
                    if (typeMapping && !typeMapping.needs_creation) {
                        typeId = typeMapping.pazl_id;
                    }
                }

                if (infraId && typeId) {
                    infrastructures.push({
                        id: infraId,
                        pay: infra.pay || 0,
                        type: typeId
                    });
                    console.log(`      ✅ Инфраструктура: ${infra.name} (ID: ${infraId}, тип: ${typeId})`);
                }
            }
        }

        if (infrastructures.length === 0) {
            console.log(`      ⚠️ Гостиница без инфраструктур, создаём базовую...`);

            let typeId = 1;
            let typeFound = await this.findHotelInfrastructureType('Удобства');
            if (!typeFound) {
                await this.createHotelInfrastructureType('Удобства');
                typeFound = await this.findHotelInfrastructureType('Удобства');
            }
            if (typeFound) {
                typeId = typeFound.id;
            }

            let infraFound = await this.findHotelInfrastructure('Огороженная территория');
            if (!infraFound) {
                await this.createHotelInfrastructure('Огороженная территория', typeId);
                infraFound = await this.findHotelInfrastructure('Огороженная территория');
            }
            if (infraFound) {
                infrastructures.push({
                    id: infraFound.id,
                    pay: 0,
                    type: typeId
                });
            }
        }

        const rooms: any[] = [];
        if (hotelData.rooms) {
            for (const room of hotelData.rooms) {
                const accommodationMapping = mappings.hotel_accommodations.find(
                    (a: MappedEntity) => a.source_id === room.accommodation?.id
                );
                const typeMapping = mappings.room_types.find((t: MappedEntity) => t.source_id === room.type?.id);
                const placeMapping = mappings.room_places.find((p: MappedEntity) => p.source_id === room.place?.id);
                const descriptionMapping = mappings.room_descriptions.find(
                    (d: MappedEntity) => d.source_id === room.description?.id
                );

                if (accommodationMapping && typeMapping && placeMapping && descriptionMapping &&
                    !accommodationMapping.needs_creation && !typeMapping.needs_creation &&
                    !placeMapping.needs_creation && !descriptionMapping.needs_creation) {

                    const roomMeals: any[] = [];
                    if (room.meals) {
                        for (const meal of room.meals) {
                            const mealMapping = mappings.hotel_meals.find((m: MappedEntity) => m.source_id === meal.id);
                            if (mealMapping && !mealMapping.needs_creation) {
                                roomMeals.push(mealMapping.pazl_id);
                            }
                        }
                    }

                    rooms.push({
                        accommodation_id: accommodationMapping.pazl_id,
                        type_id: typeMapping.pazl_id,
                        place_id: placeMapping.pazl_id,
                        quota: room.quota || false,
                        quota_count: room.quota_count || null,
                        adult_count: room.adult_count?.toString() || "0",
                        child_count: room.child_count?.toString() || "0",
                        adult_price: room.adult_price || "",
                        child_price: room.child_price || "",
                        child_without: room.child_without || false,
                        is_children_in_adult_places: room.is_children_in_adult_places || true,
                        is_children_in_adv_adult_places: room.is_children_in_adv_adult_places || false,
                        child_without_price: room.child_without_price || "",
                        adv_adult_count: room.adv_adult_count?.toString() || "0",
                        adv_child_count: room.adv_child_count?.toString() || "0",
                        adv_adult_price: room.adv_adult_price || "",
                        adv_child_price: room.adv_child_price || "",
                        photos: [],
                        name: room.name || "",
                        meals: roomMeals,
                        premises: [],
                        area: room.area || null,
                        dates: room.dates?.map((d: any) => ({
                            id: null,
                            from: d.from || "2026-01-01",
                            to: d.to || "2026-12-31",
                            is_total_price: d.is_total_price || true,
                            total_price: d.total_price?.toString() || "0",
                            adult_price: d.adult_price || "0",
                            child_price: d.child_price || "0",
                            child_without_price: d.child_without_price || "0",
                            adv_adult_price: d.adv_adult_price || "0",
                            adv_child_price: d.adv_child_price || "0",
                            commission_general_sum: d.commission_general_sum?.toString() || "0",
                            is_differentiate: d.is_differentiate || true,
                            commission_adult_type: d.commission_adult_type || 1,
                            commission_adult_sum: d.commission_adult_sum || 0,
                            commission_child_type: d.commission_child_type || 1,
                            commission_child_sum: d.commission_child_sum || 0,
                            commission_adv_adult_type: d.commission_adv_adult_type || 1,
                            commission_adv_adult_sum: d.commission_adv_adult_sum || 0,
                            commission_adv_child_type: d.commission_adv_child_type || 1,
                            commission_adv_child_sum: d.commission_adv_child_sum || 0,
                            commission_child_without_place_type: d.commission_child_without_place_type || 1,
                            commission_child_without_place_sum: d.commission_child_without_place_sum || 0
                        })) || [],
                        description_id: descriptionMapping.pazl_id,
                        place: {
                            id: placeMapping.pazl_id,
                            name: placeMapping.pazl_name,
                            places_count: room.place?.places_count || 2,
                            adv_places_count: room.place?.adv_places_count || 0
                        },
                        services: [],
                        r_services: [],
                        r_equipments: [],
                        r_furnitures: [],
                        r_bathrooms: [],
                        children_ages: [],
                        children_ages_without_place: [],
                        adv_children_ages: [],
                        in_adult_places_children_ages: [],
                        in_adv_adult_places_children_ages: [],
                        type: {
                            id: typeMapping.pazl_id,
                            name: typeMapping.pazl_name
                        },
                        description: {
                            id: descriptionMapping.pazl_id,
                            name: descriptionMapping.pazl_name
                        }
                    });
                }
            }
        }

        const payload = {
            departure_time: hotelData.departure_time || "12:00",
            promotion_id: null,
            desc_files: [],
            memo_files: [],
            photos: [],
            videos: [],
            meals: meals,
            commission_general_sum: hotelData.commission_general_sum?.toString() || "0",
            is_differentiate: hotelData.is_differentiate || false,
            commission_adult_type: hotelData.commission_adult_type || 1,
            commission_adult_sum: hotelData.commission_adult_sum || 0,
            commission_child_type: hotelData.commission_child_type || 1,
            commission_child_sum: hotelData.commission_child_sum || 0,
            commission_adv_adult_type: hotelData.commission_adv_adult_type || 1,
            commission_adv_adult_sum: hotelData.commission_adv_adult_sum || 0,
            commission_adv_child_type: hotelData.commission_adv_child_type || 1,
            commission_adv_child_sum: hotelData.commission_adv_child_sum || 0,
            commission_child_without_place_type: hotelData.commission_child_without_place_type || 1,
            commission_child_without_place_sum: hotelData.commission_child_without_place_sum || 0,
            commission_meal_type: hotelData.commission_meal_type || 1,
            commission_meal_sum: hotelData.commission_meal_sum || 0,
            vendor_id: hotelData.vendor_id || 2,
            dealer_id: null,
            description: hotelData.description || "",
            info: hotelData.info || null,
            is_excursion: hotelData.is_excursion || true,
            catalog_sections: [],
            catalog: { sort: 0, sum: 0 },
            coords: null,
            is_search_priority: hotelData.is_search_priority || false,
            application_auto_confirm: hotelData.application_auto_confirm || false,
            auto_confirm_status: null,
            status: hotelData.status || 1,
            stars: hotelData.stars || null,
            rating: hotelData.rating || null,
            city_id: cityId,
            name: hotelName,
            address: hotelData.address || "",
            category_type: hotelData.category_type || 1,
            arrival_time: hotelData.arrival_time || "12:00",
            services: [],
            infrastructures: infrastructures,
            rooms: rooms
        };

        return this.apiRequest('/hotels', { method: 'POST', body: { payload: JSON.stringify(payload) } });
    }
}

// ============================================
// ВХОД В PAZL TOURS
// ============================================

async function loginToPazl(page: any, email: string, password: string): Promise<boolean> {
    console.log('\n  🔄 Вход в Pazl Tours...');

    await page.goto('https://manager.pazltours.online/auth');
    await page.waitForTimeout(3000);

    const emailInput = await page.$('input[type="text"]') || await page.$('input[name="login"]');
    const passwordInput = await page.$('input[type="password"]');

    if (!emailInput || !passwordInput) {
        console.log('  ❌ Поля ввода не найдены');
        return false;
    }

    await emailInput.fill(email);
    await passwordInput.fill(password);

    const submitButton = await page.$('button[type="submit"]');
    if (submitButton) {
        await submitButton.click();
    } else {
        await passwordInput.press('Enter');
    }

    await page.waitForTimeout(5000);

    const isLoggedIn = page.url().includes('/welcome') || page.url().includes('/dashboard');

    if (isLoggedIn) {
        console.log('  ✅ Вход в Pazl Tours выполнен!');
        return true;
    } else {
        console.log('  ❌ Не удалось войти');
        return false;
    }
}

// ============================================
// МАППИНГ
// ============================================

async function performMapping(
    aviannaApi: AviannaApiClient,
    pazlApi: PazlApiClient,
    tourData: any
): Promise<any> {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 ПОИСК СООТВЕТСТВИЙ В PAZL TOURS');
    console.log('='.repeat(80));

    const mappings: any = {
        cities: [] as MappedEntity[],
        transportations: [] as MappedEntity[],
        transports: [] as MappedEntity[],
        hotel_meals: [] as MappedEntity[],
        hotel_accommodations: [] as MappedEntity[],
        hotel_infrastructure_types: [] as MappedEntity[],
        hotel_infrastructures: [] as MappedEntity[],
        room_types: [] as MappedEntity[],
        room_places: [] as MappedEntity[],
        room_descriptions: [] as MappedEntity[],
        room_services: [] as MappedEntity[],
        room_equipments: [] as MappedEntity[],
        room_furnitures: [] as MappedEntity[],
        room_bathrooms: [] as MappedEntity[],
        hotels: [] as MappedEntity[],
        tour_categories: [] as MappedEntity[],
        tour_services: [] as MappedEntity[],
        catalog_sections: [] as MappedEntity[],
    };

    const mapEntity = async (
        sourceId: number,
        sourceName: string,
        pazlFindMethod: (name: string) => Promise<{ id: number; name: string } | null>,
        targetArray: MappedEntity[],
        label: string,
        sourceType?: string
    ) => {
        console.log(`    🔍 "${label}" -> Pazl: "${sourceName}"`);
        try {
            const found = await pazlFindMethod(sourceName);
            targetArray.push({
                source_id: sourceId,
                source_name: sourceName,
                source_type: sourceType,
                pazl_id: found?.id || null,
                pazl_name: found?.name || null,
                needs_creation: !found
            });
            const status = found ? '✅' : '⚠️';
            console.log(`    ${status} ${label}: ${sourceName} -> ${found?.name || 'НЕ НАЙДЕН'}${found ? ` (ID: ${found.id})` : ''}`);
        } catch (error: any) {
            console.log(`    ❌ Ошибка поиска "${label}": ${error.message}`);
            targetArray.push({
                source_id: sourceId,
                source_name: sourceName,
                source_type: sourceType,
                pazl_id: null,
                pazl_name: null,
                needs_creation: true
            });
        }
    };

    // 1. Города
    console.log('\n  🏙️ Сбор городов из данных тура...');
    const cityIds = new Set<number>();
    if (tourData.transport_forth?.routes) {
        const routes = tourData.transport_forth.routes;
        const addCityId = (point: any) => {
            if (point?.point_city_id) cityIds.add(point.point_city_id);
        };
        addCityId(routes.start);
        addCityId(routes.finish);
        routes.intermediates?.forEach(addCityId);
    }

    tourData.hotels?.forEach((hotel: any) => {
        if (hotel.city?.id) {
            cityIds.add(hotel.city.id);
        }
    });

    console.log(`  Найдено уникальных городов: ${cityIds.size}`);

    if (cityIds.size > 0) {
        console.log('  Получение названий городов и маппинг...');
        for (const cityId of cityIds) {
            const hotelWithCity = tourData.hotels?.find((h: any) => h.city?.id === cityId);
            if (hotelWithCity?.city?.name) {
                await mapEntity(cityId, hotelWithCity.city.name,
                    (name) => pazlApi.findCity(name),
                    mappings.cities, hotelWithCity.city.name);
            } else {
                const transportPoint = tourData.transport_forth?.routes;
                let cityName = null;
                if (transportPoint) {
                    if (transportPoint.start?.point_city_id === cityId && transportPoint.start?.info) {
                        cityName = transportPoint.start.info;
                    } else if (transportPoint.finish?.point_city_id === cityId && transportPoint.finish?.info) {
                        cityName = transportPoint.finish.info;
                    } else {
                        const intermediate = transportPoint.intermediates?.find((p: any) => p.point_city_id === cityId);
                        if (intermediate?.info) cityName = intermediate.info;
                    }
                }
                if (cityName) {
                    await mapEntity(cityId, cityName,
                        (name) => pazlApi.findCity(name),
                        mappings.cities, cityName);
                } else {
                    console.log(`    ⚠️ Город ID ${cityId} - нет названия`);
                }
            }
        }
    }

    // 2. Тип транспорта
    if (tourData.transport_forth?.transportation) {
        console.log('\n  🚌 Тип транспорта:');
        const t = tourData.transport_forth.transportation;
        await mapEntity(t.id, t.name,
            (name) => pazlApi.findTransportation(name),
            mappings.transportations, t.name);
    }

    // 3. Транспортный маршрут
    if (tourData.transport_forth) {
        console.log('\n  🚌 Транспортный маршрут:');
        const t = tourData.transport_forth;
        await mapEntity(t.id, t.name,
            (name) => pazlApi.findTransport(name),
            mappings.transports, t.name);
    }

    if (tourData.transport_back) {
        console.log('\n  🚌 Обратный транспортный маршрут:');
        const t = tourData.transport_back;
        await mapEntity(t.id, t.name,
            (name) => pazlApi.findTransport(name),
            mappings.transports, t.name);
    }

    // 4. Категория тура
    if (tourData.category_id) {
        console.log('\n  📁 Категория тура:');
        const categoryName = await aviannaApi.getCategoryName(tourData.category_id);
        if (categoryName) {
            await mapEntity(tourData.category_id, categoryName,
                (name) => pazlApi.findTourCategory(name),
                mappings.tour_categories, categoryName);
        } else {
            console.log(`    ⚠️ Категория не найдена, используем "Автобусные туры"`);
            await mapEntity(tourData.category_id, 'Автобусные туры',
                (name) => pazlApi.findTourCategory(name),
                mappings.tour_categories, 'Автобусные туры');
        }
    }

    // 5. Гостиницы
    if (tourData.hotels) {
        console.log('\n  🏨 Гостиницы:');
        for (const hotel of tourData.hotels) {
            await mapEntity(hotel.id, hotel.name,
                (name) => pazlApi.findHotel(name),
                mappings.hotels, hotel.name);
        }
    }

    // 6. Питание в гостиницах
    const hotelMealsMap = new Map<number, string>();
    tourData.hotels?.forEach((hotel: any) => {
        hotel.meals?.forEach((meal: any) => {
            if (!hotelMealsMap.has(meal.id)) {
                hotelMealsMap.set(meal.id, meal.name);
            }
        });
    });

    if (hotelMealsMap.size > 0) {
        console.log('\n  🍽️ Питание в гостиницах:');
        for (const [id, name] of hotelMealsMap) {
            await mapEntity(id, name,
                (n) => pazlApi.findHotelMeal(n),
                mappings.hotel_meals, name);
        }
    }

    // 7. Услуги тура
    const tourServicesToFind = new Map<number, any>();

    if (tourData.services) {
        console.log('\n  🛠️ Получение названий услуг...');
        for (const service of tourData.services) {
            const serviceId = service.id;
            if (!tourServicesToFind.has(serviceId)) {
                const serviceName = await aviannaApi.getTourServiceName(serviceId);
                if (serviceName) {
                    tourServicesToFind.set(serviceId, {
                        name: serviceName,
                        type: 'service',
                        day: service.day,
                        service_class: service.service_class
                    });
                }
            }
        }
    }

    if (tourData.required_services) {
        for (const service of tourData.required_services) {
            const serviceId = service.id;
            if (!tourServicesToFind.has(serviceId)) {
                const serviceName = await aviannaApi.getTourServiceName(serviceId);
                if (serviceName) {
                    tourServicesToFind.set(serviceId, {
                        name: serviceName,
                        type: 'required_service',
                        day: service.day,
                        service_class: service.service_class
                    });
                }
            }
        }
    }

    if (tourData.additional_services) {
        for (const service of tourData.additional_services) {
            const serviceId = service.id;
            if (!tourServicesToFind.has(serviceId)) {
                const serviceName = await aviannaApi.getTourServiceName(serviceId);
                if (serviceName) {
                    tourServicesToFind.set(serviceId, {
                        name: serviceName,
                        type: 'additional_service',
                        day: service.day,
                        service_class: service.service_class
                    });
                }
            }
        }
    }

    if (tourServicesToFind.size > 0) {
        console.log('\n  🛠️ Маппинг услуг тура:');
        for (const [id, serviceData] of tourServicesToFind) {
            await mapEntity(id, serviceData.name,
                (name) => pazlApi.findTourService(name),
                mappings.tour_services,
                `${serviceData.name} (${serviceData.type})`,
                serviceData.type);
        }
    }

    // 8. Сущности из номеров гостиниц
    const accommodationsMap = new Map<number, string>();
    const infraTypesMap = new Map<number, string>();
    const infrastructuresMap = new Map<number, string>();
    const roomTypesMap = new Map<number, string>();
    const roomPlacesMap = new Map<number, string>();
    const roomDescriptionsMap = new Map<number, string>();
    const roomServicesMap = new Map<number, string>();
    const roomEquipmentsMap = new Map<number, string>();
    const roomFurnituresMap = new Map<number, string>();
    const roomBathroomsMap = new Map<number, string>();

    console.log('\n  🏨 Сбор сущностей гостиниц...');
    tourData.hotels?.forEach((hotel: any) => {
        hotel.rooms?.forEach((room: any) => {
            if (room.accommodation && !accommodationsMap.has(room.accommodation.id)) {
                accommodationsMap.set(room.accommodation.id, room.accommodation.name);
            }
            if (room.type && !roomTypesMap.has(room.type.id)) {
                roomTypesMap.set(room.type.id, room.type.name);
            }
            if (room.place && !roomPlacesMap.has(room.place.id)) {
                roomPlacesMap.set(room.place.id, room.place.name);
            }
            if (room.description && !roomDescriptionsMap.has(room.description.id)) {
                roomDescriptionsMap.set(room.description.id, room.description.name);
            }
            room.r_services?.forEach((s: any) => {
                if (!roomServicesMap.has(s.id)) roomServicesMap.set(s.id, s.name);
            });
            room.r_equipments?.forEach((e: any) => {
                if (!roomEquipmentsMap.has(e.id)) roomEquipmentsMap.set(e.id, e.name);
            });
            room.r_furnitures?.forEach((f: any) => {
                if (!roomFurnituresMap.has(f.id)) roomFurnituresMap.set(f.id, f.name);
            });
            room.r_bathrooms?.forEach((b: any) => {
                if (!roomBathroomsMap.has(b.id)) roomBathroomsMap.set(b.id, b.name);
            });
        });
        hotel.infrastructures?.forEach((infra: any) => {
            if (!infrastructuresMap.has(infra.id)) {
                infrastructuresMap.set(infra.id, infra.name);
            }
            if (infra.infrastructure_type && !infraTypesMap.has(infra.infrastructure_type.id)) {
                infraTypesMap.set(infra.infrastructure_type.id, infra.infrastructure_type.name);
            } else if (infra.infrastructure_type_id && !infraTypesMap.has(infra.infrastructure_type_id)) {
                const typeName = infra.infrastructure_type?.name || `Тип ${infra.infrastructure_type_id}`;
                infraTypesMap.set(infra.infrastructure_type_id, typeName);
            }
        });
    });

    console.log(`  Сущностей: размещений=${accommodationsMap.size}, типов инфраструктуры=${infraTypesMap.size}, инфраструктур=${infrastructuresMap.size}, типов комнат=${roomTypesMap.size}, мест=${roomPlacesMap.size}, описаний=${roomDescriptionsMap.size}, сервисов=${roomServicesMap.size}, оборудования=${roomEquipmentsMap.size}, мебели=${roomFurnituresMap.size}, ванных=${roomBathroomsMap.size}`);

    console.log('\n  🏨 Маппинг сущностей гостиниц...');

    for (const [id, name] of accommodationsMap) {
        await mapEntity(id, name, (n) => pazlApi.findHotelAccommodation(n), mappings.hotel_accommodations, name);
    }
    for (const [id, name] of infraTypesMap) {
        await mapEntity(id, name, (n) => pazlApi.findHotelInfrastructureType(n), mappings.hotel_infrastructure_types, name);
    }
    for (const [id, name] of infrastructuresMap) {
        await mapEntity(id, name, (n) => pazlApi.findHotelInfrastructure(n), mappings.hotel_infrastructures, name);
    }
    for (const [id, name] of roomTypesMap) {
        await mapEntity(id, name, (n) => pazlApi.findRoomType(n), mappings.room_types, name);
    }
    for (const [id, name] of roomPlacesMap) {
        await mapEntity(id, name, (n) => pazlApi.findRoomPlace(n), mappings.room_places, name);
    }
    for (const [id, name] of roomDescriptionsMap) {
        await mapEntity(id, name, (n) => pazlApi.findRoomDescription(n), mappings.room_descriptions, name);
    }
    for (const [id, name] of roomServicesMap) {
        await mapEntity(id, name, (n) => pazlApi.findRoomService(n), mappings.room_services, name);
    }
    for (const [id, name] of roomEquipmentsMap) {
        await mapEntity(id, name, (n) => pazlApi.findRoomEquipment(n), mappings.room_equipments, name);
    }
    for (const [id, name] of roomFurnituresMap) {
        await mapEntity(id, name, (n) => pazlApi.findRoomFurniture(n), mappings.room_furnitures, name);
    }
    for (const [id, name] of roomBathroomsMap) {
        await mapEntity(id, name, (n) => pazlApi.findRoomBathroom(n), mappings.room_bathrooms, name);
    }

    // 9. Каталоги
    if (tourData.catalog_sections && tourData.catalog_sections.length > 0) {
        console.log('\n  📂 Каталоги:');
        for (const section of tourData.catalog_sections) {
            const sectionName = section.name || `Каталог ${section.id}`;
            await mapEntity(section.id, sectionName,
                (name) => pazlApi.findCatalogSection(name),
                mappings.catalog_sections,
                sectionName);
        }
    }

    // Статистика
    console.log('\n' + '='.repeat(80));
    console.log('📊 СТАТИСТИКА');
    console.log('='.repeat(80));

    let totalToCreate = 0;
    let totalExists = 0;

    for (const [type, items] of Object.entries(mappings)) {
        const typedItems = items as MappedEntity[];
        const toCreate = typedItems.filter(i => i.needs_creation).length;
        const exists = typedItems.filter(i => !i.needs_creation).length;

        if (typedItems.length > 0) {
            const status = toCreate === 0 ? '✅' : '⚠️';
            console.log(`  ${status} ${type}: нужно создать ${toCreate}, уже есть ${exists}`);
            totalToCreate += toCreate;
            totalExists += exists;
        }
    }

    console.log(`\n  📈 ВСЕГО: нужно создать ${totalToCreate}, уже существует ${totalExists}`);
    console.log('='.repeat(80));

    return { mappings, stats: { totalToCreate, totalExists } };
}

// ============================================
// СОЗДАНИЕ НЕДОСТАЮЩИХ СУЩНОСТЕЙ
// ============================================

async function createMissingEntities(
    pazlApi: PazlApiClient,
    mappings: any,
    aviannaApi: AviannaApiClient,
    tourData: any
): Promise<Map<string, CreatedEntity>> {
    const createdEntities = new Map<string, CreatedEntity>();

    console.log('\n' + '='.repeat(80));
    console.log('🔨 СОЗДАНИЕ НЕДОСТАЮЩИХ СУЩНОСТЕЙ В PAZL TOURS');
    console.log('='.repeat(80));

    const citiesMap = new Map<number, number>();
    for (const city of mappings.cities) {
        if (!city.needs_creation && city.pazl_id) {
            citiesMap.set(city.source_id, city.pazl_id);
        }
    }

    // 1. Города
    const citiesToCreate = mappings.cities.filter((c: MappedEntity) => c.needs_creation);
    if (citiesToCreate.length > 0) {
        console.log(`\n  🏙️ Города для создания: ${citiesToCreate.length}`);
        for (const city of citiesToCreate) {
            console.log(`    Создание: ${city.source_name}`);
            const result = await pazlApi.createCity(city.source_name);
            if (result) {
                const found = await pazlApi.findCity(city.source_name);
                if (found) {
                    city.pazl_id = found.id;
                    city.pazl_name = found.name;
                    city.needs_creation = false;
                    citiesMap.set(city.source_id, found.id);
                    createdEntities.set(`city_${city.source_id}`, {
                        type: 'city',
                        source_name: city.source_name,
                        pazl_id: found.id
                    });
                    console.log(`    ✅ Создан: ${city.source_name} (ID: ${found.id})`);
                }
            }
        }
    } else {
        console.log(`\n  🏙️ Все города уже существуют`);
    }

    // 2. Категория тура
    const categoriesToCreate = mappings.tour_categories.filter((c: MappedEntity) => c.needs_creation);
    if (categoriesToCreate.length > 0) {
        console.log(`\n  📁 Категории для создания: ${categoriesToCreate.length}`);
        for (const category of categoriesToCreate) {
            console.log(`    Создание: ${category.source_name}`);
            const result = await pazlApi.createTourCategory(category.source_name);
            if (result) {
                const found = await pazlApi.findTourCategory(category.source_name);
                if (found) {
                    category.pazl_id = found.id;
                    category.pazl_name = found.name;
                    category.needs_creation = false;
                    createdEntities.set(`tour_category_${category.source_id}`, {
                        type: 'tour_category',
                        source_name: category.source_name,
                        pazl_id: found.id
                    });
                    console.log(`    ✅ Создана: ${category.source_name} (ID: ${found.id})`);
                }
            }
        }
    }

    // 3. Питание в гостиницах
    const mealsToCreate = mappings.hotel_meals.filter((m: MappedEntity) => m.needs_creation);
    if (mealsToCreate.length > 0) {
        console.log(`\n  🍽️ Питание для создания: ${mealsToCreate.length}`);
        for (const meal of mealsToCreate) {
            console.log(`    Создание: ${meal.source_name}`);
            const result = await pazlApi.createHotelMeal(meal.source_name);
            if (result) {
                const found = await pazlApi.findHotelMeal(meal.source_name);
                if (found) {
                    meal.pazl_id = found.id;
                    meal.pazl_name = found.name;
                    meal.needs_creation = false;
                    createdEntities.set(`hotel_meal_${meal.source_id}`, {
                        type: 'hotel_meal',
                        source_name: meal.source_name,
                        pazl_id: found.id
                    });
                    console.log(`    ✅ Создано: ${meal.source_name} (ID: ${found.id})`);
                }
            }
        }
    }

    // 4. Типы инфраструктуры гостиниц
    const infraTypesToCreate = mappings.hotel_infrastructure_types.filter((t: MappedEntity) => t.needs_creation);
    if (infraTypesToCreate.length > 0) {
        console.log(`\n  🏗️ Типы инфраструктуры для создания: ${infraTypesToCreate.length}`);
        for (const type of infraTypesToCreate) {
            console.log(`    Создание: ${type.source_name}`);
            const result = await pazlApi.createHotelInfrastructureType(type.source_name);
            if (result) {
                const found = await pazlApi.findHotelInfrastructureType(type.source_name);
                if (found) {
                    type.pazl_id = found.id;
                    type.pazl_name = found.name;
                    type.needs_creation = false;
                    createdEntities.set(`infra_type_${type.source_id}`, {
                        type: 'hotel_infrastructure_type',
                        source_name: type.source_name,
                        pazl_id: found.id
                    });
                    console.log(`    ✅ Создан: ${type.source_name} (ID: ${found.id})`);
                }
            }
        }
    }

    // 5. Инфраструктуры гостиниц
    const infrastructuresToCreate = mappings.hotel_infrastructures.filter((i: MappedEntity) => i.needs_creation);
    if (infrastructuresToCreate.length > 0) {
        console.log(`\n  🏗️ Инфраструктуры для создания: ${infrastructuresToCreate.length}`);
        for (const infra of infrastructuresToCreate) {
            let typeId = 1;
            for (const hotel of (tourData.hotels || [])) {
                if (hotel.infrastructures) {
                    const hotelInfra = hotel.infrastructures.find((hi: any) => hi.id === infra.source_id);
                    if (hotelInfra) {
                        if (hotelInfra.infrastructure_type?.id) {
                            const typeMapping = mappings.hotel_infrastructure_types.find(
                                (t: MappedEntity) => t.source_id === hotelInfra.infrastructure_type.id
                            );
                            if (typeMapping && !typeMapping.needs_creation) {
                                typeId = typeMapping.pazl_id!;
                            }
                        } else if (hotelInfra.infrastructure_type_id) {
                            const typeMapping = mappings.hotel_infrastructure_types.find(
                                (t: MappedEntity) => t.source_id === hotelInfra.infrastructure_type_id
                            );
                            if (typeMapping && !typeMapping.needs_creation) {
                                typeId = typeMapping.pazl_id!;
                            }
                        }
                        break;
                    }
                }
            }

            console.log(`    Создание: ${infra.source_name} (тип ID: ${typeId})`);
            const result = await pazlApi.createHotelInfrastructure(infra.source_name, typeId);
            if (result) {
                const found = await pazlApi.findHotelInfrastructure(infra.source_name);
                if (found) {
                    infra.pazl_id = found.id;
                    infra.pazl_name = found.name;
                    infra.needs_creation = false;
                    createdEntities.set(`infra_${infra.source_id}`, {
                        type: 'hotel_infrastructure',
                        source_name: infra.source_name,
                        pazl_id: found.id
                    });
                    console.log(`    ✅ Создана: ${infra.source_name} (ID: ${found.id})`);
                }
            }
        }
    }

    // 6. Услуги тура
    const servicesToCreate = mappings.tour_services.filter((s: MappedEntity) => s.needs_creation);
    if (servicesToCreate.length > 0) {
        console.log(`\n  🛠️ Услуги тура для создания: ${servicesToCreate.length}`);
        for (const service of servicesToCreate) {
            let serviceClass = 'group';
            if (service.source_type === 'required_service') {
                serviceClass = 'individual';
            }

            const serviceData = tourData.services_data?.[service.source_id];
            const serviceDates: any[] = [];

            if (serviceData?.dates && Array.isArray(serviceData.dates)) {
                for (const date of serviceData.dates) {
                    serviceDates.push({
                        id: null,
                        from: date.from || "2026-01-01",
                        to: date.to || "2026-12-31",
                        vendor_price: date.vendor_price?.toString() || "0",
                        adult_price: date.adult_price?.toString() || "0",
                        child_prices: date.child_prices || [],
                        commission_adult_type: date.commission_adult_type || 1,
                        commission_adult_sum: date.commission_adult_sum || 0,
                        commission_child_type: date.commission_child_type || 1,
                        commission_child_sum: date.commission_child_sum || 0
                    });
                }
            }

            console.log(`    Создание: ${service.source_name} (класс: ${serviceClass}, дат: ${serviceDates.length})`);
            const result = await pazlApi.createTourService(service.source_name, serviceClass, serviceDates);
            if (result) {
                const found = await pazlApi.findTourService(service.source_name);
                if (found) {
                    service.pazl_id = found.id;
                    service.pazl_name = found.name;
                    service.needs_creation = false;
                    createdEntities.set(`tour_service_${service.source_id}`, {
                        type: 'tour_service',
                        source_name: service.source_name,
                        pazl_id: found.id
                    });
                    console.log(`    ✅ Создана: ${service.source_name} (ID: ${found.id})`);
                }
            }
        }
    }

    // 7. Транспортный маршрут
    const transportsToCreate = mappings.transports.filter((t: MappedEntity) => t.needs_creation);
    if (transportsToCreate.length > 0) {
        console.log(`\n  🚌 Транспортные маршруты для создания: ${transportsToCreate.length}`);
        for (const transport of transportsToCreate) {
            let transportationId = 1;
            if (tourData.transport_forth?.transportation) {
                const transportationMapping = mappings.transportations.find(
                    (t: MappedEntity) => t.source_id === tourData.transport_forth.transportation.id
                );
                if (transportationMapping && !transportationMapping.needs_creation) {
                    transportationId = transportationMapping.pazl_id!;
                }
            }

            console.log(`    Создание: ${transport.source_name}`);
            const result = await pazlApi.createTransport(transportationId, transport.source_name, tourData, citiesMap);
            if (result) {
                const found = await pazlApi.findTransport(transport.source_name);
                if (found) {
                    transport.pazl_id = found.id;
                    transport.pazl_name = found.name;
                    transport.needs_creation = false;
                    createdEntities.set(`transport_${transport.source_id}`, {
                        type: 'transport',
                        source_name: transport.source_name,
                        pazl_id: found.id
                    });
                    console.log(`    ✅ Создан: ${transport.source_name} (ID: ${found.id})`);
                }
            }
        }
    }

    // 8. Гостиницы
    const hotelsToCreate = mappings.hotels.filter((h: MappedEntity) => h.needs_creation);
    if (hotelsToCreate.length > 0) {
        console.log(`\n  🏨 Гостиницы для создания: ${hotelsToCreate.length}`);
        for (const hotel of hotelsToCreate) {
            const hotelData = tourData.hotels?.find((h: any) => h.id === hotel.source_id);
            if (hotelData) {
                console.log(`    Создание: ${hotel.source_name}`);
                const result = await pazlApi.createHotel(hotel.source_name, hotelData, mappings);
                if (result) {
                    const found = await pazlApi.findHotel(hotel.source_name);
                    if (found) {
                        hotel.pazl_id = found.id;
                        hotel.pazl_name = found.name;
                        hotel.needs_creation = false;
                        createdEntities.set(`hotel_${hotel.source_id}`, {
                            type: 'hotel',
                            source_name: hotel.source_name,
                            pazl_id: found.id
                        });
                        console.log(`    ✅ Создана: ${hotel.source_name} (ID: ${found.id})`);
                    }
                }
            }
        }
    }

    console.log(`\n  ✅ Создано сущностей: ${createdEntities.size}`);
    return createdEntities;
}

// ============================================
// СОЗДАНИЕ ТУРА
// ============================================

async function createTour(
    pazlApi: PazlApiClient,
    tourData: any,
    mappings: any
): Promise<boolean> {
    console.log('\n' + '='.repeat(80));
    console.log('🎯 СОЗДАНИЕ ТУРА В PAZL TOURS');
    console.log('='.repeat(80));

    let category = mappings.tour_categories.find((c: MappedEntity) => c.source_id === tourData.category_id);

    if (!category || category.needs_creation) {
        const categoryName = 'Автобусные туры';
        console.log(`  📁 Категория "${categoryName}" не найдена, создаём...`);
        const createResult = await pazlApi.createTourCategory(categoryName);
        if (createResult) {
            const found = await pazlApi.findTourCategory(categoryName);
            if (found) {
                category = {
                    source_id: tourData.category_id,
                    source_name: categoryName,
                    pazl_id: found.id,
                    pazl_name: found.name,
                    needs_creation: false
                };
                console.log(`  ✅ Категория создана: ${found.name} (ID: ${found.id})`);
            }
        }
    }

    const transportForth = mappings.transports.find((t: MappedEntity) => t.source_id === tourData.transport_forth_id);

    const hotels: any[] = [];
    if (tourData.hotels) {
        for (const hotel of tourData.hotels) {
            const mappedHotel = mappings.hotels.find((h: MappedEntity) => h.source_id === hotel.id);
            if (mappedHotel && !mappedHotel.needs_creation) {
                const cityId = hotel.city?.id;
                const mappedCity = cityId ? mappings.cities.find((c: MappedEntity) => c.source_id === cityId) : null;

                const hotelEntry: any = {
                    id: mappedHotel.pazl_id,
                    city_id: mappedCity?.pazl_id || null,
                    arrival_day: hotel.arrival_day?.toString() || "1",
                    departure_day: hotel.departure_day?.toString() || "2"
                };

                if (hotel.meal_id) {
                    const mealMapping = mappings.hotel_meals.find((m: MappedEntity) => m.source_id === hotel.meal_id);
                    if (mealMapping && !mealMapping.needs_creation) {
                        hotelEntry.meal_id = mealMapping.pazl_id;
                    }
                }

                hotels.push(hotelEntry);
                console.log(`  🏨 Гостиница: ${mappedHotel.pazl_name} (ID: ${mappedHotel.pazl_id})`);
            }
        }
    }

    const requiredServices: any[] = [];
    if (tourData.required_services) {
        for (const service of tourData.required_services) {
            const mappedService = mappings.tour_services.find((s: MappedEntity) => s.source_id === service.id);
            if (mappedService && !mappedService.needs_creation) {
                requiredServices.push({
                    id: mappedService.pazl_id,
                    day: service.day?.toString() || "1",
                    service_class: "individual"
                });
            }
        }
    }

    const additionalServices: any[] = [];
    if (tourData.additional_services) {
        for (const service of tourData.additional_services) {
            const mappedService = mappings.tour_services.find((s: MappedEntity) => s.source_id === service.id);
            if (mappedService && !mappedService.needs_creation) {
                additionalServices.push({
                    id: mappedService.pazl_id,
                    day: service.day?.toString() || "1",
                    service_class: "group"
                });
            }
        }
    }

    const servicesInTour: any[] = [];
    if (tourData.services) {
        for (const service of tourData.services) {
            const mappedService = mappings.tour_services.find((s: MappedEntity) => s.source_id === service.id);
            if (mappedService && !mappedService.needs_creation) {
                servicesInTour.push({
                    id: mappedService.pazl_id,
                    day: service.day?.toString() || "1",
                    service_class: "group"
                });
            }
        }
    }

    console.log(`  📊 Гостиниц: ${hotels.length}, услуг: ${servicesInTour.length}, обязательных: ${requiredServices.length}, доп.: ${additionalServices.length}`);

    const tourMeals: any[] = [];
    if (tourData.meals) {
        for (const meal of tourData.meals) {
            tourMeals.push({
                id: null,
                name: meal.name,
                vendor_id: 2,
                days: meal.days || [1],
                vendor_name: meal.vendor_name || "",
                dates: meal.dates?.map((d: any) => ({
                    id: null,
                    from: d.from || "2026-01-01",
                    to: d.to || "2026-12-31",
                    price: d.price?.toString() || "0",
                    commission_type: d.commission_type || 1,
                    commission_sum: d.commission_sum || 0
                })) || [],
                can_delete: true,
                sum: "0",
                commission_type: 1,
                commission_sum: 0,
                uid: Date.now() + Math.random()
            });
        }
    }

    const dates: any[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (tourData.dates && tourData.dates.length > 0) {
        for (const date of tourData.dates) {
            const dateStr = date.start_date || date;
            const formattedDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;

            const checkDate = new Date(formattedDate);
            if (!isNaN(checkDate.getTime()) && checkDate >= today) {
                dates.push({ start_date: formattedDate });
            } else {
                console.log(`  ⚠️ Дата ${formattedDate} уже прошла, пропускаем`);
            }
        }
        if (dates.length > 0) {
            console.log(`  📅 Даты тура: ${dates.map((d: any) => d.start_date).join(', ')}`);
        }
    }

    if (dates.length === 0) {
        console.log(`  ❌ Нет будущих дат, тур не создан`);
        return false;
    }

    const days: any[] = [];
    if (tourData.days && tourData.days.length > 0) {
        for (const day of tourData.days) {
            days.push({
                name: day.name || "День",
                description: day.description || "",
                photos: []
            });
        }
    } else if (tourData.description) {
        days.push({
            name: "День 1",
            description: tourData.description,
            photos: []
        });
    }

    const tradeOffers: any[] = [];
    if (tourData.trade_offers && Array.isArray(tourData.trade_offers)) {
        const pazlTradeOffers = await pazlApi.apiRequest<any>('/tours/excursion/trade-offers?limit=100');
        const validIds = new Set<number>();
        if (pazlTradeOffers?.data && Array.isArray(pazlTradeOffers.data)) {
            for (const to of pazlTradeOffers.data) {
                validIds.add(to.id);
            }
        }

        for (const offerId of tourData.trade_offers) {
            if (typeof offerId === 'number' && validIds.has(offerId)) {
                tradeOffers.push(offerId);
            }
        }
    }

    const catalogSections: any[] = [];
    if (tourData.catalog_sections && Array.isArray(tourData.catalog_sections)) {
        for (const section of tourData.catalog_sections) {
            const sectionId = section.id;
            if (typeof sectionId === 'number') {
                const mappedSection = mappings.catalog_sections.find((s: MappedEntity) => s.source_id === sectionId);
                if (mappedSection && !mappedSection.needs_creation) {
                    catalogSections.push({
                        id: mappedSection.pazl_id,
                        sum: section.sum || "0",
                        sort: section.sort || 0
                    });
                }
            }
        }
    }

    let tourCityId = null;
    if (tourData.tour_type_id == 2) {
        if (mappings.cities.length > 0) {
            tourCityId = mappings.cities[0].pazl_id;
        }
        if (!tourCityId) {
            const nnCity = await pazlApi.findCity('Нижний Новгород');
            if (nnCity) {
                tourCityId = nnCity.id;
            }
        }
    }

    let additionalDatesHtml = "";
    if (dates.length > 0) {
        const dateStrings = dates.map((d: any) => d.start_date);
        additionalDatesHtml = `<p>Даты тура: ${dateStrings.join(', ')}</p>`;
    }

    let additionalCitiesHtml = "";
    if (tourData.transport_forth?.routes) {
        const routes = tourData.transport_forth.routes;
        const allPoints: any[] = [];

        if (routes.start?.point_city_id) {
            const cityMapping = mappings.cities.find((c: MappedEntity) => c.source_id === routes.start.point_city_id);
            allPoints.push({
                city: cityMapping?.pazl_name || cityMapping?.source_name || "Неизвестно",
                info: routes.start.info || "",
                time: routes.start.start_time || ""
            });
        }

        if (routes.intermediates) {
            for (const point of routes.intermediates) {
                const cityMapping = mappings.cities.find((c: MappedEntity) => c.source_id === point.point_city_id);
                allPoints.push({
                    city: cityMapping?.pazl_name || cityMapping?.source_name || "Неизвестно",
                    info: point.info || "",
                    time: point.start_time || point.finish_time || ""
                });
            }
        }

        if (allPoints.length > 0) {
            additionalCitiesHtml = "<p><strong>Города и точки посадки:</strong></p><ul>";
            for (const point of allPoints) {
                const timeStr = point.time ? ` (${point.time})` : '';
                const infoStr = point.info ? ` - ${point.info}` : '';
                additionalCitiesHtml += `<li>${point.city}${timeStr}${infoStr}</li>`;
            }
            additionalCitiesHtml += "</ul>";
        }
    }

    const tourPayload = {
        id: null,
        name: tourData.name,
        is_active: tourData.is_active || false,
        is_hotel_selection: false,
        application_auto_confirm: false,
        auto_confirm_status: null,
        duration: tourData.duration?.toString() || "1",
        tour_type_id: tourData.tour_type_id || 1,
        city_id: tourCityId,
        hotels: hotels,
        dates: dates,
        days: days,
        services: servicesInTour,
        required_services: requiredServices,
        additional_services: additionalServices,
        catalog_sections: catalogSections,
        trade_offers: tradeOffers,
        photos: [],
        files: [],
        videos: [],
        short_description: tourData.short_description || "",
        description: tourData.description || "",
        info: tourData.info || "",
        additional_dates: additionalDatesHtml,
        additional_cities: additionalCitiesHtml || tourData.info || "",
        additional_price: tourData.additional_price || "",
        additional_price_includes: tourData.additional_price_includes || "",
        additional_extra_price: tourData.additional_extra_price || "",
        commission_transport_type: 1,
        commission_transport_sum: "0",
        commission_accommodation_type: 1,
        commission_accommodation_sum: "0",
        commission_agency_type: "2",
        commission_agency_sum: tourData.commission_agency_sum?.toString() || "0",
        meal_price: null,
        commission_meal_type: 1,
        commission_meal_sum: null,
        adult_price: tourData.adult_price?.toString() || null,
        commission_adult_type: 1,
        commission_adult_sum: null,
        child_price: tourData.child_price?.toString() || null,
        commission_child_type: 1,
        commission_child_sum: null,
        meals: tourMeals,
        status: 1,
        category_id: category?.pazl_id || null,
        transport_forth_id: transportForth?.pazl_id || null
    };

    console.log('\n  📤 Отправка данных тура...');

    const result = await pazlApi.apiRequest('/tours', { method: 'POST', body: { payload: JSON.stringify(tourPayload) } });

    if (result) {
        console.log('  ✅ Тур успешно создан!');
        return true;
    } else {
        console.log('  ❌ Ошибка при создании тура');
        return false;
    }
}

// ============================================
// API РОУТ
// ============================================

router.post('/', async (req: Request, res: Response) => {
    const { aviannaEmail, aviannaPassword, pazlEmail, pazlPassword, tourName } = req.body;

    if (!aviannaEmail || !aviannaPassword || !pazlEmail || !pazlPassword || !tourName) {
        return res.status(400).json({
            success: false,
            error: 'Все поля обязательны: aviannaEmail, aviannaPassword, pazlEmail, pazlPassword, tourName'
        });
    }

    console.log('\n' + '='.repeat(80));
    console.log('🔄 МИГРАЦИЯ ТУРА AVIANNA → PAZL TOURS');
    console.log('='.repeat(80));
    console.log(`🎯 Тур: "${tourName}"`);

    let browser: any = null;

    try {
        browser = await chromium.launch({
            headless: true,
            executablePath: '/snap/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const context = await browser.newContext();

        // Вход в Avianna
        console.log('\n' + '='.repeat(80));
        console.log('🔐 ВХОД В AVIANNA');
        console.log('='.repeat(80));

        const aviannaPage = await context.newPage();

        console.log('\n  🔄 Вход в Avianna...');
        await aviannaPage.goto('https://manager.avianna24.ru/auth');
        await aviannaPage.waitForTimeout(2000);
        await aviannaPage.fill('input[type="text"]', aviannaEmail);
        await aviannaPage.fill('input[type="password"]', aviannaPassword);
        await aviannaPage.click('#kt_login_singin_form_submit_button');
        await aviannaPage.waitForTimeout(5000);

        if (aviannaPage.url().includes('/auth')) {
            console.log('❌ Ошибка входа в Avianna');
            await browser.close();
            return res.status(401).json({
                success: false,
                error: 'Ошибка входа в Avianna. Проверьте email и пароль.'
            });
        }

        console.log('✅ Вход в Avianna выполнен!');
        const aviannaApi = new AviannaApiClient(aviannaPage);

        // Поиск тура
        console.log('\n' + '='.repeat(80));
        console.log('📥 ПОИСК ТУРА В AVIANNA');
        console.log('='.repeat(80));

        console.log(`\n🔍 Поиск тура: "${tourName}"`);
        const toursResult = await aviannaApi.getTours(tourName);

        if (!toursResult?.data || toursResult.data.length === 0) {
            console.log('❌ Тур не найден');
            await browser.close();
            return res.status(404).json({
                success: false,
                error: `Тур "${tourName}" не найден в Avianna`
            });
        }

        const tourBasic = toursResult.data.find((t: any) => t.name === tourName) || toursResult.data[0];
        console.log(`✅ Найден: ${tourBasic.name} (ID: ${tourBasic.id})`);

        const tourData = await extractTourData(aviannaApi, tourBasic.id);

        if (!tourData) {
            console.log('❌ Не удалось загрузить данные тура');
            await browser.close();
            return res.status(500).json({
                success: false,
                error: 'Не удалось загрузить данные тура'
            });
        }

        // Вход в Pazl Tours
        console.log('\n' + '='.repeat(80));
        console.log('🔐 ВХОД В PAZL TOURS');
        console.log('='.repeat(80));

        const pazlPage = await context.newPage();
        const pazlLoggedIn = await loginToPazl(pazlPage, pazlEmail, pazlPassword);

        if (!pazlLoggedIn) {
            console.log('\n❌ Не удалось войти в Pazl Tours');
            await browser.close();
            return res.status(401).json({
                success: false,
                error: 'Ошибка входа в Pazl Tours. Проверьте email и пароль.'
            });
        }

        const pazlApi = new PazlApiClient(pazlPage);

        // Поиск соответствий
        const { mappings, stats } = await performMapping(aviannaApi, pazlApi, tourData);

        // Создание недостающих сущностей
        const createdEntities = await createMissingEntities(pazlApi, mappings, aviannaApi, tourData);

        // Создание тура
        const tourCreated = await createTour(pazlApi, tourData, mappings);

        console.log('\n' + '='.repeat(80));
        console.log('✅ МИГРАЦИЯ ЗАВЕРШЕНА!');
        console.log('='.repeat(80));

        if (tourCreated) {
            console.log('\n✅ ТУР УСПЕШНО СОЗДАН В PAZL TOURS!');
        } else {
            console.log('\n⚠️ Возникли проблемы при создании тура.');
        }

        await browser.close();

        res.json({
            success: true,
            data: {
                tourData: {
                    id: tourData.id,
                    name: tourData.name
                },
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
        console.error('\n❌ ОШИБКА:', error);
        if (browser) {
            try { await browser.close(); } catch (e) {}
        }
        res.status(500).json({
            success: false,
            error: error.message || 'Внутренняя ошибка сервера'
        });
    }
});

export default router;