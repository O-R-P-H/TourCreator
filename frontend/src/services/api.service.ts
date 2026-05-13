import axios from 'axios';
import type {
    LoginResponse,
    TourStatus,
    CreateTourData,
    ApiResponse,
    MigrationRequest,
    MigrationResponse
} from '../types';
import { config } from '../config';

const API_BASE_URL = `${config.apiUrl}/api`;

class ApiService {
    async login(email: string, password: string): Promise<LoginResponse> {
        console.log('🔑 URL запроса:', `${API_BASE_URL}/auth/login`);

        const response = await axios.post<ApiResponse<LoginResponse>>(`${API_BASE_URL}/auth/login`, {
            email,
            password
        }, {
            withCredentials: true
        });

        if (!response.data.success || !response.data.data) {
            throw new Error(response.data.error || 'Ошибка входа');
        }

        return response.data.data;
    }

    async createTour(data: CreateTourData): Promise<{ sessionId: string }> {
        const response = await axios.post<ApiResponse<{ sessionId: string }>>(
            `${API_BASE_URL}/tours/create`,
            data,
            { withCredentials: true }
        );

        if (!response.data.success || !response.data.data) {
            throw new Error(response.data.error || 'Ошибка создания тура');
        }

        return response.data.data;
    }

    async getTourStatus(sessionId: string): Promise<TourStatus> {
        const response = await axios.get<ApiResponse<TourStatus>>(
            `${API_BASE_URL}/tours/status/${sessionId}`,
            { withCredentials: true }
        );

        if (!response.data.success || !response.data.data) {
            throw new Error(response.data.error || 'Ошибка получения статуса');
        }

        return response.data.data;
    }

    createEventSource(sessionId: string): EventSource {
        const url = `${API_BASE_URL}/tours/stream/${sessionId}`;
        return new EventSource(url, { withCredentials: true });
    }

    // Старый метод для прямой миграции (без SSE)
    async startMigration(data: MigrationRequest): Promise<MigrationResponse> {
        const response = await axios.post<MigrationResponse>(
            `${API_BASE_URL}/migrate`,
            data,
            { withCredentials: true, timeout: 300000 }
        );

        if (!response.data.success) {
            throw new Error(response.data.error || 'Ошибка миграции');
        }

        return response.data;
    }
    async parseExternalPage(url: string): Promise<any> {
        const response = await axios.post(`${API_BASE_URL}/external/parse`, { url }, { withCredentials: true });
        return response.data;
    }

    async createExternalTour(data: any): Promise<{ sessionId: string }> {
        const response = await axios.post(`${API_BASE_URL}/external/create`, data, { withCredentials: true });
        return response.data.data;
    }
    // Новый метод - запуск миграции и получение sessionId
    async startMigrationSession(data: MigrationRequest): Promise<{ sessionId: string }> {
        const response = await axios.post<ApiResponse<{ sessionId: string }>>(
            `${API_BASE_URL}/migrate/start`,
            data,
            { withCredentials: true }
        );

        if (!response.data.success || !response.data.data) {
            throw new Error(response.data.error || 'Ошибка запуска миграции');
        }

        return response.data.data;
    }

    // Новый метод - создание SSE стрима для миграции
    createMigrationEventSource(sessionId: string): EventSource {
        const url = `${API_BASE_URL}/migrate/stream/${sessionId}`;
        return new EventSource(url, { withCredentials: true });
    }
}

export default new ApiService();
