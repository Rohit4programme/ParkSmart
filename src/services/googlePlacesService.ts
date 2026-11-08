import { ParkingLot, PlacePhoto, PlaceCurrentOpeningHours, PlaceEvChargeOptions, PlacePaymentOptions, PlaceViewport } from '../types';
import { calculateHaversineKm } from '../utils/distance';
import { getDefaultPricePerHour, generateBookableFloorPlan } from '../utils/placeMapper';

export interface LocationCoords {
    lat: number;
    lng: number;
}

export interface NearbySearchParams {
    location: LocationCoords;
    radiusMeters?: number;
    signal?: AbortSignal;
}

export interface PlaceDetailsParams {
    placeId: string;
    signal?: AbortSignal;
}

export interface NearbySearchResponse {
    places: ParkingLot[];
    status: string;
    errorMessage?: string;
    googleStatus?: string;
}

export interface TextSearchParams {
    /** Free-text query, e.g. "parking near Bongaon Railway Station". */
    query: string;
    /** Center used to compute distances for returned places. */
    center?: LocationCoords;
    maxResultCount?: number;
    signal?: AbortSignal;
}

export interface PlaceDetailsResponse {
    place: ParkingLot | null;
    status: string;
    errorMessage?: string;
}

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

/**
 * Loads the Google Maps Platform API key.
 * Prefers the Vite-exposed import.meta.env var, falling back to
 * process.env.GOOGLE_MAPS_PLATFORM_KEY (injected by vite.config.ts define).
 */
export function getApiKey(): string {
    const viteKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY;
    if (typeof viteKey === 'string' && viteKey.trim()) return viteKey.trim();

    const processKey = process.env.GOOGLE_MAPS_PLATFORM_KEY;
    if (typeof processKey === 'string' && processKey.trim()) return processKey.trim();

    // Last-resort: some setups inject via import.meta.env without the VITE_ prefix
    const bareKey = (import.meta as any).env?.GOOGLE_MAPS_PLATFORM_KEY;
    if (typeof bareKey === 'string' && bareKey.trim()) return bareKey.trim();

    return '';
}

/**
 * Resolves the Google Maps Map ID used to render the map.
 *
 * A Map ID is only required for vector maps / advanced markers. Unregistered
 * Map IDs cause Google to refuse rendering (black map), so we fall back to
 * Google's official `DEMO_MAP_ID`, which enables advanced markers without
 * any cloud-console setup. Set `VITE_GOOGLE_MAPS_MAP_ID` to a real Map ID
 * (Google Cloud Console → Maps → Map Management → Create Map ID) for custom
 * styling.
 */
export function getMapId(): string {
    const viteMapId = (import.meta as any).env?.VITE_GOOGLE_MAPS_MAP_ID;
    if (typeof viteMapId === 'string' && viteMapId.trim()) return viteMapId.trim();

    const processMapId = process.env.GOOGLE_MAPS_MAP_ID;
    if (typeof processMapId === 'string' && processMapId.trim()) return processMapId.trim();

    return 'DEMO_MAP_ID';
}

/**
 * Validates a coordinate pair for the Google Places API.
 * Rejects NaN, non-finite numbers, wrong types, and out-of-range values.
 */
export function isValidLocation(location: LocationCoords): boolean {
    if (!location || typeof location !== 'object') return false;

    const { lat, lng } = location;
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (Number.isNaN(lat) || Number.isNaN(lng)) return false;

    if (lat < -90 || lat > 90) return false;
    if (lng < -180 || lng > 180) return false;

    return true;
}

/**
 * Field mask for Nearby Search (New).
 *
 * NOTE: `places.photos` IS supported by Nearby Search (New) and is included
 * below so parking cards show real Google Places photos immediately.
 */
function getNearbySearchHeaders(): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': getApiKey(),
        'X-Goog-FieldMask': [
            'places.id',
            'places.displayName',
            'places.formattedAddress',
            'places.location',
            'places.rating',
            'places.userRatingCount',
            'places.reviews',
            'places.businessStatus',
            'places.currentOpeningHours',
            'places.googleMapsUri',
            'places.websiteUri',
            'places.nationalPhoneNumber',
            'places.paymentOptions',
            'places.viewport',
            'places.primaryType',
            'places.types',
            'places.photos',
        ].join(','),
    };
}

/**
 * Field mask for Place Details (New) — this endpoint DOES support
 * wheelchairAccessible, evChargeOptions, photos, etc.
 */
function getPlaceDetailsHeaders(): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': getApiKey(),
        'X-Goog-FieldMask': [
            'id',
            'displayName',
            'formattedAddress',
            'location',
            'rating',
            'userRatingCount',
            'reviews',
            'businessStatus',
            'currentOpeningHours',
            'googleMapsUri',
            'websiteUri',
            'nationalPhoneNumber',
            'wheelchairAccessible',
            'evChargeOptions',
            'paymentOptions',
            'viewport',
            'primaryType',
            'types',
            'photos',
        ].join(','),
    };
}

/** Maps a Google API error response to a user-friendly message + status key. */
function parseErrorResponse(errorData: { error?: { message?: string; status?: string; details?: Array<{ fieldViolations?: Array<{ field?: string; description?: string }> }> } }): { status: string; errorMessage: string } {
    const googleStatus = errorData?.error?.status || 'UNKNOWN';
    const rawMessage = errorData?.error?.message || `Places API responded with an error`;

    // Extract field violations for the most actionable message possible
    const violations = errorData?.error?.details
        ?.flatMap((d) => d.fieldViolations ?? [])
        .map((v) => `${v.field}: ${v.description}`)
        .join('; ');

    let statusKey: string;
    let friendlyMessage: string;

    switch (googleStatus) {
        case 'INVALID_ARGUMENT':
            statusKey = 'INVALID_ARGUMENT';
            friendlyMessage = 'Google request is malformed.';
            if (violations) friendlyMessage = `Google request is malformed. ${violations}`;
            break;
        case 'REQUEST_DENIED':
        case 'PERMISSION_DENIED':
            statusKey = 'REQUEST_DENIED';
            friendlyMessage = 'Google API permission denied. Check API key restrictions and enabled APIs.';
            break;
        case 'OVER_QUERY_LIMIT':
        case 'RESOURCE_EXHAUSTED':
            statusKey = 'OVER_QUERY_LIMIT';
            friendlyMessage = 'Google Places quota exceeded. Check billing and quotas in Google Cloud Console.';
            break;
        case 'ZERO_RESULTS':
            statusKey = 'ZERO_RESULTS';
            friendlyMessage = 'No parking found nearby.';
            break;
        case 'NOT_FOUND':
            statusKey = 'NOT_FOUND';
            friendlyMessage = 'The requested place was not found.';
            break;
        case 'FAILED_PRECONDITION':
            statusKey = 'FAILED_PRECONDITION';
            friendlyMessage = 'Places API is not enabled for this API key. Enable Places API in Google Cloud Console.';
            break;
        default:
            statusKey = `ERROR`;
            friendlyMessage = rawMessage;
            break;
    }

    return { status: statusKey, errorMessage: friendlyMessage };
}

function extractCity(formattedAddress: string): string {
    if (!formattedAddress) return '';
    const parts = formattedAddress.split(',').map((p) => p.trim());
    // City is typically the second-to-last or third-to-last component
    if (parts.length >= 3) return parts[parts.length - 3] || '';
    if (parts.length >= 2) return parts[parts.length - 2] || '';
    return '';
}

function mapPlaceToParkingLot(place: any, searchCenter: LocationCoords): ParkingLot | null {
    if (!place?.id || !place?.location) return null;

    const lat = place.location.latitude;
    const lng = place.location.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const displayName = place.displayName?.text || 'Parking';
    const formattedAddress = place.formattedAddress || 'Address not available';

    // Google Places has no rate data, so discovered lots get a deterministic
    // INR rate + generated floor plan — making live booking work end-to-end.
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
        distanceKm: Number(calculateHaversineKm(searchCenter.lat, searchCenter.lng, lat, lng).toFixed(1)),
    };

    // Only map fields that Google actually returns — never fabricate.
    if (place.rating !== undefined) lot.rating = place.rating;
    if (place.userRatingCount !== undefined) {
        lot.userRatingCount = place.userRatingCount;
        lot.reviewCount = place.userRatingCount;
    }
    if (place.businessStatus !== undefined) lot.businessStatus = place.businessStatus;
    if (place.currentOpeningHours !== undefined) {
        lot.currentOpeningHours = place.currentOpeningHours as PlaceCurrentOpeningHours;
        const weekday = place.currentOpeningHours.weekdayDescriptions;
        if (Array.isArray(weekday) && weekday.length > 0) {
            lot.openingHours = weekday[0];
        }
    }
    if (Array.isArray(place.photos) && place.photos.length > 0) {
        lot.photos = place.photos as PlacePhoto[];
        // Build the Place Photo API URL for the first photo
        const photo = place.photos[0];
        if (photo?.name) {
            lot.imageUrl = `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=400&maxWidthPx=600&key=${encodeURIComponent(getApiKey())}`;
            console.log(`[googlePlacesService] Photo found for "${lot.name}": ${photo.name}`);
        }
    } else {
        console.debug(`[googlePlacesService] No photos in response for "${lot.name}" (photos field:`, place.photos, ')');
    }
    if (place.googleMapsUri !== undefined) lot.googleMapsUri = place.googleMapsUri;
    if (place.websiteUri !== undefined) lot.websiteUri = place.websiteUri;
    if (place.nationalPhoneNumber !== undefined) lot.nationalPhoneNumber = place.nationalPhoneNumber;
    if (place.wheelchairAccessible !== undefined) lot.wheelchairAccessible = place.wheelchairAccessible;
    if (place.evChargeOptions !== undefined) {
        lot.evChargeOptions = place.evChargeOptions as PlaceEvChargeOptions;
        const connectorCount = place.evChargeOptions.connectorCount;
        if (connectorCount !== undefined) lot.evChargersCount = connectorCount;
    }
    if (place.paymentOptions !== undefined) lot.paymentOptions = place.paymentOptions as PlacePaymentOptions;
    if (place.viewport !== undefined) lot.viewport = place.viewport as PlaceViewport;

    // Map Google Places reviews → Review[]
    if (Array.isArray(place.reviews) && place.reviews.length > 0) {
        lot.reviews = place.reviews
            .filter((r: any) => r?.text?.text)
            .slice(0, 10)
            .map((r: any, idx: number) => ({
                id: `gp_${place.id}_${idx}`,
                userName: r.authorAttributions?.[0]?.displayName || 'Google User',
                userAvatar: r.authorAttributions?.[0]?.photoUri,
                rating: typeof r.rating === 'number' ? r.rating : 5,
                date: r.relativePublishTimeDescription || '',
                comment: r.text.text,
                isVerifiedBooking: false,
            }));
    }

    return lot;
}

/**
 * Google Places API (New) — Nearby Search
 * POST https://places.googleapis.com/v1/places:searchNearby
 */
export async function searchNearbyParking({
    location,
    radiusMeters = 5000,
    signal,
}: NearbySearchParams): Promise<NearbySearchResponse> {
    if (!isValidLocation(location)) {
        console.error('[googlePlacesService] Invalid GPS coordinates passed to searchNearbyParking:', location);
        return {
            places: [],
            status: 'INVALID_COORDINATES',
            errorMessage: 'Invalid GPS coordinates. Latitude must be between -90 and 90, longitude between -180 and 180.',
        };
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            places: [],
            status: 'MISSING_API_KEY',
            errorMessage: 'Google Maps Platform API key is missing. Add GOOGLE_MAPS_PLATFORM_KEY or VITE_GOOGLE_MAPS_PLATFORM_KEY to your .env file.',
        };
    }

    const radius = Math.max(1000, Math.min(5000, Math.round(radiusMeters)));

    const body = {
        includedTypes: ['parking'],
        maxResultCount: 20,
        locationRestriction: {
            circle: {
                center: {
                    latitude: location.lat,
                    longitude: location.lng,
                },
                radius: radius,
            },
        },
    };

    // Log the full request pre-flight (matches Step 4 of the audit)
    console.log('[googlePlacesService] Nearby Search request:', {
        url: `${PLACES_API_BASE}/places:searchNearby`,
        headers: getNearbySearchHeaders(),
        body,
    });

    try {
        const response = await fetch(`${PLACES_API_BASE}/places:searchNearby`, {
            method: 'POST',
            headers: getNearbySearchHeaders(),
            body: JSON.stringify(body),
            signal,
        });

        if (!response.ok) {
            let errorData: any = null;
            try {
                errorData = (await response.json()) as { error?: { message?: string; status?: string; details?: Array<{ fieldViolations?: Array<{ field?: string; description?: string }> }> } };
            } catch {
                // Ignore JSON parse errors
            }

            const { status, errorMessage } = parseErrorResponse(errorData ?? {});

            console.error(`[googlePlacesService] Nearby Search failed (HTTP ${response.status}):`, {
                status,
                errorMessage,
                raw: errorData,
            });

            return {
                places: [],
                status,
                googleStatus: errorData?.error?.status,
                errorMessage,
            };
        }

        const data = (await response.json()) as {
            places?: any[];
            nextPageToken?: string;
        };

        const rawPlaces = Array.isArray(data.places) ? data.places : [];
        const places = rawPlaces
            .map((place) => mapPlaceToParkingLot(place, location))
            .filter((lot): lot is ParkingLot => lot !== null)
            .sort((a, b) => a.distanceKm - b.distanceKm);

        console.log('[googlePlacesService] Nearby Search OK:', {
            status: 'OK',
            placesReturned: rawPlaces.length,
            placesMapped: places.length,
        });

        return {
            places,
            status: 'OK',
            googleStatus: 'OK',
        };
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            return { places: [], status: 'ABORTED', errorMessage: 'Request was cancelled.' };
        }
        console.error('[googlePlacesService] Network error contacting Places API:', err);
        return {
            places: [],
            status: 'NETWORK_ERROR',
            errorMessage: err?.message || 'Network failure while contacting Google Places API.',
        };
    }
}

/**
 * Google Places API (New) — Text Search (Parking fallback)
 * POST https://places.googleapis.com/v1/places:searchText
 *
 * Used for smaller Indian cities / towns where Nearby Search returns very few
 * results. Searches for parking using a free-text query such as
 * "parking near Bongaon Railway Station" or "parking in Bongaon".
 */
export async function searchTextParking({
    query,
    center,
    maxResultCount = 20,
    signal,
}: TextSearchParams): Promise<NearbySearchResponse> {
    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            places: [],
            status: 'MISSING_API_KEY',
            errorMessage: 'Google Maps Platform API key is missing.',
        };
    }

    const cleaned = query.trim();
    if (!cleaned) {
        return { places: [], status: 'INVALID_ARGUMENT', errorMessage: 'Search query is empty.' };
    }

    const searchCenter = center ?? { lat: 0, lng: 0 };

    try {
        const response = await fetch(`${PLACES_API_BASE}/places:searchText`, {
            method: 'POST',
            headers: getNearbySearchHeaders(),
            body: JSON.stringify({
                textQuery: cleaned,
                maxResultCount,
                ...(center ? {
                    locationBias: {
                        circle: {
                            center: { latitude: center.lat, longitude: center.lng },
                            radius: 20000,
                        },
                    },
                } : {}),
            }),
            signal,
        });

        if (!response.ok) {
            let errorData: any = null;
            try {
                errorData = (await response.json()) as { error?: { message?: string; status?: string; details?: Array<{ fieldViolations?: Array<{ field?: string; description?: string }> }> } };
            } catch {
                // Ignore JSON parse errors
            }

            const { status, errorMessage } = parseErrorResponse(errorData ?? {});
            console.warn(`[googlePlacesService] Text Search (parking) failed (HTTP ${response.status}):`, {
                status,
                errorMessage,
                query: cleaned,
            });
            return { places: [], status, googleStatus: errorData?.error?.status, errorMessage };
        }

        const data = (await response.json()) as {
            places?: any[];
            nextPageToken?: string;
        };

        const rawPlaces = Array.isArray(data.places) ? data.places : [];
        const places = rawPlaces
            .map((place) => mapPlaceToParkingLot(place, searchCenter))
            .filter((lot): lot is ParkingLot => lot !== null)
            .sort((a, b) => a.distanceKm - b.distanceKm);

        console.log('[googlePlacesService] Text Search (parking) OK:', {
            status: 'OK',
            query: cleaned,
            placesReturned: rawPlaces.length,
            placesMapped: places.length,
        });

        return { places, status: 'OK', googleStatus: 'OK' };
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            return { places: [], status: 'ABORTED', errorMessage: 'Request was cancelled.' };
        }
        console.error('[googlePlacesService] Network error contacting Places API (Text Search):', err);
        return {
            places: [],
            status: 'NETWORK_ERROR',
            errorMessage: err?.message || 'Network failure while contacting Google Places API.',
        };
    }
}

/**
 * Google Places API (New) — Place Details
 * GET https://places.googleapis.com/v1/places/{placeId}
 *
 * Note: `wheelchairAccessible`, `evChargeOptions`, and `photos` are fetched here
 * because they are NOT available via Nearby Search (New).
 */
export async function fetchPlaceDetails({
    placeId,
    signal,
}: PlaceDetailsParams): Promise<PlaceDetailsResponse> {
    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            place: null,
            status: 'MISSING_API_KEY',
            errorMessage: 'Google Maps Platform API key is missing.',
        };
    }

    try {
        const response = await fetch(`${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}`, {
            method: 'GET',
            headers: getPlaceDetailsHeaders(),
            signal,
        });

        if (!response.ok) {
            let errorData: any = null;
            try {
                errorData = (await response.json()) as { error?: { message?: string; status?: string } };
            } catch {
                // Ignore JSON parse errors
            }

            const { status, errorMessage } = parseErrorResponse(errorData ?? {});
            console.error(`[googlePlacesService] Place Details failed (HTTP ${response.status}):`, {
                status,
                errorMessage,
            });
            return { place: null, status, errorMessage };
        }

        const data = (await response.json()) as any;
        const place = mapPlaceToParkingLot(data, {
            lat: data?.location?.latitude ?? 0,
            lng: data?.location?.longitude ?? 0,
        });

        return {
            place,
            status: 'OK',
        };
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            return { place: null, status: 'ABORTED', errorMessage: 'Request was cancelled.' };
        }
        return {
            place: null,
            status: 'NETWORK_ERROR',
            errorMessage: err?.message || 'Network failure while contacting Google Places API.',
        };
    }
}

/**
 * Google Places API (New) — Text Search (Geocoding)
 * POST https://places.googleapis.com/v1/places:searchText
 * Used to geocode "Airport", "Hospital", "College", or any address.
 */
export async function geocodeWithPlacesApi(
    query: string,
    signal?: AbortSignal
): Promise<{ lat: number; lng: number; displayName: string } | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    const cleaned = query.trim();
    if (!cleaned) return null;

    try {
        const response = await fetch(`${PLACES_API_BASE}/places:searchText`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.formattedAddress',
            },
            body: JSON.stringify({
                textQuery: cleaned,
                maxResultCount: 1,
            }),
            signal,
        });

        if (!response.ok) {
            console.warn(`[googlePlacesService] Text Search geocoding failed (HTTP ${response.status}) for query:`, cleaned);
            return null;
        }

        const data = (await response.json()) as {
            places?: Array<{
                displayName?: { text?: string };
                location?: { latitude?: number; longitude?: number };
                formattedAddress?: string;
            }>;
        };

        const place = data.places?.[0];
        // Use strict null/undefined checks — 0 is a valid lat/lng for places on the equator/prime meridian.
        if (!place?.location) return null;
        if (place.location.latitude === undefined || place.location.longitude === undefined) return null;
        if (!Number.isFinite(place.location.latitude) || !Number.isFinite(place.location.longitude)) return null;

        return {
            lat: place.location.latitude,
            lng: place.location.longitude,
            displayName: place.displayName?.text || place.formattedAddress || cleaned,
        };
    } catch {
        return null;
    }
}