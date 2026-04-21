import axios from 'axios';
import type { LoginResponse, TourStatus, CreateTourData, ApiResponse } from '../types';

const API_BASE_URL = '/api';

class ApiService {
    async login(email: string, password: string): Promise<LoginResponse> {
        const response = await axios.post<ApiResponse<LoginResponse>>(`${API_BASE_URL}/auth/login`, {
            email,
            password
        });

        if (!response.data.success || !response.data.data) {
            throw new Error(response.data.error || 'Ошибка входа');
        }

        return response.data.data;
    }

    async createTour(data: CreateTourData): Promise<{ sessionId: string }> {
        const response = await axios.post<ApiResponse<{ sessionId: string }>>(`${API_BASE_URL}/tours/create`, data);

        if (!response.data.success || !response.data.data) {
            throw new Error(response.data.error || 'Ошибка создания тура');
        }

        return response.data.data;
    }

    async getTourStatus(sessionId: string): Promise<TourStatus> {
        const response = await axios.get<ApiResponse<TourStatus>>(`${API_BASE_URL}/tours/status/${sessionId}`);

        if (!response.data.success || !response.data.data) {
            throw new Error(response.data.error || 'Ошибка получения статуса');
        }

        return response.data.data;
    }

    createEventSource(sessionId: string): EventSource {
        return new EventSource(`${API_BASE_URL}/tours/stream/${sessionId}`);
    }
}

export default new ApiService();