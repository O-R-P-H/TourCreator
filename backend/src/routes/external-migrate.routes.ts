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

        // Парсим через отдельные вызовы evaluate для надёжности

        // 1. Получаем название тура
        const tourTitle = await page.evaluate(() => {
            try {
                const h1 = document.querySelector('h1, .product-title, .tour-title, .item-title, h2');
                return h1?.textContent?.trim() || '';
            } catch (e) {
                return '';
            }
        });

        // 2. Получаем весь текст body
        const bodyText = await page.evaluate(() => {
            try {
                return document.body?.textContent?.replace(/\s+/g, ' ') || '';
            } catch (e) {
                return '';
            }
        });

        // 3. Получаем цены
        const pricesText = await page.evaluate(() => {
            try {
                const prices: string[] = [];
                const selectors = '.price, .product-price, .tour-price, [class*="price"], [class*="cost"], .vm-price, .PricesalesPrice';
                const elements = document.querySelectorAll(selectors);
                for (let i = 0; i < elements.length; i++) {
                    const el = elements[i];
                    if (el?.textContent) {
                        const text = el.textContent.trim();
                        if (text && /[\d\s]+[₽р]/.test(text) && text.length < 200) {
                            prices.push(text);
                        }
                    }
                }
                return [...new Set(prices)].join('\n');
            } catch (e) {
                return '';
            }
        });

        // 4. Получаем секции контента
        const sections = await page.evaluate(() => {
            try {
                const result: any[] = [];

                // Ищем контентную область
                const contentSelectors = [
                    '.product-description', '.tour-description', '.item-description',
                    '.entry-content', '.post-content', '[itemprop="description"]',
                    '.tab-content .active', '.sp-tab-content .active',
                    '.vm-product-details-container', '.productdetails-view',
                    '#tab-description', '.tab-pane.active',
                ];

                let contentEl: Element | null = null;
                for (const sel of contentSelectors) {
                    const el = document.querySelector(sel);
                    if (el) { contentEl = el; break; }
                }

                if (!contentEl) {
                    // Пробуем найти основной контент по объёму текста
                    const divs = document.querySelectorAll('div');
                    let maxLen = 0;
                    for (let i = 0; i < divs.length; i++) {
                        const div = divs[i];
                        const len = div?.textContent?.length || 0;
                        if (len > maxLen && len < 50000) {
                            maxLen = len;
                            contentEl = div;
                        }
                    }
                }

                if (contentEl) {
                    // Собираем все h2-h6 и p внутри
                    const elements = contentEl.querySelectorAll('h2, h3, h4, h5, h6, p, strong, b, .price, [class*="price"], [class*="cost"]');
                    let current: { title: string; content: string } = { title: 'Описание', content: '' };

                    for (let i = 0; i < elements.length; i++) {
                        const el = elements[i];
                        if (!el) continue;

                        const tag = el.tagName?.toLowerCase() || '';
                        const text = el.textContent?.trim() || '';
                        if (text.length < 3) continue;

                        // Проверяем видимость
                        try {
                            const style = window.getComputedStyle(el);
                            if (style.display === 'none' || style.visibility === 'hidden') continue;
                        } catch (e) { continue; }

                        const isHeader = ['h2', 'h3', 'h4', 'h5', 'h6'].includes(tag);
                        const isBold = (tag === 'strong' || tag === 'b') && text.length < 150;

                        if (isHeader || isBold) {
                            if (current.content.trim().length > 20) {
                                result.push({
                                    title: current.title,
                                    content: current.content.trim(),
                                    type: 'text'
                                });
                            }
                            current = { title: text, content: '' };
                        } else {
                            current.content += text + '\n';
                        }
                    }

                    if (current.content.trim().length > 20) {
                        result.push({
                            title: current.title,
                            content: current.content.trim(),
                            type: 'text'
                        });
                    }
                }

                return result;
            } catch (e) {
                return [];
            }
        });

        // 5. Изображения
        const imagesText = await page.evaluate(() => {
            try {
                const urls: string[] = [];
                const imgs = document.querySelectorAll('img[src]');
                for (let i = 0; i < imgs.length; i++) {
                    const img = imgs[i] as HTMLImageElement;
                    if (!img?.src) continue;
                    if (img.src.includes('icon') || img.src.includes('logo') || img.src.includes('data:') || img.src.includes('blank')) continue;
                    if (img.naturalWidth > 200 && img.naturalHeight > 100) {
                        urls.push(img.src);
                    }
                }
                return urls.slice(0, 20).join('\n');
            } catch (e) {
                return '';
            }
        });

        // 6. Даты
        const datesPattern = /\d{1,2}\s*(июн[ья]?|июл[ья]?|авг[уста]*|сен[тября]*|окт[ябр]*|ноя[бр]*|дек[абр]*|янв[ар]*|фев[рал]*|мар[та]*|апр[ел]*|ма[йя])\s*,?\s*\d{4}?/gi;
        const foundDates = bodyText.match(datesPattern);
        const datesText = foundDates ? [...new Set(foundDates.map(d => d.replace(/\s+/g, ' ').trim()))].slice(0, 50).join(', ') : '';

        // 7. Города
        const citiesPattern = /(?:из|от|в)\s+(Анап[ы]?|Новороссийск[а]?|Геленджик[а]?|Сочи|Краснодар[а]?|Москв[ы]?|Санкт-Петербург[а]?|Казан[и]?|Екатеринбург[а]?|Ростов[а]?|Волгоград[а]?|Самар[ы]?|Нижн[его]*\s*Новгород[а]?|Воронеж[а]?|Крым[а]?|Симферопол[я]?|Ялт[ы]?|Севастопол[я]?)/gi;
        const foundCities = bodyText.match(citiesPattern);
        const citiesText = foundCities ? [...new Set(foundCities.map(c => c.trim()))].slice(0, 20).join(', ') : '';

        // Собираем блоки
        const blocks: ParsedBlock[] = [];
        let id = 0;

        if (tourTitle) {
            blocks.push({
                id: `block_${id++}`,
                type: 'tour_title',
                title: 'Название тура',
                content: tourTitle,
                rawHtml: ''
            });
        }

        for (const section of sections) {
            if (section.content.length > 30) {
                const sectionType = determineSectionType(section.title, section.content);
                blocks.push({
                    id: `block_${id++}`,
                    type: sectionType as ParsedBlock['type'],
                    title: section.title,
                    content: section.content.substring(0, 5000),
                    rawHtml: ''
                });
            }
        }

        if (pricesText) {
            blocks.push({
                id: `block_${id++}`,
                type: 'price',
                title: 'Цены',
                content: pricesText,
                rawHtml: ''
            });
        }

        if (datesText) {
            blocks.push({
                id: `block_${id++}`,
                type: 'dates',
                title: 'Даты тура',
                content: datesText,
                rawHtml: ''
            });
        }

        if (citiesText) {
            blocks.push({
                id: `block_${id++}`,
                type: 'departure_cities',
                title: 'Города отправления',
                content: citiesText,
                rawHtml: ''
            });
        }

        if (imagesText) {
            blocks.push({
                id: `block_${id++}`,
                type: 'images',
                title: 'Изображения',
                content: imagesText,
                rawHtml: ''
            });
        }

        // Удаляем дубликаты
        const uniqueBlocks: ParsedBlock[] = [];
        const seenContent = new Set<string>();
        for (const block of blocks) {
            const normalized = block.content.substring(0, 100).replace(/\s+/g, ' ').trim();
            if (!seenContent.has(normalized) && normalized.length > 10) {
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
}// ============================================
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