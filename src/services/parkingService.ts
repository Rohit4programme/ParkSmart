import { ParkingLot } from '../types';
import { LocationCoords, KOLKATA_FALLBACK } from './locationService';
import { searchNearbyParking, searchTextParking, fetchPlaceDetails } from './googlePlacesService';

export interface NearbyParkingQuery {
  location: LocationCoords;
  radiusMeters?: number;
  /** Optional free-text query used for the Text Search fallback in sparse areas. */
  searchText?: string;
  signal?: AbortSignal;
}

export interface NearbyParkingResponse {
  lots: ParkingLot[];
  source?: string;
  warning?: string;
  status?: string;
  /** True when the Google request itself failed (vs. genuine zero results). */
  isApiError?: boolean;
  googleStatus?: string;
  /** Set once the final merged list is available. */
  diagnostics?: {
    searchLocation: LocationCoords;
    startedRadiusMeters: number;
    finalRadiusMeters: number;
    nearbyResults: number;
    textSearchResults: number;
    mergedResults: number;
    duplicatesRemoved: number;
    radiusExpansions: number[];
  };
}

/**
 * Statuses that indicate the request itself failed and parking results are
 * therefore unknown — NOT a genuine "no parking found" scenario.
 */
const API_ERROR_STATUSES = new Set([
  'INVALID_ARGUMENT',
  'INVALID_COORDINATES',
  'REQUEST_DENIED',
  'PERMISSION_DENIED',
  'OVER_QUERY_LIMIT',
  'RESOURCE_EXHAUSTED',
  'MISSING_API_KEY',
  'NOT_FOUND',
  'FAILED_PRECONDITION',
  'NETWORK_ERROR',
  'ABORTED',
  'ERROR',
  'ERROR_400',
  'ERROR_401',
  'ERROR_403',
  'ERROR_404',
  'ERROR_429',
  'ERROR_500',
  'ERROR_503',
]);

/** Radii (meters) tried in order when Nearby Search returns too few results. */
export const EXPANSION_RADII_METERS = [5000, 10000, 20000];

/** Minimum number of results before we consider a radius good enough. */
const MIN_ACCEPTABLE_RESULTS = 3;

/** Merges two lists of parking lots, removing duplicates by Google Place ID. */
function mergeDeduplicate(primary: ParkingLot[], secondary: ParkingLot[]): {
  merged: ParkingLot[];
  duplicatesRemoved: number;
} {
  const seen = new Set<string>();
  const merged: ParkingLot[] = [];

  for (const lot of [...primary, ...secondary]) {
    const key = lot.placeId || lot.id;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(lot);
  }

  return {
    merged,
    duplicatesRemoved: primary.length + secondary.length - merged.length,
  };
}

export async function fetchNearbyParking({
  location,
  radiusMeters = 5000,
  searchText,
  signal,
}: NearbyParkingQuery): Promise<NearbyParkingResponse> {
  // Clamp the starting radius to the supported range.
  const startRadius = Math.max(1000, Math.min(20000, radiusMeters));

  console.debug('Provider: Google Places API (New)');
  console.debug('Current GPS:', location.lat, location.lng);
  console.debug('Search Center:', location.lat, location.lng);
  console.debug(`Starting Radius: ${startRadius}m`);
  console.debug('API URL: https://places.googleapis.com/v1/places:searchNearby');

  // --- Step 1: Nearby Search with progressive radius expansion ---
  let nearbyLots: ParkingLot[] = [];
  let finalRadiusMeters = startRadius;
  const radiusExpansions: number[] = [];
  let nearbyStatus: string | null = null;
  let nearbyWarning: string | null = null;
  let nearbyApiError = false;

  for (const candidateRadius of EXPANSION_RADII_METERS.filter((r) => r >= startRadius)) {
    const result = await searchNearbyParking({
      location,
      radiusMeters: candidateRadius,
      signal,
    });

    radiusExpansions.push(candidateRadius);
    finalRadiusMeters = candidateRadius;
    nearbyStatus = result.status;
    nearbyWarning = result.errorMessage || null;

    console.log(`[parkingService] Nearby Search @ ${candidateRadius}m: status=${result.status}, places=${result.places.length}`);

    if (result.status === 'OK') {
      nearbyLots = result.places;
      nearbyApiError = false;
      if (result.places.length >= MIN_ACCEPTABLE_RESULTS) {
        break; // Found enough — no need to expand further.
      }
    } else if (API_ERROR_STATUSES.has(result.status) || result.status.startsWith('ERROR')) {
      nearbyApiError = true;
      break; // Real API failure — don't waste more requests.
    }
    // ZERO_RESULTS or sparse results → continue expanding.
  }

  console.debug('Nearby Search Status:', nearbyStatus);
  console.debug('Places Returned (Nearby):', nearbyLots.length);
  console.debug('Final Radius:', finalRadiusMeters);

  // --- Step 2: Text Search fallback for sparse / zero nearby results ---
  let textSearchLots: ParkingLot[] = [];
  const textSearchQuery = searchText?.trim();

  if (textSearchQuery && nearbyLots.length < MIN_ACCEPTABLE_RESULTS) {
    console.debug(`[parkingService] Nearby Search sparse (${nearbyLots.length}), falling back to Text Search: "${textSearchQuery}"`);
    const textResult = await searchTextParking({
      query: textSearchQuery,
      center: location,
      signal,
    });

    if (textResult.status === 'OK') {
      textSearchLots = textResult.places;
      console.log(`[parkingService] Text Search returned ${textSearchLots.length} places`);
    } else {
      console.warn(`[parkingService] Text Search failed: ${textResult.status} ${textResult.errorMessage || ''}`);
    }
  } else {
    console.debug('[parkingService] Text Search skipped (either no query or Nearby Search already returned enough results).');
  }

  // --- Step 3: Merge + dedupe ---
  const { merged, duplicatesRemoved } = mergeDeduplicate(nearbyLots, textSearchLots);
  const sortedMerged = [...merged].sort((a, b) => a.distanceKm - b.distanceKm);

  // --- Step 4: Enrich lots missing photos via Place Details ---
  const lotsNeedingPhotos = sortedMerged
    .filter((lot) => (!lot.photos || lot.photos.length === 0) && lot.placeId)
    .slice(0, 10);

  console.log(`[parkingService] Step 4: ${lotsNeedingPhotos.length} of ${sortedMerged.length} lots need photos`);

  if (lotsNeedingPhotos.length > 0) {
    const enrichResults = await Promise.allSettled(
      lotsNeedingPhotos.map(async (lot) => {
        try {
          const details = await fetchPlaceDetails({ placeId: lot.placeId! });
          const hasPhotos = Boolean(details.place?.photos?.length);
          const imageUrl = details.place?.imageUrl ?? 'none';
          console.log(`[parkingService] Place Details "${lot.name}": status=${details.status} hasPhotos=${hasPhotos} imageUrl=${imageUrl.slice(0, 100)}`);
          if (details.status === 'OK' && details.place) {
            // Create a NEW object so React detects the change
            const idx = sortedMerged.findIndex((l) => l.placeId === lot.placeId);
            if (idx !== -1) {
              sortedMerged[idx] = {
                ...sortedMerged[idx],
                ...(details.place.photos && details.place.photos.length > 0 ? { photos: details.place.photos } : {}),
                ...(details.place.imageUrl ? { imageUrl: details.place.imageUrl } : {}),
              };
            }
          }
        } catch (e: any) {
          console.warn(`[parkingService] Photo enrichment failed for "${lot.name}":`, e?.message || e);
        }
      })
    );
    const enriched = enrichResults.filter((r) => r.status === 'fulfilled').length;
    console.log(`[parkingService] Photo enrichment complete: ${enriched}/${lotsNeedingPhotos.length} succeeded`);
  }

  // --- Diagnostics log (requirement 8) ---
  const photoSummary = sortedMerged.map((l) => ({
    name: l.name,
    hasPhotos: Boolean(l.photos && l.photos.length > 0),
    hasImageUrl: Boolean(l.imageUrl && l.imageUrl !== ''),
  }));
  console.log('[parkingService] Photo summary:', photoSummary);

  const diagnostics = {
    searchLocation: location,
    startedRadiusMeters: startRadius,
    finalRadiusMeters,
    nearbyResults: nearbyLots.length,
    textSearchResults: textSearchLots.length,
    mergedResults: sortedMerged.length,
    duplicatesRemoved,
    radiusExpansions,
  };
  console.log('[parkingService] Search diagnostics:', diagnostics);

  // If every request failed at the API level → propagate the error.
  if (nearbyApiError && sortedMerged.length === 0) {
    return {
      lots: [],
      source: 'google_places',
      status: nearbyStatus ?? 'ERROR',
      googleStatus: nearbyStatus ?? undefined,
      warning: nearbyWarning || 'Google Places API request failed.',
      isApiError: true,
      diagnostics,
    };
  }

  // Genuine zero results everywhere → friendly message (requirement 7).
  if (sortedMerged.length === 0) {
    return {
      lots: [],
      source: 'google_places',
      status: 'ZERO_RESULTS',
      warning: "No parking locations are currently available in Google's database for this area.",
      isApiError: false,
      diagnostics,
    };
  }

  return {
    lots: sortedMerged,
    source: 'google_places',
    status: 'OK',
    isApiError: false,
    diagnostics,
  };
}

export async function fetchParkingDetails(placeId: string, signal?: AbortSignal): Promise<ParkingLot | null> {
  const result = await fetchPlaceDetails({ placeId, signal });
  if (result.status !== 'OK' || !result.place) return null;
  return result.place;
}

export function getFallbackNearbyParkingCenter(): LocationCoords {
  return KOLKATA_FALLBACK;
}