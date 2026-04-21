import axios from 'axios';
import type { LoginResponse, TourStatus, CreateTourData, ApiResponse } from '../types';
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
}

export default new ApiService();