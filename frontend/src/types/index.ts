export interface LoginResponse {
    sessionId: string;
    xsrfToken: string;
    cookies: Array<{
        name: string;
        value: string;
        domain: string;
        path: string;
        expires: number;
        httpOnly: boolean;
        secure: boolean;
        sameSite: 'Strict' | 'Lax' | 'None';
    }>;
}

export interface TourStatus {
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
    message?: string;
}

export interface CreateTourData {
    sessionId: string;
    tourName: string;
    cityId: number;
    email: string;
    password: string;
}