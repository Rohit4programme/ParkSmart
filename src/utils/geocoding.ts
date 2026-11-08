import { geocodeWithPlacesApi } from '../services/googlePlacesService';

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

/**
 * Converts a free-text destination query into geographic coordinates using
 * the Google Places API (New) Text Search endpoint.
 *
 * Returns null when the query is empty, geocoding fails, or no matching
 * location can be found.
 */
export async function geocodeLocation(query: string): Promise<GeocodeResult | null> {
  return geocodeWithPlacesApi(query);
}