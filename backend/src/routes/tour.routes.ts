import { Router } from 'express';
import { BrowserService } from '../services/browser.service.js';
import { TourService } from '../services/tour.service.js';

const router = Router();
const browserService = new BrowserService();
const tourService = new TourService(browserService);

// Инициализация браузера при старте
browserService.initialize().catch(console.error);

// Логин и проверка кук
router.post('/auth/login', async (req, res) => {
    console.log('📥 POST /auth/login', req.body);

    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email и пароль обязательны'
            });
        }

        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log('🆕 Создана сессия:', sessionId);

        const page = await browserService.createSession(sessionId);

        console.log('🌐 Переход на страницу входа...');
        await page.goto('https://manager.pazltours.online/auth');
        await page.waitForTimeout(2000);

        console.log('📝 Заполнение формы...');
        await page.fill('input[type="text"]', email);
        await page.fill('input[type="password"]', password);
        await page.click('#kt_login_singin_form_submit_button');
        await page.waitForTimeout(5000);

        const currentUrl = page.url();
        console.log('📍 Текущий URL:', currentUrl);

        if (currentUrl.includes('/auth')) {
            throw new Error('Неверный email или пароль');
        }

        const cookies = await page.context().cookies();
        const xsrfToken = cookies.find(c => c.name === 'XSRF-TOKEN')?.value || '';

        console.log('✅ Вход успешен');

        res.json({
            success: true,
            data: {
                sessionId,
                xsrfToken: xsrfToken ? decodeURIComponent(xsrfToken) : '',
                cookies
            }
        });
    } catch (error: any) {
        console.error('❌ Ошибка входа:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Создание тура
router.post('/tours/create', async (req, res) => {
    console.log('📥 POST /tours/create', req.body);

    try {
        const { sessionId, tourName, cityId, email, password } = req.body;

        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'sessionId обязателен'
            });
        }

        // Проверяем что сессия существует
        const page = browserService.getPage(sessionId);
        if (!page) {
            return res.status(400).json({
                success: false,
                error: 'Сессия не найдена. Выполните вход заново.'
            });
        }

        // Запускаем создание тура асинхронно
        setImmediate(() => {
            tourService.createTour(
                sessionId,
                email,
                password,
                tourName || `Тур ${Date.now()}`,
                cityId || 1105
            ).catch(error => {
                console.error('❌ Ошибка создания тура:', error);
            });
        });

        res.json({
            success: true,
            data: { sessionId },
            message: 'Процесс создания тура запущен'
        });

    } catch (error: any) {
        console.error('❌ Ошибка:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Получение статуса
router.get('/tours/status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    console.log('📥 GET /tours/status/' + sessionId);

    const status = tourService.getStatus(sessionId);

    if (!status) {
        return res.json({
            success: true,
            data: {
                status: 'pending',
                step: 'login',
                log: ['Ожидание запуска...']
            }
        });
    }

    res.json({
        success: true,
        data: status
    });
});

// SSE стрим для реального времени
router.get('/tours/stream/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const origin = req.headers.origin || 'http://localhost:5173';
    console.log('📡 Новое SSE подключение для сессии:', sessionId);

    // Настройка заголовков для SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Отправляем начальное сообщение
    res.write(`data: ${JSON.stringify({
        type: 'log',
        data: {
            sessionId,
            message: '📡 Подключение установлено'
        }
    })}\n\n`);

    // Получаем текущий статус и отправляем его
    const currentStatus = tourService.getStatus(sessionId);
    if (currentStatus) {
        res.write(`data: ${JSON.stringify({
            type: 'status',
            data: currentStatus
        })}\n\n`);

        // Отправляем все существующие логи
        if (currentStatus.log && currentStatus.log.length > 0) {
            currentStatus.log.forEach(logMessage => {
                res.write(`data: ${JSON.stringify({
                    type: 'log',
                    data: {
                        sessionId,
                        message: logMessage
                    }
                })}\n\n`);
            });
        }
    }

    // Обработчики событий
    const logHandler = (data: any) => {
        if (data.sessionId === sessionId) {
            console.log('📤 Отправка лога через SSE:', data.message);
            try {
                res.write(`data: ${JSON.stringify({
                    type: 'log',
                    data: {
                        sessionId,
                        message: data.message
                    }
                })}\n\n`);
            } catch (error) {
                console.error('Ошибка отправки лога:', error);
            }
        }
    };

    const statusHandler = (data: any) => {
        if (data.sessionId === sessionId) {
            console.log('📤 Отправка статуса через SSE:', data.status);
            try {
                res.write(`data: ${JSON.stringify({
                    type: 'status',
                    data: data.status
                })}\n\n`);
            } catch (error) {
                console.error('Ошибка отправки статуса:', error);
            }
        }
    };

    // Подписываемся на события
    tourService.on('log', logHandler);
    tourService.on('status', statusHandler);

    // Пинг для поддержания соединения
    const pingInterval = setInterval(() => {
        try {
            res.write(`: ping ${Date.now()}\n\n`);
        } catch (error) {
            clearInterval(pingInterval);
        }
    }, 15000);

    // Очистка при закрытии соединения
    req.on('close', () => {
        console.log('📡 SSE соединение закрыто для сессии:', sessionId);
        clearInterval(pingInterval);
        tourService.off('log', logHandler);
        tourService.off('status', statusHandler);
    });

    req.on('error', (error) => {
        console.error('❌ Ошибка SSE соединения:', error);
        clearInterval(pingInterval);
        tourService.off('log', logHandler);
        tourService.off('status', statusHandler);
    });
});

// Тестовый маршрут для проверки SSE
router.get('/test-stream', (req, res) => {
    console.log('📡 Тестовое SSE подключение');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let count = 0;
    const interval = setInterval(() => {
        count++;
        res.write(`data: ${JSON.stringify({
            type: 'log',
            data: {
                message: `Тестовое сообщение ${count}`
            }
        })}\n\n`);

        if (count >= 5) {
            clearInterval(interval);
            res.write(`data: ${JSON.stringify({
                type: 'status',
                data: {
                    status: 'completed',
                    message: 'Тест завершен'
                }
            })}\n\n`);
            res.end();
        }
    }, 1000);

    req.on('close', () => {
        clearInterval(interval);
    });
});

// Получение списка активных сессий (для отладки)
router.get('/sessions', (req, res) => {
    const sessions = Array.from((browserService as any).pages.keys());
    res.json({
        success: true,
        data: {
            count: sessions.length,
            sessions
        }
    });
});

// Закрытие сессии
router.post('/sessions/:sessionId/close', async (req, res) => {
    const { sessionId } = req.params;
    console.log('🔚 Закрытие сессии:', sessionId);

    try {
        await browserService.closeSession(sessionId);
        res.json({
            success: true,
            message: 'Сессия закрыта'
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;