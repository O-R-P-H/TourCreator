// src/routes/external-migrate.routes.ts
import { Router, Request, Response } from 'express';
import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const router = Router();

// ============================================
// ТИПЫ
// ============================================

interface ParsedBlock {
    id: string;
    type: 'unknown' | 'hotel' | 'transport' | 'service' | 'day' | 'price' | 'info'
        | 'included' | 'extra' | 'program' | 'tour_title' | 'description'
        | 'dates' | 'departure_cities' | 'images' | 'text';
    title: string;
    content: string;
    rawHtml: string;
}

interface ParsedTourData {
    url: string;
    title: string;
    blocks: ParsedBlock[];
    rawText: string;
}

interface MatchedEntity {
    blockId: string;
    entityType: 'hotel' | 'transport' | 'service' | 'day' | 'price' | 'tour_info' | 'included' | 'dates' | 'departure';
    name: string;
    data: string;
}

// ============================================
// ХРАНИЛИЩЕ СЕССИЙ
// ============================================

const sessions = new Map<string, {
    res: Response | null;
    status: string;
    log: any[];
    parsedData?: ParsedTourData;
    matchedEntities?: MatchedEntity[];
    createdEntities?: any[];
    tourResult?: any;
    error?: string;
}>();

function sendSSE(sessionId: string, event: string, data: any) {
    const session = sessions.get(sessionId);
    if (!session) return;
    if (event === 'step') session.log.push(data);
    if (!session.res) {
        console.log(`⚠️ SSE: res отсутствует для сессии ${sessionId}, кешируем`);
        return;
    }
    try {
        session.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
        console.log('SSE send error:', e);
    }
}

// ============================================
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ
// ============================================

function determineSectionType(title: string, content: string): string {
    const combined = (title + ' ' + content).toLowerCase();

    if (/день\s*\d|1 день|2 день|3 день|программа|маршрут/i.test(combined)) return 'program';
    if (/включен|входит|в стоимость/i.test(combined)) return 'included';
    if (/дополнительн|оплачивается|не входит/i.test(combined)) return 'extra';
    if (/транспорт|автобус|проезд|микроавтобус|мерседес/i.test(combined)) return 'transport';
    if (/гостиниц|отель|размещен|проживан/i.test(combined)) return 'hotel';
    if (/услуг|экскурс|обслуживан|страховк/i.test(combined)) return 'service';
    if (/важно знать|правила|условия|рекоменд/i.test(combined)) return 'info';
    if (/описан|обзор|ущелье|памятник|природ/i.test(combined)) return 'description';

    return 'text';
}

// ============================================
// ПАРСИНГ ВНЕШНЕЙ СТРАНИЦЫ
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

        // Прокручиваем страницу
        await page.evaluate(async () => {
            await new Promise<void>((resolve) => {
                let totalHeight = 0;
                const timer = setInterval(() => {
                    window.scrollBy(0, 300);
                    totalHeight += 300;
                    if (totalHeight >= document.body.scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
        await page.waitForTimeout(1000);

        const pageTitle = await page.title();

        const blocks = await page.evaluate(() => {
            const result: any[] = [];
            let id = 0;

            // Удаляем мусорные элементы перед парсингом
            const removeSelectors = [
                'nav', 'footer', 'header', '.nav', '.menu', '.footer', '.header',
                '.sidebar', '.breadcrumbs', '.pagination', '.social', '.copyright',
                '.moduletable', '.module', '[class*="menu"]', '[class*="nav"]',
                'script', 'style', 'noscript', 'iframe', '.mod-wrapper',
                '.sp-megamenu-parent', '.logo', '.search', '#sp-header',
                '#sp-bottom', '#sp-footer', '.sp-module',
            ];

            for (const selector of removeSelectors) {
                try {
                    document.querySelectorAll(selector).forEach(el => {
                        el.innerHTML = '';
                        el.remove();
                    });
                } catch (e) {}
            }

            // ===== ИЗВЛЕКАЕМ КОНКРЕТНЫЕ ДАННЫЕ =====

            // 1. Название тура
            const h1 = document.querySelector('h1, .product-title, .tour-title, .item-title, h2');
            if (h1) {
                const titleText = h1.textContent?.trim() || '';
                if (titleText && titleText.length > 5) {
                    result.push({
                        id: `block_${id++}`,
                        type: 'tour_title',
                        title: 'Название тура',
                        content: titleText,
                        rawHtml: ''
                    });
                }
            }

            // 2. Основное описание
            const descSelectors = [
                '.product-description', '.tour-description', '.item-description',
                '.entry-content', '.post-content', '[itemprop="description"]',
                '.tab-content .active', '.sp-tab-content .active',
            ];

            for (const selector of descSelectors) {
                const el = document.querySelector(selector);
                if (el) {
                    const text = el.textContent?.trim() || '';
                    if (text.length > 50) {
                        const sections = el.querySelectorAll('h2, h3, h4, strong, b, p');
                        let currentSection = { title: 'Описание', content: '' };
                        let mainDescription = '';

                        for (const section of sections) {
                            const tag = section.tagName.toLowerCase();
                            const sectionText = section.textContent?.trim() || '';

                            if (['h2', 'h3', 'h4'].includes(tag) || (['strong', 'b'].includes(tag) && sectionText.length < 100)) {
                                if (currentSection.content.trim().length > 20) {
                                    const sectionType = determineSectionType(currentSection.title, currentSection.content);
                                    result.push({
                                        id: `block_${id++}`,
                                        type: sectionType,
                                        title: currentSection.title,
                                        content: currentSection.content.trim(),
                                        rawHtml: ''
                                    });
                                }
                                currentSection = { title: sectionText, content: '' };
                            } else {
                                currentSection.content += sectionText + '\n';
                                mainDescription += sectionText + '\n';
                            }
                        }

                        if (currentSection.content.trim().length > 20) {
                            const sectionType = determineSectionType(currentSection.title, currentSection.content);
                            result.push({
                                id: `block_${id++}`,
                                type: sectionType,
                                title: currentSection.title,
                                content: currentSection.content.trim(),
                                rawHtml: ''
                            });
                        }

                        if (mainDescription.trim().length > 50) {
                            result.push({
                                id: `block_${id++}`,
                                type: 'description',
                                title: 'Полное описание',
                                content: mainDescription.trim(),
                                rawHtml: ''
                            });
                        }
                    }
                    break;
                }
            }

            // 3. Цены
            const priceElements = document.querySelectorAll('.price, .product-price, .tour-price, [class*="price"], [class*="cost"]');
            const prices: string[] = [];
            for (const el of priceElements) {
                const text = el.textContent?.trim() || '';
                if (text && /[\d\s]+[₽р]/.test(text) && !prices.includes(text)) {
                    prices.push(text);
                }
            }
            if (prices.length > 0) {
                result.push({
                    id: `block_${id++}`,
                    type: 'price',
                    title: 'Цены',
                    content: prices.join('\n'),
                    rawHtml: ''
                });
            }

            // 4. Даты
            const datePattern = /\d{1,2}\s*(июн|июл|авг|сен|окт|ноя|дек|янв|фев|мар|апр|май|июня|июля|августа|сентября|октября|ноября|декабря|января|февраля|марта|апреля|мая)\s*,?\s*\d{4}?/gi;
            const bodyText = document.body.textContent || '';
            const foundDates = bodyText.match(datePattern);
            if (foundDates && foundDates.length > 0) {
                const uniqueDates = [...new Set(foundDates)].slice(0, 50);
                result.push({
                    id: `block_${id++}`,
                    type: 'dates',
                    title: 'Даты тура',
                    content: uniqueDates.join(', '),
                    rawHtml: ''
                });
            }

            // 5. Города отправления
            const citiesPattern = /(?:из|от|в)\s+(Анап|Новороссийск|Геленджик|Сочи|Краснодар|Москв|Санкт-Петербург|Казан|Екатеринбург|Ростов|Волгоград|Самар|Нижн|Воронеж|Крым|Симферопол|Ялт|Севастопол)/gi;
            const foundCities = bodyText.match(citiesPattern);
            if (foundCities && foundCities.length > 0) {
                const uniqueCities = [...new Set(foundCities)].slice(0, 20);
                result.push({
                    id: `block_${id++}`,
                    type: 'departure_cities',
                    title: 'Города отправления',
                    content: uniqueCities.join(', '),
                    rawHtml: ''
                });
            }

            // 6. Транспорт
            const transportPatterns = [
                /(?:проезд|транспорт|автобус|микроавтобус|поезд|самолёт|теплоход)[^.]*\./gi,
                /(?:Mercedes|Sprinter|Ford|Volvo|Scania|MAN|Neoplan|Setra)[^.]*\./gi,
            ];
            for (const pattern of transportPatterns) {
                const found = bodyText.match(pattern);
                if (found && found.length > 0) {
                    result.push({
                        id: `block_${id++}`,
                        type: 'transport',
                        title: 'Транспорт',
                        content: found.join('\n'),
                        rawHtml: ''
                    });
                    break;
                }
            }

            // 7. Что включено / дополнительно оплачивается
            const includedSection = document.querySelector('[class*="included"], [class*="include"], [class*="vhodit"], [class*="vkluchen"]');
            if (includedSection) {
                result.push({
                    id: `block_${id++}`,
                    type: 'included',
                    title: 'Включено в стоимость',
                    content: includedSection.textContent?.trim() || '',
                    rawHtml: ''
                });
            }

            const extraSection = document.querySelector('[class*="extra"], [class*="dop"], [class*="additional"], [class*="oplachivaetsya"]');
            if (extraSection) {
                result.push({
                    id: `block_${id++}`,
                    type: 'extra',
                    title: 'Дополнительно оплачивается',
                    content: extraSection.textContent?.trim() || '',
                    rawHtml: ''
                });
            }

            // 8. Изображения
            const images = document.querySelectorAll('img[src]:not([src*="icon"]):not([src*="logo"]):not([src*="data:"])');
            const imageUrls: string[] = [];
            for (const img of images) {
                const src = (img as HTMLImageElement).src;
                const w = (img as HTMLImageElement).naturalWidth;
                const h = (img as HTMLImageElement).naturalHeight;
                if (src && w > 200 && h > 100 && !src.includes('blank') && !src.includes('placeholder')) {
                    imageUrls.push(src);
                }
            }
            if (imageUrls.length > 0) {
                result.push({
                    id: `block_${id++}`,
                    type: 'images',
                    title: 'Изображения',
                    content: imageUrls.slice(0, 20).join('\n'),
                    rawHtml: ''
                });
            }

            // 9. Если ничего не нашли — fallback
            if (result.length < 3) {
                const allTextBlocks = document.querySelectorAll('p, div:not([class]):not([id]), span.block, .text-block');
                for (const el of allTextBlocks) {
                    const text = el.textContent?.trim() || '';
                    if (text.length > 30 && text.length < 3000) {
                        result.push({
                            id: `block_${id++}`,
                            type: 'text',
                            title: text.substring(0, 80),
                            content: text,
                            rawHtml: ''
                        });
                    }
                }
            }

            return result;
        });

        // Удаляем дубликаты
        const uniqueBlocks: typeof blocks = [];
        const seenContent = new Set<string>();
        for (const block of blocks) {
            const normalized = block.content.substring(0, 100).replace(/\s+/g, ' ').trim();
            if (!seenContent.has(normalized)) {
                seenContent.add(normalized);
                uniqueBlocks.push(block);
            }
        }

        console.log(`✅ Найдено блоков: ${uniqueBlocks.length}`);
        const typeStats: Record<string, number> = {};
        for (const block of uniqueBlocks) {
            typeStats[block.type] = (typeStats[block.type] || 0) + 1;
        }
        console.log('📊 Типы блоков:', JSON.stringify(typeStats));

        return {
            url,
            title: pageTitle || 'Тур',
            blocks: uniqueBlocks,
            rawText: uniqueBlocks.map(b => `[${b.type.toUpperCase()}] ${b.title}\n${b.content}`).join('\n\n')
        };

    } finally {
        await browser.close();
    }
}

// ============================================
// РОУТЫ
// ============================================

// 1. Парсинг страницы
router.post('/parse', async (req: Request, res: Response) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL обязателен' });
    }

    try {
        console.log(`\n🔍 Парсинг страницы: ${url}`);
        const parsedData = await parseExternalPage(url);

        console.log(`✅ Найдено блоков: ${parsedData.blocks.length}`);

        res.json({
            success: true,
            data: parsedData
        });

    } catch (error: any) {
        console.error('❌ Ошибка парсинга:', error);
        res.status(500).json({ success: false, error: error.message || 'Ошибка парсинга страницы' });
    }
});

// 2. Создание тура на основе сопоставленных данных
router.post('/create', async (req: Request, res: Response) => {
    const { parsedData, matchedEntities, pazlEmail, pazlPassword } = req.body;

    if (!parsedData || !matchedEntities || !pazlEmail || !pazlPassword) {
        return res.status(400).json({ success: false, error: 'Все поля обязательны' });
    }

    const sessionId = `ext_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    sessions.set(sessionId, {
        res: null,
        status: 'starting',
        log: []
    });

    console.log(`🆕 Создана сессия внешней миграции: ${sessionId}`);

    res.json({ success: true, data: { sessionId } });

    runExternalMigration(sessionId, parsedData, matchedEntities, pazlEmail, pazlPassword).catch(err => {
        console.error('External migration error:', err);
        sendSSE(sessionId, 'error', { message: err.message || 'Неизвестная ошибка' });
    });
});

// 3. SSE стрим
router.get('/stream/:sessionId', (req: Request, res: Response) => {
    const sessionId = req.params.sessionId as string;
    console.log('📡 SSE подключение:', sessionId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', 'https://tour-creator.tsukawa.ru');

    res.write(`event: connected\ndata: ${JSON.stringify({ sessionId })}\n\n`);

    const session = sessions.get(sessionId);
    if (session) {
        session.res = res;
        if (session.log.length > 0) {
            for (const logEntry of session.log) {
                res.write(`event: step\ndata: ${JSON.stringify(logEntry)}\n\n`);
            }
        }
    } else {
        sessions.set(sessionId, { res, status: 'connected', log: [] });
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
// ВЫПОЛНЕНИЕ МИГРАЦИИ
// ============================================

async function runExternalMigration(
    sessionId: string,
    parsedData: ParsedTourData,
    matchedEntities: MatchedEntity[],
    pazlEmail: string,
    pazlPassword: string
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

        sendSSE(sessionId, 'step', { step: 0, status: 'active', message: 'Вход в Pazl Tours...' });

        const pazlPage = await context.newPage();
        await pazlPage.goto('https://manager.pazltours.online/auth');
        await pazlPage.waitForTimeout(3000);

        const emailInput = await pazlPage.$('input[type="text"]') || await pazlPage.$('input[name="login"]');
        const passwordInput = await pazlPage.$('input[type="password"]');

        if (!emailInput || !passwordInput) {
            sendSSE(sessionId, 'step', { step: 0, status: 'error', message: 'Поля ввода не найдены' });
            await browser.close();
            return;
        }

        await emailInput.fill(pazlEmail);
        await passwordInput.fill(pazlPassword);
        const submitButton = await pazlPage.$('button[type="submit"]');
        if (submitButton) await submitButton.click();
        else await passwordInput.press('Enter');
        await pazlPage.waitForTimeout(5000);

        if (!pazlPage.url().includes('/welcome') && !pazlPage.url().includes('/dashboard')) {
            sendSSE(sessionId, 'step', { step: 0, status: 'error', message: 'Неверный email или пароль Pazl' });
            await browser.close();
            return;
        }

        sendSSE(sessionId, 'step', { step: 0, status: 'completed', message: 'Вход в Pazl выполнен' });

        // Собираем результат
        const tourTitle = matchedEntities.find(e => e.entityType === 'tour_info');
        const tourName = tourTitle?.name || parsedData.title || 'Тур с внешнего сайта';

        const stats = {
            hotels: matchedEntities.filter(e => e.entityType === 'hotel').length,
            transports: matchedEntities.filter(e => e.entityType === 'transport').length,
            services: matchedEntities.filter(e => e.entityType === 'service').length,
            days: matchedEntities.filter(e => e.entityType === 'day').length,
            prices: matchedEntities.filter(e => e.entityType === 'price').length,
        };

        sendSSE(sessionId, 'step', { step: 1, status: 'completed', message: 'Данные подготовлены' });

        const resultData = {
            success: true,
            data: {
                tourData: {
                    name: tourName,
                    sourceUrl: parsedData.url,
                    blocksCount: parsedData.blocks.length,
                },
                matchedEntities,
                stats: {
                    total: matchedEntities.length,
                    ...stats
                },
                createdEntities: [],
                message: `Данные подготовлены для создания тура "${tourName}". Найдено сущностей: ${matchedEntities.length}`
            }
        };

        sendSSE(sessionId, 'result', resultData);
        console.log('📤 Результат отправлен через SSE');

    } catch (error: any) {
        console.error('❌ Ошибка:', error);
        sendSSE(sessionId, 'error', { message: error.message || 'Внутренняя ошибка' });
    } finally {
        if (browser) {
            try { await browser.close(); } catch (e) {}
        }
    }
}

export default router;