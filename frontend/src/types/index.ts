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

// Новые типы для миграции
export interface MigrationRequest {
    aviannaEmail: string;
    aviannaPassword: string;
    pazlEmail: string;
    pazlPassword: string;
    tourName: string;
}

export interface MappedEntity {
    source_id: number;
    source_name: string;
    source_type?: string;
    pazl_id: number | null;
    pazl_name: string | null;
    needs_creation: boolean;
}

export interface MigrationMappings {
    cities: MappedEntity[];
    transportations: MappedEntity[];
    transports: MappedEntity[];
    hotel_meals: MappedEntity[];
    hotel_accommodations: MappedEntity[];
    hotel_infrastructure_types: MappedEntity[];
    hotel_infrastructures: MappedEntity[];
    room_types: MappedEntity[];
    room_places: MappedEntity[];
    room_descriptions: MappedEntity[];
    hotels: MappedEntity[];
    tour_categories: MappedEntity[];
    tour_services: MappedEntity[];
    catalog_sections: MappedEntity[];
}

export interface MigrationResult {
    tourData: any;
    mappings: MigrationMappings;
    stats: {
        totalToCreate: number;
        totalExists: number;
        total: number;
    };
    message: string;
}

export interface MigrationResponse {
    success: boolean;
    data?: MigrationResult;
    error?: string;
}