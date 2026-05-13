// src/routes/external-migrate.routes.ts
import { Router, Request, Response } from 'express';
import { chromium } from 'playwright';

const router = Router();

// ============================================
// КОНФИГ ДЛЯ GEMINI AI
// ============================================

const AI_API_KEY = process.env.AI_API_KEY || 'AIzaSyBNB2r5vN1hbvFQetpP_TOs3ru9pb8WjOk';
const AI_API_URL = process.env.AI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';
// ============================================
// ТИПЫ
// ============================================

interface ParsedBlock {
    id: string;
    type: string;
    title: string;
    content: string;
    rawHtml: string;
}

interface ParsedTourData {
    url: string;
    title: string;
    blocks: ParsedBlock[];
    rawText: string;
    aiResult?: AIParsedTour;
}

interface AIParsedTour {
    tour: {
        name: string;
        duration: string;
        tour_type_id: number;
        short_description: string;
        description: string;
        info: string;
        is_active: boolean;
    };
    transport: {
        name: string;
        transportation_type: string;
        adult_price: string;
        child_price: string;
        duration: string;
        routes: {
            start: { city: string; time: string; info: string };
            finish: { city: string; time: string; info: string };
            intermediates: { city: string; time: string; info: string; arrival_day: number; departure_day: number }[];
        };
        dates: { start_date: string }[];
    };
    hotels: {
        name: string;
        city: string;
        stars: number;
        address: string;
        description: string;
        meals: { name: string; sum: string }[];
        rooms: {
            name: string;
            type: string;
            place: string;
            accommodation: string;
            description: string;
            adult_count: string;
            child_count: string;
            adult_price: string;
            child_price: string;
        }[];
    }[];
    services: {
        name: string;
        class: string;
        description: string;
        dates: {
            from: string;
            to: string;
            vendor_price: string;
            adult_price: string;
            child_price: string;
            commission_adult_sum: number;
            commission_child_sum: number;
        }[];
    }[];
    days: {
        name: string;
        description: string;
    }[];
    meals: {
        name: string;
        days: number[];
        vendor_name: string;
    }[];
    tourDates: string[];
    cities: string[];
    prices: {
        adult_price: string;
        child_price: string;
        commission_agency_sum: string;
    };
    additional_price: string;
    additional_price_includes: string;
    additional_extra_price: string;
    included: string[];
    notIncluded: string[];
}

// ============================================
// ХРАНИЛИЩЕ СЕССИЙ
// ============================================

const sessions = new Map<string, {
    res: Response | null;
    status: string;
    log: any[];
    parsedData?: ParsedTourData;
    error?: string;
}>();

function sendSSE(sessionId: string, event: string, data: any) {
    const session = sessions.get(sessionId);
    if (!session) return;
    if (event === 'step') session.log.push(data);
    if (!session.res) return;
    try {
        session.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {}
}

// ============================================
// GEMINI AI ПАРСИНГ
// ============================================

async function parseWithAI(rawText: string, url: string): Promise<AIParsedTour | null> {
    if (!AI_API_KEY) {
        console.log('⚠️ AI API ключ не настроен');
        return null;
    }

    const prompt = `Ты — эксперт по парсингу туристических сайтов для CMS Pazl Tours. Извлеки ВСЕ данные о туре и верни ТОЛЬКО JSON.

СТРУКТУРА ОБЪЕКТОВ PAZL TOURS:

1. ТУР (tour):
{
  "name": "полное название тура",
  "duration": "длительность в днях (только число)",
  "tour_type_id": 1,
  "short_description": "краткое описание (1-2 предложения)",
  "description": "полное описание тура",
  "info": "дополнительная информация (что взять, важные заметки)",
  "is_active": true
}

2. ТРАНСПОРТ (transport):
{
  "name": "название маршрута",
  "transportation_type": "тип транспорта (автобус, микроавтобус, поезд, самолёт)",
  "adult_price": "цена взрослого (только число)",
  "child_price": "цена детского (только число)",
  "duration": "длительность поездки в часах",
  "routes": {
    "start": { "city": "город отправления", "time": "время отправления", "info": "место посадки" },
    "finish": { "city": "город возвращения", "time": "время возвращения", "info": "место высадки" },
    "intermediates": [
      { "city": "промежуточный город", "time": "время", "info": "информация", "arrival_day": 1, "departure_day": 1 }
    ]
  },
  "dates": [{ "start_date": "YYYY-MM-DD" }]
}

3. ОТЕЛИ (hotels) — массив:
{
  "name": "название отеля",
  "city": "город",
  "stars": 3,
  "address": "адрес",
  "description": "описание",
  "meals": [{ "name": "Завтрак", "sum": "0" }],
  "rooms": [{
    "name": "название номера",
    "type": "Стандарт / Полулюкс / Люкс",
    "place": "1 местный / 2-х местный / 1/2 двухместного",
    "accommodation": "Эконом / Средние / Комфорт",
    "description": "описание номера",
    "adult_count": "количество взрослых",
    "child_count": "количество детей",
    "adult_price": "цена взрослого",
    "child_price": "цена ребёнка"
  }]
}

4. УСЛУГИ (services) — массив:
{
  "name": "название услуги",
  "class": "group или individual",
  "description": "описание",
  "dates": [{
    "from": "YYYY-MM-DD",
    "to": "YYYY-MM-DD",
    "vendor_price": "цена поставщика",
    "adult_price": "цена взрослого",
    "child_price": "цена детского",
    "commission_adult_sum": 0,
    "commission_child_sum": 0
  }]
}

5. ДНИ ПРОГРАММЫ (days) — массив:
{
  "name": "День 1: Заголовок",
  "description": "описание программы дня"
}

6. ПИТАНИЕ (meals) — массив:
{
  "name": "Завтрак / Обед / Ужин",
  "days": [1, 2, 3],
  "vendor_name": ""
}

7. ОБЩИЕ ДАННЫЕ:
{
  "tourDates": ["дата1", "дата2"],
  "cities": ["город1", "город2"],
  "prices": {
    "adult_price": "базовая цена взрослого",
    "child_price": "базовая цена ребёнка",
    "commission_agency_sum": "0"
  },
  "additional_price": "",
  "additional_price_includes": "",
  "additional_extra_price": "",
  "included": ["что включено 1"],
  "notIncluded": ["что не включено 1"]
}

ПРАВИЛА:
- Извлекай ТОЛЬКО то, что явно указано в тексте
- Если чего-то нет — оставь пустой массив [] или null
- Цены указывай ТОЛЬКО числами, без символов валют
- Даты приводи к формату YYYY-MM-DD
- Не придумывай данные

Верни ОДИН JSON объект содержащий поля: tour, transport, hotels, services, days, meals, tourDates, cities, prices, additional_price, additional_price_includes, additional_extra_price, included, notIncluded

Текст страницы:
${rawText.substring(0, 20000)}`;

    try {
        console.log('🤖 Отправляем запрос к Gemini...');

        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': AI_API_KEY,
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            { text: prompt }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 8000,
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Gemini API error:', response.status, errorText.substring(0, 500));
            return null;
        }

        const data: any = await response.json();
        const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!content) {
            console.log('❌ Gemini вернул пустой ответ');
            return null;
        }

        console.log('📦 Gemini ответ (первые 500):', content.substring(0, 500));

        let jsonStr = content.trim();
        const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (jsonMatch) jsonStr = jsonMatch[1].trim();

        const parsed: AIParsedTour = JSON.parse(jsonStr);

        console.log('✅ Gemini распарсил тур:', parsed.tour?.name);
        return parsed;

    } catch (error: any) {
        console.error('❌ Ошибка Gemini парсинга:', error.message);
        return null;
    }
}

// ============================================
// ПАРСИНГ СТРАНИЦЫ
// ============================================

async function parseExternalPage(url: string): Promise<ParsedTourData> {
    console.log(`🔍 Открываем страницу: ${url}`);

    const browser = await chromium.launch({
        headless: true,
        executablePath: '/snap/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    try {
        const page = await browser.newPage();
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);

        await page.evaluate(async () => {
            await new Promise<void>((resolve) => {
                let totalHeight = 0;
                const timer = setInterval(() => {
                    window.scrollBy(0, 300);
                    totalHeight += 300;
                    if (totalHeight >= document.body.scrollHeight) { clearInterval(timer); resolve(); }
                }, 100);
            });
        });
        await page.waitForTimeout(1000);

        const pageTitle = await page.title();

        const rawText = await page.evaluate(() => {
            const elementsToRemove = document.querySelectorAll('script, style, noscript, iframe, nav, footer, header');
            elementsToRemove.forEach(s => { try { s.remove(); } catch (e) {} });
            return document.body?.innerText || document.body?.textContent || '';
        });

        const cleanedText = rawText.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{3,}/g, '  ').trim();
        console.log(`📄 Текст страницы: ${cleanedText.length} символов`);

        const aiResult = await parseWithAI(cleanedText, url);

        const blocks: ParsedBlock[] = [];
        let id = 0;

        if (aiResult) {
            const tour = aiResult.tour;
            if (tour?.name) blocks.push({ id: `block_${id++}`, type: 'tour_title', title: '🏷️ Название тура', content: tour.name, rawHtml: '' });
            if (tour?.duration) blocks.push({ id: `block_${id++}`, type: 'duration', title: '⏱️ Длительность', content: `${tour.duration} дней`, rawHtml: '' });
            if (tour?.short_description) blocks.push({ id: `block_${id++}`, type: 'description', title: '📝 Краткое описание', content: tour.short_description, rawHtml: '' });
            if (tour?.description) blocks.push({ id: `block_${id++}`, type: 'description', title: '📄 Полное описание', content: tour.description, rawHtml: '' });
            if (tour?.info) blocks.push({ id: `block_${id++}`, type: 'info', title: 'ℹ️ Доп. информация', content: tour.info, rawHtml: '' });

            if (aiResult.transport) blocks.push({ id: `block_${id++}`, type: 'transport', title: '🚌 Транспорт', content: JSON.stringify(aiResult.transport, null, 2), rawHtml: '' });

            if (aiResult.hotels?.length) blocks.push({ id: `block_${id++}`, type: 'hotel', title: `🏨 Отели (${aiResult.hotels.length})`, content: JSON.stringify(aiResult.hotels, null, 2), rawHtml: '' });

            if (aiResult.services?.length) blocks.push({ id: `block_${id++}`, type: 'service', title: `🛠️ Услуги (${aiResult.services.length})`, content: JSON.stringify(aiResult.services, null, 2), rawHtml: '' });

            if (aiResult.days?.length) blocks.push({ id: `block_${id++}`, type: 'program', title: `📅 Программа (${aiResult.days.length} дней)`, content: JSON.stringify(aiResult.days, null, 2), rawHtml: '' });

            if (aiResult.prices) blocks.push({ id: `block_${id++}`, type: 'price', title: '💰 Цены', content: JSON.stringify(aiResult.prices, null, 2), rawHtml: '' });

            if (aiResult.cities?.length) blocks.push({ id: `block_${id++}`, type: 'departure_cities', title: '📍 Города', content: aiResult.cities.join(', '), rawHtml: '' });

            if (aiResult.tourDates?.length) blocks.push({ id: `block_${id++}`, type: 'dates', title: '📆 Даты', content: aiResult.tourDates.join(', '), rawHtml: '' });

            if (aiResult.included?.length) blocks.push({ id: `block_${id++}`, type: 'included', title: '✅ Включено', content: aiResult.included.join('\n'), rawHtml: '' });

            if (aiResult.notIncluded?.length) blocks.push({ id: `block_${id++}`, type: 'extra', title: '❌ Дополнительно', content: aiResult.notIncluded.join('\n'), rawHtml: '' });

            if (aiResult.meals?.length) blocks.push({ id: `block_${id++}`, type: 'meals', title: '🍽️ Питание', content: JSON.stringify(aiResult.meals, null, 2), rawHtml: '' });
        }

        blocks.push({ id: `block_${id++}`, type: 'raw_text', title: '📋 Полный текст страницы', content: cleanedText.substring(0, 8000), rawHtml: '' });

        console.log(`✅ Создано блоков: ${blocks.length} (AI: ${aiResult ? 'да' : 'нет'})`);

        return { url, title: pageTitle || 'Тур', blocks, rawText: cleanedText, aiResult: aiResult || undefined };

    } finally {
        await browser.close();
    }
}

// ============================================
// РОУТЫ
// ============================================

router.post('/parse', async (req: Request, res: Response) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL обязателен' });

    try {
        console.log(`\n🔍 Парсинг страницы: ${url}`);
        const parsedData = await parseExternalPage(url);
        res.json({ success: true, data: parsedData });
    } catch (error: any) {
        console.error('❌ Ошибка парсинга:', error);
        res.status(500).json({ success: false, error: error.message || 'Ошибка парсинга' });
    }
});

router.post('/create', async (req: Request, res: Response) => {
    const { parsedData, matchedEntities, pazlEmail, pazlPassword } = req.body;
    if (!parsedData || !matchedEntities || !pazlEmail || !pazlPassword) {
        return res.status(400).json({ success: false, error: 'Все поля обязательны' });
    }

    const sessionId = `ext_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessions.set(sessionId, { res: null, status: 'starting', log: [] });
    console.log(`🆕 Сессия внешней миграции: ${sessionId}`);
    res.json({ success: true, data: { sessionId } });

    runExternalMigration(sessionId, parsedData, matchedEntities, pazlEmail, pazlPassword).catch(err => {
        console.error('Migration error:', err);
        sendSSE(sessionId, 'error', { message: err.message || 'Неизвестная ошибка' });
    });
});

router.get('/stream/:sessionId', (req: Request, res: Response) => {
    const sessionId = req.params.sessionId as string;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', 'https://tour-creator.tsukawa.ru');
    res.write(`event: connected\ndata: ${JSON.stringify({ sessionId })}\n\n`);

    const session = sessions.get(sessionId);
    if (session) {
        session.res = res;
        if (session.log.length > 0) {
            for (const logEntry of session.log) res.write(`event: step\ndata: ${JSON.stringify(logEntry)}\n\n`);
        }
    } else {
        sessions.set(sessionId, { res, status: 'connected', log: [] });
    }

    const ping = setInterval(() => { try { res.write(`: ping ${Date.now()}\n\n`); } catch (e) { clearInterval(ping); } }, 15000);
    req.on('close', () => { clearInterval(ping); });
});

// ============================================
// ВЫПОЛНЕНИЕ МИГРАЦИИ
// ============================================

async function runExternalMigration(
    sessionId: string, parsedData: ParsedTourData, matchedEntities: any[],
    pazlEmail: string, pazlPassword: string
) {
    let browser: any = null;
    try {
        sendSSE(sessionId, 'step', { step: 0, status: 'active', message: 'Запуск браузера...' });
        browser = await chromium.launch({
            headless: true, executablePath: '/snap/bin/chromium',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        const context = await browser.newContext();

        sendSSE(sessionId, 'step', { step: 0, status: 'active', message: 'Вход в Pazl Tours...' });
        const pazlPage = await context.newPage();
        await pazlPage.goto('https://manager.pazltours.online/auth');
        await pazlPage.waitForTimeout(3000);

        const emailInput = await pazlPage.$('input[type="text"]') || await pazlPage.$('input[name="login"]');
        const passwordInput = await pazlPage.$('input[type="password"]');
        if (!emailInput || !passwordInput) { sendSSE(sessionId, 'step', { step: 0, status: 'error', message: 'Поля не найдены' }); await browser.close(); return; }

        await emailInput.fill(pazlEmail);
        await passwordInput.fill(pazlPassword);
        const submitButton = await pazlPage.$('button[type="submit"]');
        if (submitButton) await submitButton.click(); else await passwordInput.press('Enter');
        await pazlPage.waitForTimeout(5000);

        if (!pazlPage.url().includes('/welcome') && !pazlPage.url().includes('/dashboard')) {
            sendSSE(sessionId, 'step', { step: 0, status: 'error', message: 'Неверный email или пароль' });
            await browser.close(); return;
        }

        sendSSE(sessionId, 'step', { step: 0, status: 'completed', message: 'Вход выполнен' });
        sendSSE(sessionId, 'step', { step: 1, status: 'completed', message: 'Данные подготовлены' });

        const tourName = parsedData.aiResult?.tour?.name || parsedData.title || 'Тур';
        const resultData = {
            success: true,
            data: {
                tourData: { name: tourName, sourceUrl: parsedData.url, blocksCount: parsedData.blocks.length },
                matchedEntities,
                stats: { total: matchedEntities.length, hotels: matchedEntities.filter((e: any) => e.entityType === 'hotel').length, transports: matchedEntities.filter((e: any) => e.entityType === 'transport').length, services: matchedEntities.filter((e: any) => e.entityType === 'service').length, days: matchedEntities.filter((e: any) => e.entityType === 'day').length },
                createdEntities: [],
                message: `Данные подготовлены. Тур: "${tourName}". Сущностей: ${matchedEntities.length}`
            }
        };
        sendSSE(sessionId, 'result', resultData);
    } catch (error: any) {
        sendSSE(sessionId, 'error', { message: error.message });
    } finally {
        if (browser) { try { await browser.close(); } catch (e) {} }
    }
}

export default router;