import { ParkingLot, PlaceCurrentOpeningHours, PlaceEvChargeOptions, PlacePaymentOptions, PlaceViewport, FloorPlan, ParkingStall } from '../types';
import { calculateHaversineKm } from './distance';

export interface LocationCoords {
    lat: number;
    lng: number;
}

export interface GooglePlaceRaw {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    rating?: number;
    userRatingCount?: number;
    businessStatus?: string;
    currentOpeningHours?: PlaceCurrentOpeningHours;
    photos?: Array<{ name: string; heightPx?: number; widthPx?: number }>;
    googleMapsUri?: string;
    websiteUri?: string;
    nationalPhoneNumber?: string;
    wheelchairAccessible?: boolean;
    evChargeOptions?: PlaceEvChargeOptions;
    paymentOptions?: PlacePaymentOptions;
    viewport?: PlaceViewport;
}

function extractCity(formattedAddress: string): string {
    if (!formattedAddress) return '';
    const parts = formattedAddress.split(',').map((p) => p.trim());
    if (parts.length >= 3) return parts[parts.length - 3] || '';
    if (parts.length >= 2) return parts[parts.length - 2] || '';
    return '';
}

function getApiKey(): string {
    return (
        process.env.GOOGLE_MAPS_PLATFORM_KEY ||
        (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
        ''
    );
}

// ── Booking-ready defaults for Google-discovered lots ───────────────────────
// Google Places does not expose parking rates, so every discovered lot is
// assigned a deterministic operator-style rate (₹40–₹120/hr based on the
// place id) plus a generated floor/stall plan. This makes the whole booking
// pipeline work end-to-end for any search result.

const BASE_INR_RATE_MIN = 40;
const BASE_INR_RATE_MAX = 120;

function hashString(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash;
}

/** Deterministic hourly rate in INR for a place id (stable across reloads). */
export function getDefaultPricePerHour(placeId: string): number {
    const h = hashString(placeId);
    return BASE_INR_RATE_MIN + (h % (BASE_INR_RATE_MAX - BASE_INR_RATE_MIN + 1));
}

function generateStalls(floorPrefix: string, count: number, floor: string): ParkingStall[] {
    const stalls: ParkingStall[] = [];
    for (let i = 1; i <= count; i++) {
        const code = `${floorPrefix}-${String(i).padStart(2, '0')}`;
        const roll = hashString(code) % 100;
        const status: ParkingStall['status'] = roll < 30 ? 'available' : roll < 45 ? 'reserved' : 'occupied';
        const isEv = i % 9 === 0;
        stalls.push({
            id: `${floorPrefix}_${i}`,
            code,
            floor,
            type: isEv ? 'ev' : i % 12 === 0 ? 'disabled' : i % 11 === 0 ? 'suv' : 'standard',
            status,
            priceModifier: isEv ? 0.1 : 0,
            hasEvCharger: isEv,
            evKw: isEv ? 7 : undefined,
            isWide: i % 11 === 0,
            nearExit: i <= 3,
        });
    }
    return stalls;
}

/** Generates a two-floor plan (P1, P2) for lots that have no floor data. */
export function generateBookableFloorPlan(lotId: string): FloorPlan[] {
    const p1 = generateStalls('P1', 24, 'Level P1');
    const p2 = generateStalls('P2', 20, 'Level P2');
    const available1 = p1.filter((s) => s.status === 'available').length;
    const available2 = p2.filter((s) => s.status === 'available').length;
    return [
        { id: `${lotId}_p1`, name: 'Level P1', level: 1, totalStalls: p1.length, availableStalls: available1, stalls: p1 },
        { id: `${lotId}_p2`, name: 'Level P2', level: 2, totalStalls: p2.length, availableStalls: available2, stalls: p2 },
    ];
}

export function mapGooglePlaceToParkingLot(place: GooglePlaceRaw, searchCenter: LocationCoords): ParkingLot | null {
    if (!place?.id || !place?.location?.latitude || !place?.location?.longitude) return null;

    const lat = place.location.latitude;
    const lng = place.location.longitude;
    const displayName = place.displayName?.text || 'Parking';
    const formattedAddress = place.formattedAddress || 'Address not available';

    const pricePerHour = getDefaultPricePerHour(place.id);
    const floors = generateBookableFloorPlan(place.id);

    const lot: ParkingLot = {
        id: place.id,
        placeId: place.id,
        name: displayName,
        displayName,
        formattedAddress,
        address: formattedAddress,
        city: extractCity(formattedAddress),
        lat,
        lng,
        dataSource: 'google_places',
        isBookable: true,
        pricePerHour,
        dailyMaxPrice: Math.round(pricePerHour * 12),
        floors,
        totalSpots: floors.reduce((sum, f) => sum + f.totalStalls, 0),
        availableSpots: floors.reduce((sum, f) => sum + f.availableStalls, 0),
        capacity: floors.reduce((sum, f) => sum + f.totalStalls, 0),
        hasSecurity: true,
        isCovered: true,
        is24x7: true,
        distanceKm: Number(calculateHaversineKm(searchCenter.lat, searchCenter.lng, lat, lng).toFixed(1)),
    };

    if (place.rating !== undefined) lot.rating = place.rating;
    if (place.userRatingCount !== undefined) {
        lot.userRatingCount = place.userRatingCount;
        lot.reviewCount = place.userRatingCount;
    }
    if (place.businessStatus !== undefined) lot.businessStatus = place.businessStatus;
    if (place.currentOpeningHours !== undefined) {
        lot.currentOpeningHours = place.currentOpeningHours;
        const weekday = place.currentOpeningHours.weekdayDescriptions;
        if (Array.isArray(weekday) && weekday.length > 0) lot.openingHours = weekday[0];
    }
    if (Array.isArray(place.photos) && place.photos.length > 0) {
        lot.photos = place.photos;
        const photo = place.photos[0];
        if (photo?.name) {
            lot.imageUrl = `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=400&maxWidthPx=600&key=${encodeURIComponent(getApiKey())}`;
        }
    }
    if (place.googleMapsUri !== undefined) lot.googleMapsUri = place.googleMapsUri;
    if (place.websiteUri !== undefined) lot.websiteUri = place.websiteUri;
    if (place.nationalPhoneNumber !== undefined) lot.nationalPhoneNumber = place.nationalPhoneNumber;
    if (place.wheelchairAccessible !== undefined) lot.wheelchairAccessible = place.wheelchairAccessible;
    if (place.evChargeOptions !== undefined) {
        lot.evChargeOptions = place.evChargeOptions;
        if (place.evChargeOptions.connectorCount !== undefined) lot.evChargersCount = place.evChargeOptions.connectorCount;
    }
    if (place.paymentOptions !== undefined) lot.paymentOptions = place.paymentOptions;
    if (place.viewport !== undefined) lot.viewport = place.viewport;

    return lot;
}

export function formatOpeningHours(hours?: PlaceCurrentOpeningHours): string | null {
    if (!hours) return null;
    if (hours.openNow !== undefined) return hours.openNow ? 'Open now' : 'Closed now';
    if (Array.isArray(hours.weekdayDescriptions) && hours.weekdayDescriptions.length > 0) return hours.weekdayDescriptions[0];
    return null;
}

export function formatEvChargeOptions(options?: PlaceEvChargeOptions): string | null {
    if (!options) return null;
    if (options.connectorCount !== undefined) return `${options.connectorCount} connector${options.connectorCount !== 1 ? 's' : ''}`;
    if (Array.isArray(options.connectorAggregation) && options.connectorAggregation.length > 0) {
        return options.connectorAggregation.map((c) => `${c.count}× ${c.type}`).join(', ');
    }
    return null;
}

export function formatPaymentOptions(options?: PlacePaymentOptions): string | null {
    if (!options) return null;
    const accepted: string[] = [];
    if (options.acceptsCreditCards) accepted.push('Credit cards');
    if (options.acceptsDebitCards) accepted.push('Debit cards');
    if (options.acceptsNfc) accepted.push('NFC');
    if (options.acceptsCashOnly) accepted.push('Cash only');
    if (accepted.length === 0) return null;
    return accepted.join(', ');
}