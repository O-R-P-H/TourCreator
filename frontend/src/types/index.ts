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

// Типы для миграции
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
    room_services: MappedEntity[];
    room_equipments: MappedEntity[];
    room_furnitures: MappedEntity[];
    room_bathrooms: MappedEntity[];
    hotels: MappedEntity[];
    tour_categories: MappedEntity[];
    tour_services: MappedEntity[];
    catalog_sections: MappedEntity[];
}

export interface CreatedEntity {
    type: string;
    source_name: string;
    pazl_id: number;
}

export interface FilesUploaded {
    mainPhotos: number;
    dayPhotos: number;
    hotelPhotos: number;
    tourFiles: number;
}

export interface MigrationStats {
    totalToCreate: number;
    totalExists: number;
    total: number;
    created: number;
}

export interface MigrationResultData {
    tourData: {
        id: number;
        name: string;
    };
    mappings: MigrationMappings;
    createdEntities: CreatedEntity[];
    stats: MigrationStats;
    tourCreated: boolean;
    tourId: number | null;
    filesUploaded: FilesUploaded;
    message: string;
}

export interface MigrationResponse {
    success: boolean;
    data?: MigrationResultData;
    error?: string;
}