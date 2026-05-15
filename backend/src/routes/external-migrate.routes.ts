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
    days: { name: string; description: string }[];
    meals: { name: string; days: number[]; vendor_name: string }[];
    tourDates: string[];
    cities: string[];
    prices: { adult_price: string; child_price: string; commission_agency_sum: string };
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
    try { session.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (e) {}
}

// ============================================
// SOCKS5 TUNNEL (через npm пакет socks)
// ============================================

const SocksClient = require('socks').SocksClient;

function socks5TunnelRequest(options: {
    host: string;
    port: number;
    path: string;
    method: string;
    headers: Record<string, string>;
    body: string;
}): Promise<{ status: number; data: string }> {
    return new Promise((resolve, reject) => {
        const requestBody = options.body;

        SocksClient.createConnection({
            proxy: {
                host: '5.129.231.194',
                port: 1080,
                type: 5,
            },
            command: 'connect',
            destination: {
                host: options.host,
                port: options.port,
            },
        }, (err: any, info: any) => {
            if (err) {
                reject(new Error(`SOCKS5 connect failed: ${err.message}`));
                return;
            }

            const socket = info.socket;
            let responseData = '';
            let contentLength = -1;
            let headerEnd = -1;

            const requestLines = [
                `${options.method} ${options.path} HTTP/1.1`,
                `Host: ${options.host}`,
                ...Object.entries(options.headers).map(([k, v]) => `${k}: ${v}`),
                `Content-Length: ${Buffer.byteLength(requestBody)}`,
                'Connection: close',
                '',
                requestBody,
            ];

            socket.write(requestLines.join('\r\n'));

            socket.on('data', (chunk: Buffer) => {
                responseData += chunk.toString();

                if (headerEnd === -1) {
                    headerEnd = responseData.indexOf('\r\n\r\n');
                }

                if (headerEnd !== -1) {
                    const headers = responseData.substring(0, headerEnd);
                    const clMatch = headers.match(/Content-Length: (\d+)/i);
                    if (clMatch) contentLength = parseInt(clMatch[1]);

                    const bodyStart = headerEnd + 4;
                    if (contentLength > 0 && responseData.length - bodyStart >= contentLength) {
                        const statusMatch = headers.match(/HTTP\/\d\.\d (\d+)/);
                        resolve({
                            status: statusMatch ? parseInt(statusMatch[1]) : 200,
                            data: responseData.substring(bodyStart)
                        });
                        socket.destroy();
                    }
                }
            });

            socket.on('error', (e: Error) => {
                reject(e);
                socket.destroy();
            });

            socket.on('close', () => {
                if (responseData) {
                    const hEnd = responseData.indexOf('\r\n\r\n');
                    if (hEnd !== -1) {
                        const statusMatch = responseData.substring(0, hEnd).match(/HTTP\/\d\.\d (\d+)/);
                        resolve({
                            status: statusMatch ? parseInt(statusMatch[1]) : 200,
                            data: responseData.substring(hEnd + 4)
                        });
                    }
                }
            });

            setTimeout(() => {
                reject(new Error('SOCKS5 timeout'));
                socket.destroy();
            }, 30000);
        });
    });
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

1. ТУР (tour): {"name":"","duration":"","tour_type_id":1,"short_description":"","description":"","info":"","is_active":true}
2. ТРАНСПОРТ (transport): {"name":"","transportation_type":"","adult_price":"","child_price":"","duration":"","routes":{"start":{"city":"","time":"","info":""},"finish":{"city":"","time":"","info":""},"intermediates":[]},"dates":[]}
3. ОТЕЛИ (hotels): [{"name":"","city":"","stars":3,"address":"","description":"","meals":[],"rooms":[]}]
4. УСЛУГИ (services): [{"name":"","class":"group","description":"","dates":[{"from":"","to":"","vendor_price":"0","adult_price":"0","child_price":"0","commission_adult_sum":0,"commission_child_sum":0}]}]
5. ДНИ (days): [{"name":"","description":""}]
6. ПИТАНИЕ (meals): [{"name":"","days":[],"vendor_name":""}]
7. ОБЩИЕ: {"tourDates":[],"cities":[],"prices":{"adult_price":"","child_price":"","commission_agency_sum":"0"},"additional_price":"","additional_price_includes":"","additional_extra_price":"","included":[],"notIncluded":[]}

ПРАВИЛА: только что указано в тексте, нет — null или [], цены числами, даты YYYY-MM-DD, не придумывай.
Верни JSON: {tour, transport, hotels, services, days, meals, tourDates, cities, prices, additional_price, additional_price_includes, additional_extra_price, included, notIncluded}

Текст: ${rawText.substring(0, 20000)}`;

    try {
        console.log('🤖 Отправляем запрос к Gemini через SOCKS5...');

        const body = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8000 }
        });

        const result = await socks5TunnelRequest({
            host: 'generativelanguage.googleapis.com',
            port: 443,
            path: `/v1beta/models/gemini-3.1-flash-lite:generateContent`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': AI_API_KEY,
            },
            body,
        });

        if (result.status !== 200) {
            console.error('❌ Gemini API error:', result.status, result.data.substring(0, 500));
            return null;
        }

        let jsonData: any;
        try {
            jsonData = JSON.parse(result.data);
        } catch (e: any) {
            console.error('❌ JSON parse error:', e.message);
            console.error('📦 Raw:', result.data.substring(0, 500));
            return null;
        }

        const content = jsonData?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!content) {
            console.log('❌ Gemini пустой ответ');
            return null;
        }

        console.log('📦 Gemini:', content.substring(0, 300));

        let jsonStr = content.trim();
        const m = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (m) jsonStr = m[1].trim();

        const parsed: AIParsedTour = JSON.parse(jsonStr);
        console.log('✅ Тур:', parsed.tour?.name);
        return parsed;

    } catch (error: any) {
        console.error('❌ Gemini error:', error.message);
        return null;
    }
}

// ============================================
// ПАРСИНГ СТРАНИЦЫ
// ============================================

async function parseExternalPage(url: string): Promise<ParsedTourData> {
    console.log(`🔍 Открываем: ${url}`);

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
                let h = 0;
                const t = setInterval(() => { window.scrollBy(0, 300); h += 300; if (h >= document.body.scrollHeight) { clearInterval(t); resolve(); } }, 100);
            });
        });
        await page.waitForTimeout(1000);

        const pageTitle = await page.title();

        const rawText = await page.evaluate(() => {
            document.querySelectorAll('script, style, noscript, iframe, nav, footer, header').forEach(s => { try { s.remove(); } catch (e) {} });
            return document.body?.innerText || '';
        });

        const cleanedText = rawText.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{3,}/g, '  ').trim();
        console.log(`📄 Текст: ${cleanedText.length} символов`);

        const aiResult = await parseWithAI(cleanedText, url);

        const blocks: ParsedBlock[] = [];
        let id = 0;

        if (aiResult) {
            const t = aiResult.tour;
            if (t?.name) blocks.push({ id: `block_${id++}`, type: 'tour_title', title: '🏷️ Название тура', content: t.name, rawHtml: '' });
            if (t?.duration) blocks.push({ id: `block_${id++}`, type: 'duration', title: '⏱️ Длительность', content: `${t.duration} дней`, rawHtml: '' });
            if (t?.short_description) blocks.push({ id: `block_${id++}`, type: 'description', title: '📝 Краткое описание', content: t.short_description, rawHtml: '' });
            if (t?.description) blocks.push({ id: `block_${id++}`, type: 'description', title: '📄 Полное описание', content: t.description, rawHtml: '' });
            if (t?.info) blocks.push({ id: `block_${id++}`, type: 'info', title: 'ℹ️ Доп. информация', content: t.info, rawHtml: '' });
            if (aiResult.transport) blocks.push({ id: `block_${id++}`, type: 'transport', title: '🚌 Транспорт', content: JSON.stringify(aiResult.transport, null, 2), rawHtml: '' });
            if (aiResult.hotels?.length) blocks.push({ id: `block_${id++}`, type: 'hotel', title: `🏨 Отели (${aiResult.hotels.length})`, content: JSON.stringify(aiResult.hotels, null, 2), rawHtml: '' });
            if (aiResult.services?.length) blocks.push({ id: `block_${id++}`, type: 'service', title: `🛠️ Услуги (${aiResult.services.length})`, content: JSON.stringify(aiResult.services, null, 2), rawHtml: '' });
            if (aiResult.days?.length) blocks.push({ id: `block_${id++}`, type: 'program', title: `📅 Программа (${aiResult.days.length} дн)`, content: JSON.stringify(aiResult.days, null, 2), rawHtml: '' });
            if (aiResult.prices) blocks.push({ id: `block_${id++}`, type: 'price', title: '💰 Цены', content: JSON.stringify(aiResult.prices, null, 2), rawHtml: '' });
            if (aiResult.cities?.length) blocks.push({ id: `block_${id++}`, type: 'departure_cities', title: '📍 Города', content: aiResult.cities.join(', '), rawHtml: '' });
            if (aiResult.tourDates?.length) blocks.push({ id: `block_${id++}`, type: 'dates', title: '📆 Даты', content: aiResult.tourDates.join(', '), rawHtml: '' });
            if (aiResult.included?.length) blocks.push({ id: `block_${id++}`, type: 'included', title: '✅ Включено', content: aiResult.included.join('\n'), rawHtml: '' });
            if (aiResult.notIncluded?.length) blocks.push({ id: `block_${id++}`, type: 'extra', title: '❌ Дополнительно', content: aiResult.notIncluded.join('\n'), rawHtml: '' });
            if (aiResult.meals?.length) blocks.push({ id: `block_${id++}`, type: 'meals', title: '🍽️ Питание', content: JSON.stringify(aiResult.meals, null, 2), rawHtml: '' });
        }

        blocks.push({ id: `block_${id++}`, type: 'raw_text', title: '📋 Полный текст страницы', content: cleanedText.substring(0, 8000), rawHtml: '' });
        console.log(`✅ Блоков: ${blocks.length} (AI: ${aiResult ? 'да' : 'нет'})`);

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
        const parsedData = await parseExternalPage(url);
        res.json({ success: true, data: parsedData });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/create', async (req: Request, res: Response) => {
    const { parsedData, matchedEntities, pazlEmail, pazlPassword } = req.body;
    if (!parsedData || !matchedEntities || !pazlEmail || !pazlPassword) {
        return res.status(400).json({ success: false, error: 'Все поля обязательны' });
    }
    const sessionId = `ext_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessions.set(sessionId, { res: null, status: 'starting', log: [] });
    res.json({ success: true, data: { sessionId } });
    runMigration(sessionId, parsedData, matchedEntities, pazlEmail, pazlPassword).catch(err => {
        sendSSE(sessionId, 'error', { message: err.message });
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
    if (session) { session.res = res; for (const e of session.log) res.write(`event: step\ndata: ${JSON.stringify(e)}\n\n`); }
    else sessions.set(sessionId, { res, status: 'connected', log: [] });
    const ping = setInterval(() => { try { res.write(`: ping ${Date.now()}\n\n`); } catch (e) { clearInterval(ping); } }, 15000);
    req.on('close', () => clearInterval(ping));
});

// ============================================
// МИГРАЦИЯ
// ============================================

async function runMigration(sessionId: string, parsedData: ParsedTourData, matchedEntities: any[], pazlEmail: string, pazlPassword: string) {
    let browser: any = null;
    try {
        sendSSE(sessionId, 'step', { step: 0, status: 'active', message: 'Запуск...' });
        browser = await chromium.launch({ headless: true, executablePath: '/snap/bin/chromium', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await page.goto('https://manager.pazltours.online/auth');
        await page.waitForTimeout(3000);
        const emailEl = await page.$('input[type="text"]') || await page.$('input[name="login"]');
        const passEl = await page.$('input[type="password"]');
        if (!emailEl || !passEl) { sendSSE(sessionId, 'step', { step: 0, status: 'error', message: 'Поля не найдены' }); await browser.close(); return; }
        await emailEl.fill(pazlEmail);
        await passEl.fill(pazlPassword);
        const btn = await page.$('button[type="submit"]');
        if (btn) await btn.click(); else await passEl.press('Enter');
        await page.waitForTimeout(5000);
        if (!page.url().includes('/welcome') && !page.url().includes('/dashboard')) { sendSSE(sessionId, 'step', { step: 0, status: 'error', message: 'Неверный логин/пароль' }); await browser.close(); return; }
        sendSSE(sessionId, 'step', { step: 0, status: 'completed', message: 'Вход выполнен' });
        sendSSE(sessionId, 'step', { step: 1, status: 'completed', message: 'Готово' });
        const name = parsedData.aiResult?.tour?.name || parsedData.title || 'Тур';
        sendSSE(sessionId, 'result', { success: true, data: { tourData: { name, sourceUrl: parsedData.url }, matchedEntities, stats: { total: matchedEntities.length }, createdEntities: [], message: `Тур: "${name}". Сущностей: ${matchedEntities.length}` } });
    } catch (e: any) { sendSSE(sessionId, 'error', { message: e.message }); }
    finally { if (browser) try { await browser.close(); } catch (e) {} }
}

export default router;