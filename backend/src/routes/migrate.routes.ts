import { Router, Request, Response } from 'express';
import { chromium } from 'playwright';
import * as fs from 'fs';

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
                const response = await fetch(fetchUrl, {
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });

                if (!response.ok) {
                    return null;
                }

                return response.json();
            }, fullUrl);

            if (result) {
                this.cache.set(cacheKey, result);
            }

            return result as T;

        } catch (error) {
            console.log(`      ⚠️ Ошибка запроса: ${url}`);
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
            const result = await this.page.evaluate(async ({ fetchUrl, fetchMethod, fetchBody, xsrfToken }: any) => {
                const headers: Record<string, string> = {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-XSRF-TOKEN': xsrfToken
                };

                if (fetchMethod !== 'GET') {
                    headers['Content-Type'] = 'application/json';
                }

                const fetchOptions: RequestInit = {
                    method: fetchMethod,
                    headers: headers,
                    credentials: 'include'
                };

                if (fetchMethod !== 'GET' && fetchBody) {
                    fetchOptions.body = JSON.stringify(fetchBody);
                }

                const response = await fetch(fetchUrl, fetchOptions);

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
            }, {
                fetchUrl: fullUrl,
                fetchMethod: method,
                fetchBody: options?.body,
                xsrfToken: this.xsrfToken
            });

            if (result?.__error) {
                console.log(`      ❌ API Error ${result.__status}: ${result.__body}`);
                return null;
            }

            return result as T;
        } catch (error) {
            console.log(`      ⚠️ Ошибка запроса: ${url}`, error);
            return null;
        }
    }

    async findEntity(endpoint: string, name: string): Promise<{ id: number; name: string } | null> {
        if (!name) return null;

        const result = await this.apiRequest<any>(`${endpoint}?query=${encodeURIComponent(name)}&limit=10`);

        if (result?.data && Array.isArray(result.data) && result.data.length > 0) {
            const exactMatch = result.data.find((item: any) => item.name === name);
            if (exactMatch) {
                return { id: exactMatch.id, name: exactMatch.name };
            }
            return { id: result.data[0].id, name: result.data[0].name };
        }

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
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
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
        console.log(`  🚌 Загрузка транспорта ID: ${tour.transport_forth_id}`);
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
        console.log(`  🚌 Загрузка обратного транспорта ID: ${tour.transport_back_id}`);
        const transport = await api.getTransport(tour.transport_back_id);
        if (transport) {
            result.transport_back = transport;
            console.log(`    ✅ ${transport.name}`);
        }
    }

    if (tour.hotels && tour.hotels.length > 0) {
        console.log(`  🏨 Загрузка гостиниц (${tour.hotels.length})`);
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
        console.log(`  🛠️ Загрузка информации об услугах (${serviceIds.size})`);
        result.services_data = {};

        for (const serviceId of serviceIds) {
            const serviceData = await api.getTourServiceFull(serviceId);
            if (serviceData) {
                result.services_data[serviceId] = serviceData;
                console.log(`    ✅ Услуга ID ${serviceId}: ${serviceData.name || 'без названия'}`);
            }
        }
    }

    return result;
}

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
        console.log(`    🔍 Поиск "${label}" в Pazl: "${sourceName}"...`);
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
    };

    // 1. Города
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

    if (cityIds.size > 0) {
        console.log('\n  🏙️ Города:');
        for (const cityId of cityIds) {
            const cityName = await aviannaApi.getCityById(cityId);
            if (cityName) {
                await mapEntity(cityId, cityName,
                    (name) => pazlApi.findCity(name),
                    mappings.cities, cityName);
            } else {
                const hotelWithCity = tourData.hotels?.find((h: any) => h.city?.id === cityId);
                if (hotelWithCity?.city?.name) {
                    await mapEntity(cityId, hotelWithCity.city.name,
                        (name) => pazlApi.findCity(name),
                        mappings.cities, hotelWithCity.city.name);
                } else {
                    console.log(`    ⚠️ Не удалось получить название города ID: ${cityId}`);
                }
            }
        }
    } else {
        console.log('\n  🏙️ Города: нет городов для маппинга');
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
            console.log(`    ⚠️ Не удалось получить название категории ID: ${tourData.category_id}, используем "Автобусные туры"`);
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
        for (const service of tourData.services) {
            const serviceId = service.id;
            if (!tourServicesToFind.has(serviceId)) {
                console.log(`    🔍 Получение названия услуги ID: ${serviceId}...`);
                const serviceName = await aviannaApi.getTourServiceName(serviceId);
                if (serviceName) {
                    tourServicesToFind.set(serviceId, {
                        name: serviceName,
                        type: 'service',
                        day: service.day,
                        service_class: service.service_class
                    });
                    console.log(`    ✅ ${serviceName}`);
                }
            }
        }
    }

    if (tourData.required_services) {
        for (const service of tourData.required_services) {
            const serviceId = service.id;
            if (!tourServicesToFind.has(serviceId)) {
                console.log(`    🔍 Получение названия обязательной услуги ID: ${serviceId}...`);
                const serviceName = await aviannaApi.getTourServiceName(serviceId);
                if (serviceName) {
                    tourServicesToFind.set(serviceId, {
                        name: serviceName,
                        type: 'required_service',
                        day: service.day,
                        service_class: service.service_class
                    });
                    console.log(`    ✅ ${serviceName}`);
                }
            }
        }
    }

    if (tourData.additional_services) {
        for (const service of tourData.additional_services) {
            const serviceId = service.id;
            if (!tourServicesToFind.has(serviceId)) {
                console.log(`    🔍 Получение названия дополнительной услуги ID: ${serviceId}...`);
                const serviceName = await aviannaApi.getTourServiceName(serviceId);
                if (serviceName) {
                    tourServicesToFind.set(serviceId, {
                        name: serviceName,
                        type: 'additional_service',
                        day: service.day,
                        service_class: service.service_class
                    });
                    console.log(`    ✅ ${serviceName}`);
                }
            }
        }
    }

    if (tourServicesToFind.size > 0) {
        console.log('\n  🛠️ Услуги тура:');
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

    const hasHotelEntities = accommodationsMap.size > 0 || infraTypesMap.size > 0 ||
        infrastructuresMap.size > 0 || roomTypesMap.size > 0 ||
        roomPlacesMap.size > 0 || roomDescriptionsMap.size > 0 ||
        roomServicesMap.size > 0 || roomEquipmentsMap.size > 0 ||
        roomFurnituresMap.size > 0 || roomBathroomsMap.size > 0;

    if (hasHotelEntities) {
        console.log('\n  🏨 Сущности гостиниц:');

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

    let browser: any = null;

    try {
        console.log('\n' + '='.repeat(80));
        console.log('🔄 МИГРАЦИЯ ТУРА AVIANNA → PAZL TOURS');
        console.log('='.repeat(80));
        console.log(`🎯 Тур: "${tourName}"`);
        console.log(`📧 Avianna: ${aviannaEmail}`);
        console.log(`📧 Pazl: ${pazlEmail}`);

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
        console.log('\n🔐 Вход в Avianna...');
        const aviannaPage = await context.newPage();
        await aviannaPage.goto('https://manager.avianna24.ru/auth');
        await aviannaPage.waitForTimeout(2000);
        await aviannaPage.fill('input[type="text"]', aviannaEmail);
        await aviannaPage.fill('input[type="password"]', aviannaPassword);
        await aviannaPage.click('#kt_login_singin_form_submit_button');
        await aviannaPage.waitForTimeout(5000);

        if (aviannaPage.url().includes('/auth')) {
            await browser.close();
            return res.status(401).json({
                success: false,
                error: 'Ошибка входа в Avianna. Проверьте email и пароль.'
            });
        }

        console.log('✅ Вход в Avianna выполнен!');
        const aviannaApi = new AviannaApiClient(aviannaPage);

        // Поиск тура
        console.log(`\n🔍 Поиск тура: "${tourName}"`);
        const toursResult = await aviannaApi.getTours(tourName);

        if (!toursResult?.data || toursResult.data.length === 0) {
            await browser.close();
            return res.status(404).json({
                success: false,
                error: `Тур "${tourName}" не найден в Avianna`
            });
        }

        const tourBasic = toursResult.data.find((t: any) => t.name === tourName) || toursResult.data[0];
        console.log(`✅ Найден: ${tourBasic.name} (ID: ${tourBasic.id})`);

        // Загрузка данных тура
        console.log('\n📥 ЗАГРУЗКА ДАННЫХ ТУРА ИЗ AVIANNA');
        console.log('='.repeat(80));
        const tourData = await extractTourData(aviannaApi, tourBasic.id);

        if (!tourData) {
            await browser.close();
            return res.status(500).json({
                success: false,
                error: 'Не удалось загрузить данные тура'
            });
        }

        // Сохраняем данные локально
        const sourceFile = `avianna-tour-${tourData.id}.json`;
        fs.writeFileSync(sourceFile, JSON.stringify(tourData, null, 2));
        console.log(`\n💾 Данные Avianna сохранены в: ${sourceFile}`);

        // Вход в Pazl Tours
        console.log('\n🔐 Вход в Pazl Tours...');
        const pazlPage = await context.newPage();
        const pazlLoggedIn = await loginToPazl(pazlPage, pazlEmail, pazlPassword);

        if (!pazlLoggedIn) {
            await browser.close();
            return res.status(401).json({
                success: false,
                error: 'Ошибка входа в Pazl Tours. Проверьте email и пароль.'
            });
        }

        const pazlApi = new PazlApiClient(pazlPage);

        // Поиск соответствий
        console.log('\n🔍 ПОИСК СООТВЕТСТВИЙ...');
        const { mappings, stats } = await performMapping(aviannaApi, pazlApi, tourData);

        const resultFile = `migration-result-${tourData.id}.json`;
        const fullResult = {
            source_tour: {
                id: tourData.id,
                name: tourData.name
            },
            mappings,
            stats: {
                totalToCreate: stats.totalToCreate,
                totalExists: stats.totalExists,
                total: stats.totalToCreate + stats.totalExists
            },
            message: 'Маппинг выполнен успешно'
        };

        fs.writeFileSync(resultFile, JSON.stringify(fullResult, null, 2));
        console.log(`\n💾 Результаты сохранены в: ${resultFile}`);

        await browser.close();

        console.log('\n✅ МИГРАЦИЯ ЗАВЕРШЕНА!');

        // Возвращаем результат
        res.json({
            success: true,
            data: fullResult
        });

    } catch (error: any) {
        console.error('\n❌ Ошибка миграции:', error);
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