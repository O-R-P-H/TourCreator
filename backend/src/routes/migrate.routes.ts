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

    async createCity(name: string): Promise<any> {
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

    async createTourCategory(name: string): Promise<any> {
        return this.apiRequest('/tours/excursion/categories', { method: 'POST', body: { name } });
    }

    async createHotelMeal(name: string): Promise<any> {
        return this.apiRequest('/hotels/meals', { method: 'POST', body: { id: null, name, category_type: 1 } });
    }

    async createHotelInfrastructureType(name: string): Promise<any> {
        return this.apiRequest('/hotels/infrastructure-types', { method: 'POST', body: { name } });
    }

    async createHotelInfrastructure(name: string, typeId: number): Promise<any> {
        return this.apiRequest('/hotels/infrastructures', {
            method: 'POST',
            body: { is_filter: true, is_point_filter: false, name, infrastructure_type_id: typeId }
        });
    }

    async createTourService(name: string, serviceClass: string = 'group', dates: any[] = []): Promise<any> {
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
        const transport = await api.getTransport(tour.transport_forth_id);
        if (transport) {
            result.transport_forth = transport;
        }
    }

    if (tour.transport_back_id) {
        const transport = await api.getTransport(tour.transport_back_id);
        if (transport) {
            result.transport_back = transport;
        }
    }

    if (tour.hotels && tour.hotels.length > 0) {
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

    const serviceIds = new Set<number>();
    [...(tour.services || []), ...(tour.required_services || []), ...(tour.additional_services || [])].forEach((s: any) => {
        if (s.id) serviceIds.add(s.id);
    });

    if (serviceIds.size > 0) {
        result.services_data = {};
        for (const serviceId of serviceIds) {
            const serviceData = await api.getTourServiceFull(serviceId);
            if (serviceData) {
                result.services_data[serviceId] = serviceData;
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
        sourceType?: string
    ) => {
        const found = await pazlFindMethod(sourceName);
        targetArray.push({
            source_id: sourceId,
            source_name: sourceName,
            source_type: sourceType,
            pazl_id: found?.id || null,
            pazl_name: found?.name || null,
            needs_creation: !found
        });
    };

    // Города
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
        if (hotel.city?.id) cityIds.add(hotel.city.id);
    });

    for (const cityId of cityIds) {
        const cityName = await aviannaApi.getCityById(cityId);
        if (cityName) {
            await mapEntity(cityId, cityName, (name) => pazlApi.findCity(name), mappings.cities);
        }
    }

    // Категория тура
    if (tourData.category_id) {
        const categoryName = await aviannaApi.getCategoryName(tourData.category_id);
        if (categoryName) {
            await mapEntity(tourData.category_id, categoryName, (name) => pazlApi.findTourCategory(name), mappings.tour_categories);
        }
    }

    // Услуги тура
    const tourServicesToFind = new Map<number, any>();
    for (const service of [...(tourData.services || []), ...(tourData.required_services || []), ...(tourData.additional_services || [])]) {
        const serviceId = service.id;
        if (!tourServicesToFind.has(serviceId)) {
            const serviceName = await aviannaApi.getTourServiceName(serviceId);
            if (serviceName) {
                tourServicesToFind.set(serviceId, { name: serviceName });
            }
        }
    }

    for (const [id, serviceData] of tourServicesToFind) {
        await mapEntity(id, serviceData.name, (name) => pazlApi.findTourService(name), mappings.tour_services);
    }

    // Гостиницы
    if (tourData.hotels) {
        for (const hotel of tourData.hotels) {
            await mapEntity(hotel.id, hotel.name, (name) => pazlApi.findHotel(name), mappings.hotels);
        }
    }

    return mappings;
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
        console.log(`💾 Данные Avianna сохранены в: ${sourceFile}`);

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
        console.log('\n🔍 Поиск соответствий...');
        const mappings = await performMapping(aviannaApi, pazlApi, tourData);

        // Статистика
        let totalToCreate = 0;
        let totalExists = 0;

        for (const [type, items] of Object.entries(mappings)) {
            const typedItems = items as MappedEntity[];
            const toCreate = typedItems.filter(i => i.needs_creation).length;
            const exists = typedItems.filter(i => !i.needs_creation).length;
            totalToCreate += toCreate;
            totalExists += exists;
        }

        await browser.close();

        // Возвращаем результат
        res.json({
            success: true,
            data: {
                tourData,
                mappings,
                stats: {
                    totalToCreate,
                    totalExists,
                    total: totalToCreate + totalExists
                },
                message: 'Маппинг выполнен успешно'
            }
        });

    } catch (error: any) {
        console.error('Ошибка миграции:', error);
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