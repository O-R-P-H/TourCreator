// src/routes/external-migrate.routes.ts
import { Router, Request, Response } from 'express';
import { chromium } from 'playwright';

const router = Router();

// ============================================
// ТИПЫ
// ============================================

interface ParsedBlock {
    id: string;
    type: 'unknown' | 'hotel' | 'transport' | 'service' | 'day' | 'price' | 'info';
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

// ============================================
// ХРАНИЛИЩЕ СЕССИЙ
// ============================================

const sessions = new Map<string, {
    res: Response | null;
    status: string;
    log: any[];
    parsedData?: ParsedTourData;
    matchedEntities?: any;
    result?: any;
    error?: string;
}>();

function sendSSE(sessionId: string, event: string, data: any) {
    const session = sessions.get(sessionId);
    if (!session || !session.res) return;
    try {
        session.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
        console.log('SSE send error:', e);
    }
}

// ============================================
// ПАРСИНГ ВНЕШНЕЙ СТРАНИЦЫ
// ============================================

async function parseExternalPage(url: string): Promise<ParsedTourData> {
    const browser = await chromium.launch({
        headless: true,
        executablePath: '/snap/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);

        // Извлекаем все текстовые блоки
        const blocks = await page.evaluate(() => {
            const result: any[] = [];
            let id = 0;

            // Заголовок
            const h1 = document.querySelector('h1');
            if (h1?.textContent?.trim()) {
                result.push({
                    id: `block_${id++}`,
                    type: 'unknown',
                    title: 'Заголовок',
                    content: h1.textContent.trim(),
                    rawHtml: h1.outerHTML.substring(0, 500)
                });
            }

            // Все крупные текстовые блоки
            const selectors = [
                'article', 'section', '.content', '.description', '.tour-content',
                '.tour-description', '.program', '.itinerary', '.included', '.prices',
                '.hotels', '.transport', '[class*="desc"]', '[class*="text"]',
                'div > p', 'ul', 'table'
            ];

            const seen = new Set<Element>();

            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    if (seen.has(el)) continue;
                    const text = el.textContent?.trim();
                    if (text && text.length > 20 && !seen.has(el)) {
                        seen.add(el);
                        // Определяем тип по ключевым словам
                        let type = 'unknown';
                        const lower = text.toLowerCase();
                        if (lower.includes('гостиниц') || lower.includes('отель') || lower.includes('размещен')) type = 'hotel';
                        else if (lower.includes('транспорт') || lower.includes('автобус') || lower.includes('переезд')) type = 'transport';
                        else if (lower.includes('включен') || lower.includes('услуг') || lower.includes('экскурс')) type = 'service';
                        else if (lower.includes('день') || lower.includes('программ')) type = 'day';
                        else if (lower.includes('цен') || lower.includes('стоимость') || lower.includes('руб')) type = 'price';

                        result.push({
                            id: `block_${id++}`,
                            type,
                            title: text.substring(0, 100).replace(/\n/g, ' '),
                            content: text.substring(0, 3000),
                            rawHtml: el.outerHTML.substring(0, 500)
                        });
                    }
                }
            }

            return result;
        });

        const title = await page.title();

        return {
            url,
            title,
            blocks,
            rawText: blocks.map(b => b.content).join('\n\n')
        };

    } finally {
        await browser.close();
    }
}

// ============================================
// РОУТЫ
// ============================================

// Парсинг страницы
router.post('/parse', async (req: Request, res: Response) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL обязателен' });
    }

    try {
        console.log(`🔍 Парсинг страницы: ${url}`);
        const parsedData = await parseExternalPage(url);

        console.log(`✅ Найдено блоков: ${parsedData.blocks.length}`);

        res.json({
            success: true,
            data: parsedData
        });

    } catch (error: any) {
        console.error('❌ Ошибка парсинга:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;