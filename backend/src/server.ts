import express from 'express';
import cors from 'cors';
import tourRoutes from "./routes/tour.routes";


const app = express();
const PORT = 3000;

// Разрешенные домены фронтенда
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://tour-creator.tsukawa.ru/' // Добавь свой домен
];

app.use(cors({
    origin: function(origin, callback) {
        // Разрешаем запросы без origin (например, Postman)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
            callback(null, true);
        } else {
            console.log('❌ Заблокирован запрос от:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-XSRF-TOKEN', 'X-Requested-With']
}));

app.use(express.json());

app.use((req, res, next) => {
    console.log(`${req.method} ${req.path} - Origin: ${req.headers.origin}`);
    next();
});

app.use('/api', tourRoutes);

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📡 Разрешенные источники:`, allowedOrigins);
});