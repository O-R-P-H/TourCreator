import { Browser, BrowserContext, Page, chromium } from 'playwright';

export class BrowserService {
    private browser: Browser | null = null;
    private contexts: Map<string, BrowserContext> = new Map();
    private pages: Map<string, Page> = new Map();

    async initialize(): Promise<void> {
        if (!this.browser) {
            this.browser = await chromium.launch({
                headless: true, // На сервере лучше headless
                slowMo: 50
            });
        }
    }

    async createSession(sessionId: string): Promise<Page> {
        await this.initialize();
        const context = await this.browser!.newContext();
        const page = await context.newPage();

        this.contexts.set(sessionId, context);
        this.pages.set(sessionId, page);

        return page;
    }

    getPage(sessionId: string): Page | undefined {
        return this.pages.get(sessionId);
    }

    async closeSession(sessionId: string): Promise<void> {
        const context = this.contexts.get(sessionId);
        if (context) {
            await context.close();
            this.contexts.delete(sessionId);
            this.pages.delete(sessionId);
        }
    }

    async cleanup(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}