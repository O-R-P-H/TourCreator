import { Page } from 'playwright';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import { BrowserService } from './browser.service.js';

interface ApiClient {
    page: Page;
    xsrfToken: string;
    post: <T>(endpoint: string, data: any, wrapInPayload?: boolean) => Promise<T | null>;
    get: <T>(endpoint: string) => Promise<T | null>;
}

interface JobStatus {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    step: 'login' | 'transport' | 'hotel' | 'tour' | 'done';
    transportId?: number;
    hotelId?: number;
    tourId?: number;
    tourUrl?: string;
    error?: string;
    log: string[];
}

interface ActiveJob {
    status: JobStatus;
    logFile: string;
}

export class TourService extends EventEmitter {
    private browserService: BrowserService;
    private activeJobs: Map<string, ActiveJob> = new Map();

    constructor(browserService: BrowserService) {
        super();
        this.browserService = browserService;
    }

    private log(sessionId: string, message: string, data?: any): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;
        const job = this.activeJobs.get(sessionId);

        console.log(message);

        if (job) {
            job.status.log.push(message);
            fs.appendFileSync(job.logFile, logMessage + '\n');

            if (data) {
                const dataStr = JSON.stringify(data, null, 2);
                job.status.log.push(dataStr);
                fs.appendFileSync(job.logFile, dataStr + '\n');
            }
        }

        this.emit('log', { sessionId, message, data });
        this.emit('status', { sessionId, status: job?.status });
    }

    private async createApiClient(page: Page): Promise<ApiClient> {
        const cookies = await page.context().cookies();
        const xsrfCookie = cookies.find(c => c.name === 'XSRF-TOKEN');
        const xsrfToken = xsrfCookie ? decodeURIComponent(xsrfCookie.value) : '';

        const post = async <T>(endpoint: string, data: any, wrapInPayload: boolean = true): Promise<T | null> => {
            const url = `https://gate.pazltours.online/api${endpoint}`;
            const body = wrapInPayload ? { payload: JSON.stringify(data) } : data;

            try {
                const response = await page.request.post(url, {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-XSRF-TOKEN': xsrfToken,
                        'X-Requested-With': 'XMLHttpRequest',
                        'Referer': 'https://manager.pazltours.online/',
                        'Origin': 'https://manager.pazltours.online'
                    },
                    data: body
                });

                if (response.ok()) {
                    return await response.json() as T;
                }
                return null;
            } catch {
                return null;
            }
        };

        const get = async <T>(endpoint: string): Promise<T | null> => {
            const url = `https://gate.pazltours.online/api${endpoint}`;

            try {
                const response = await page.request.get(url, {
                    headers: {
                        'Accept': 'application/json',
                        'X-XSRF-TOKEN': xsrfToken,
                        'X-Requested-With': 'XMLHttpRequest',
                        'Referer': 'https://manager.pazltours.online/'
                    }
                });

                if (response.ok()) {
                    return await response.json() as T;
                }
                return null;
            } catch {
                return null;
            }
        };

        return { page, xsrfToken, post, get };
    }

    private async createTransport(
        api: ApiClient,
        sessionId: string,
        name: string,
        cityId: number
    ): Promise<number | null> {
        this.log(sessionId, `\n${'='.repeat(50)}`);
        this.log(sessionId, `🚌 Создание транспорта: "${name}"`);

        const dates = [
            { id: null, start_date: "2026-04-17", commission_type: 1, commission_sum: 0, freight: 0 },
            { id: null, start_date: "2026-04-18", commission_type: 1, commission_sum: 0, freight: 0 },
            { id: null, start_date: "2026-04-19", commission_type: 1, commission_sum: 0, freight: 0 },
            { id: null, start_date: "2026-04-20", commission_type: 1, commission_sum: 0, freight: 0 },
            { id: null, start_date: "2026-04-21", commission_type: 1, commission_sum: 0, freight: 0 },
            { id: null, start_date: "2026-04-22", commission_type: 1, commission_sum: 0, freight: 0 },
            { id: null, start_date: "2026-04-23", commission_type: 1, commission_sum: 0, freight: 0 },
            { id: null, start_date: "2026-04-24", commission_type: 1, commission_sum: 0, freight: 0 },
            { id: null, start_date: "2026-04-25", commission_type: 1, commission_sum: 0, freight: 0 }
        ];

        const data = {
            transportation_id: 54,
            vendor_id: 2,
            name: name,
            duration: "1",
            adult_price: "1000",
            child_price: "1000",
            start_date: "2026-04-17",
            finish_date: "2026-04-30",
            departure_type: 2,
            is_excursion: true,
            application_auto_confirm: false,
            auto_confirm_status: null,
            days: [],
            dates: dates,
            routes: {
                start: {
                    info: "информация начальный пункт",
                    point_city_id: cityId,
                    start_time: "10:00",
                    finish_time: null
                },
                intermediates: [{
                    point_city_id: cityId,
                    info: "информация промежуточная станция",
                    finish_time: "13:00",
                    start_time: "13:00",
                    arrival_day: "1",
                    departure_day: "1",
                    tariffs: [],
                    can_delete: true
                }],
                finish: {
                    info: "информация конечный пункт",
                    point_city_id: cityId,
                    start_time: null,
                    finish_time: "17:00"
                }
            },
            tariffs: [
                { from_city_id: cityId, to_city_id: cityId, tariff: 0 },
                { from_city_id: cityId, to_city_id: cityId, tariff: 0 },
                { from_city_id: cityId, to_city_id: cityId, tariff: 0 }
            ],
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

        const result = await api.post<any>('/transports', data);

        if (result) {
            this.log(sessionId, `🔍 Поиск ID созданного транспорта...`);
            const listResult = await api.get<any>(`/transports?query=${encodeURIComponent(name)}&limit=10`);

            if (listResult?.data && Array.isArray(listResult.data)) {
                const found = listResult.data.find((t: any) => t.name === name);
                if (found) {
                    this.log(sessionId, `✅ Транспорт создан! ID: ${found.id}`);
                    return found.id;
                }
            }

            const lastResult = await api.get<any>(`/transports?limit=1&ascending=0&page=1`);
            if (lastResult?.data && lastResult.data.length > 0) {
                const lastTransport = lastResult.data[0];
                this.log(sessionId, `✅ Транспорт создан (последний)! ID: ${lastTransport.id}`);
                return lastTransport.id;
            }
        }

        this.log(sessionId, `❌ Не удалось создать транспорт`);
        return null;
    }

    private async createHotel(
        api: ApiClient,
        sessionId: string,
        name: string,
        cityId: number
    ): Promise<number | null> {
        this.log(sessionId, `\n${'='.repeat(50)}`);
        this.log(sessionId, `🏨 Создание отеля: "${name}"`);

        const shortName = name.length > 100 ? name.substring(0, 97) + '...' : name;

        const data = {
            departure_time: "15:00",
            promotion_id: null,
            desc_files: [],
            memo_files: [],
            photos: [],
            videos: [],
            meals: [{ id: 2, sum: "0" }],
            commission_general_sum: "0",
            is_differentiate: false,
            commission_adult_type: 1,
            commission_adult_sum: 0,
            commission_child_type: 1,
            commission_child_sum: 0,
            commission_adv_adult_type: 1,
            commission_adv_adult_sum: 0,
            commission_adv_child_type: 1,
            commission_adv_child_sum: 0,
            commission_child_without_place_type: 1,
            commission_child_without_place_sum: 0,
            commission_meal_type: 1,
            commission_meal_sum: 0,
            vendor_id: 2,
            dealer_id: null,
            description: "<p>описание гостиницы</p>",
            info: null,
            is_excursion: true,
            catalog_sections: [],
            catalog: { sort: 0, sum: 0 },
            coords: null,
            is_search_priority: false,
            application_auto_confirm: false,
            auto_confirm_status: null,
            status: 1,
            city_id: cityId,
            name: shortName,
            address: "москва тест",
            category_type: 2,
            stars: 3,
            arrival_time: "10:00",
            services: [],
            infrastructures: [{ id: 197, pay: 0, type: 15 }],
            rooms: [{
                accommodation_id: 1,
                type_id: 2,
                place_id: 2,
                quota: false,
                quota_count: null,
                adult_count: "1",
                child_count: "0",
                adult_price: "",
                child_price: "",
                child_without: false,
                is_children_in_adult_places: false,
                is_children_in_adv_adult_places: false,
                child_without_price: "",
                adv_adult_count: "0",
                adv_child_count: "0",
                adv_adult_price: "",
                adv_child_price: "",
                photos: [],
                name: "",
                meals: [2],
                premises: [],
                area: null,
                dates: [{
                    id: null,
                    from: "2026-04-17",
                    to: "2026-04-30",
                    is_total_price: true,
                    total_price: "1000",
                    adult_price: "100",
                    child_price: null,
                    child_without_price: "0",
                    adv_adult_price: "0",
                    adv_child_price: "0",
                    commission_general_sum: "0",
                    is_differentiate: false,
                    commission_adult_type: 1,
                    commission_adult_sum: 0,
                    commission_child_type: 1,
                    commission_child_sum: 0,
                    commission_adv_adult_type: 1,
                    commission_adv_adult_sum: 0,
                    commission_adv_child_type: 1,
                    commission_adv_child_sum: 0,
                    commission_child_without_place_type: 1,
                    commission_child_without_place_sum: 0
                }],
                description_id: 2,
                place: { id: 2, name: "1 местный", places_count: 1, adv_places_count: 0 },
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
                type: { id: 2, name: "Эконом" },
                description: { id: 2, name: "с балконом" }
            }]
        };

        const result = await api.post<any>('/hotels', data);

        if (result) {
            this.log(sessionId, `🔍 Поиск ID созданного отеля...`);
            const listResult = await api.get<any>(`/hotels?query=${encodeURIComponent(shortName)}&limit=10`);

            if (listResult?.data && Array.isArray(listResult.data)) {
                const found = listResult.data.find((h: any) => h.name === shortName);
                if (found) {
                    this.log(sessionId, `✅ Отель создан! ID: ${found.id}`);
                    return found.id;
                }
            }

            const lastResult = await api.get<any>(`/hotels?limit=1&ascending=0&page=1`);
            if (lastResult?.data && lastResult.data.length > 0) {
                const lastHotel = lastResult.data[0];
                this.log(sessionId, `✅ Отель создан (последний)! ID: ${lastHotel.id}`);
                return lastHotel.id;
            }
        }

        this.log(sessionId, `❌ Не удалось создать отель`);
        return null;
    }

    private async createTourObject(
        api: ApiClient,
        sessionId: string,
        tourName: string,
        cityId: number,
        transportId: number | null,
        hotelId: number | null
    ): Promise<number | null> {
        this.log(sessionId, `\n${'='.repeat(50)}`);
        this.log(sessionId, `🎯 Создание тура: "${tourName}"`);

        const data = {
            id: null,
            name: tourName,
            is_active: false,
            is_hotel_selection: false,
            application_auto_confirm: false,
            auto_confirm_status: null,
            duration: "1",
            tour_type_id: 1,
            city_id: cityId,
            hotels: hotelId ? [{
                id: hotelId,
                city_id: cityId,
                arrival_day: "1",
                departure_day: "1",
                meal_id: 2
            }] : [],
            dates: [
                { start_date: "2026-04-18" },
                { start_date: "2026-04-20" }
            ],
            days: [{
                name: "заголовок день",
                description: "<p>описание день</p>",
                photos: []
            }],
            services: [],
            required_services: [{
                id: 231,
                day: "1",
                service_class: "individual"
            }],
            additional_services: [],
            catalog_sections: [],
            trade_offers: [13],
            photos: [],
            files: [],
            videos: [],
            short_description: "<p>краткое описание</p>",
            description: "<p>описание тура</p>",
            info: null,
            additional_dates: "<p>даты тура</p>",
            additional_cities: "<p>города посадки</p>",
            additional_price: "<p>стоимость тура</p>",
            additional_price_includes: "<p>в стоимость включено</p>",
            additional_extra_price: "<p>за доп плату</p>",
            commission_transport_type: 1,
            commission_transport_sum: "0",
            commission_accommodation_type: 1,
            commission_accommodation_sum: "0",
            commission_agency_type: "2",
            commission_agency_sum: "10",
            meal_price: null,
            commission_meal_type: 1,
            commission_meal_sum: null,
            adult_price: null,
            commission_adult_type: 1,
            commission_adult_sum: null,
            child_price: null,
            commission_child_type: 1,
            commission_child_sum: null,
            meals: [{
                id: null,
                name: "тестовое питание",
                vendor_id: 2,
                days: [1],
                vendor_name: "Авианна",
                dates: [{
                    id: null,
                    from: "2026-04-17",
                    to: "2026-04-30",
                    price: "1000",
                    commission_type: 1,
                    commission_sum: 0
                }],
                can_delete: true,
                sum: 0,
                commission_type: 1,
                commission_sum: 0,
                uid: Date.now()
            }],
            status: 1,
            category_id: 3,
            transport_forth_id: transportId,
            transport_back_id: null
        };

        const result = await api.post<any>('/tours', data);

        if (result) {
            this.log(sessionId, `🔍 Поиск ID созданного тура...`);
            const listResult = await api.get<any>(`/tours?query=${encodeURIComponent(tourName)}&limit=10`);

            if (listResult?.data && Array.isArray(listResult.data)) {
                const found = listResult.data.find((t: any) => t.name === tourName);
                if (found) {
                    this.log(sessionId, `✅ Тур создан! ID: ${found.id}`);
                    this.log(sessionId, `🔗 https://manager.pazltours.online/tours/${found.id}/edit`);
                    return found.id;
                }
            }

            const lastResult = await api.get<any>(`/tours?limit=1&ascending=0&page=1`);
            if (lastResult?.data && lastResult.data.length > 0) {
                const lastTour = lastResult.data[0];
                this.log(sessionId, `✅ Тур создан (последний)! ID: ${lastTour.id}`);
                this.log(sessionId, `🔗 https://manager.pazltours.online/tours/${lastTour.id}/edit`);
                return lastTour.id;
            }
        }

        this.log(sessionId, `❌ Не удалось создать тур`);
        return null;
    }

    async createTour(sessionId: string, email: string, password: string, tourName: string, cityId: number): Promise<void> {
        const logFile = `full-tour-${sessionId}-${Date.now()}.log`;
        const status: JobStatus = {
            status: 'processing',
            step: 'login',
            log: []
        };

        this.activeJobs.set(sessionId, { status, logFile });

        try {
            let page = this.browserService.getPage(sessionId);

            if (!page) {
                page = await this.browserService.createSession(sessionId);
            }

            // Шаг 1: Логин (проверяем, что уже залогинены)
            this.log(sessionId, '🚀 Начало создания тура');

            const currentUrl = page.url();
            if (currentUrl.includes('/auth') || !currentUrl.includes('manager')) {
                this.log(sessionId, '📌 ШАГ 1: Вход в систему');
                await page.goto('https://manager.pazltours.online/auth');
                await page.waitForTimeout(2000);
                await page.fill('input[type="text"]', email);
                await page.fill('input[type="password"]', password);
                await page.click('#kt_login_singin_form_submit_button');
                await page.waitForTimeout(5000);
            }

            this.log(sessionId, '✅ Вход выполнен');
            status.step = 'transport';
            this.emit('status', { sessionId, status });

            await page.goto('https://manager.pazltours.online/tours');
            await page.waitForTimeout(2000);

            const api = await this.createApiClient(page);
            const timestamp = Date.now();

            const transportName = `Автобус ${timestamp}`;
            const hotelName = `Гостиница ${timestamp}`;
            const fullTourName = tourName || `Тур ${timestamp}`;

            this.log(sessionId, `\n📌 ШАГ 2: Создание компонентов`);
            this.log(sessionId, `🏙️ Город ID: ${cityId}`);
            this.log(sessionId, `🚌 Транспорт: ${transportName}`);
            this.log(sessionId, `🏨 Отель: ${hotelName}`);
            this.log(sessionId, `🎯 Тур: ${fullTourName}`);

            // Создаём транспорт
            status.step = 'transport';
            this.emit('status', { sessionId, status });
            const transportId = await this.createTransport(api, sessionId, transportName, cityId);

            if (!transportId) {
                throw new Error('Не удалось создать транспорт');
            }

            // Создаём отель
            status.step = 'hotel';
            this.emit('status', { sessionId, status });
            const hotelId = await this.createHotel(api, sessionId, hotelName, cityId);

            // Создаём тур
            status.step = 'tour';
            this.emit('status', { sessionId, status });
            const tourId = await this.createTourObject(api, sessionId, fullTourName, cityId, transportId, hotelId);

            if (!tourId) {
                throw new Error('Не удалось создать тур');
            }

            this.log(sessionId, '\n📌 РЕЗУЛЬТАТЫ:');
            this.log(sessionId, `  🚌 Транспорт ID: ${transportId}`);
            this.log(sessionId, `  🏨 Отель ID: ${hotelId || '❌'}`);
            this.log(sessionId, `  🎯 Тур ID: ${tourId}`);

            status.status = 'completed';
            status.step = 'done';
            status.transportId = transportId || undefined;
            status.hotelId = hotelId || undefined;
            status.tourId = tourId;
            status.tourUrl = `https://manager.pazltours.online/tours/${tourId}/edit`;

            this.emit('status', { sessionId, status });
            this.log(sessionId, '🎉 Тур успешно создан!');

            // Открываем страницу тура
            await page.goto(`https://manager.pazltours.online/tours/${tourId}/edit`);

        } catch (error: any) {
            status.status = 'failed';
            status.error = error.message;
            this.log(sessionId, `❌ КРИТИЧЕСКАЯ ОШИБКА: ${error.message}`);
            this.emit('status', { sessionId, status });
            throw error;
        }
    }

    getStatus(sessionId: string): JobStatus | undefined {
        return this.activeJobs.get(sessionId)?.status;
    }
}