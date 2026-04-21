export interface LoginCredentials {
    email: string;
    password: string;
}

export interface CreateTourRequest {
    baseName: string;
    cityId: number;
    sessionId: string;
}

export interface TourCreationStatus {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    step: 'login' | 'transport' | 'hotel' | 'tour' | 'done';
    transportId?: number;
    hotelId?: number;
    tourId?: number;
    tourUrl?: string;
    error?: string;
    log: string[];
}

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}