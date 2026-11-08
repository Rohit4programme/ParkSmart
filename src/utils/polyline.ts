/**
 * Shared polyline utilities for the navigation system.
 *
 * Google's Directions API returns an encoded polyline string in `overview_polyline`.
 * This decoder converts that string into an array of {lat, lng} coordinates.
 *
 * We do NOT encode polylines — that function was removed because it had a bug
 * (module-level mutable state) and is unnecessary since all route geometries
 * come from the Directions API.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Coerce + validate an arbitrary coordinate object into a usable LatLng.
 * Accepts {lat,lng}, {latitude,longitude}, or string numbers, and rejects
 * undefined/null/NaN/out-of-range values.
 */
export function toValidLatLng(input: unknown): LatLng | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;

  let lat = o.lat ?? o.latitude;
  let lng = o.lng ?? o.longitude;

  if (typeof lat === 'string' && lat.trim() !== '') lat = Number(lat);
  if (typeof lng === 'string' && lng.trim() !== '') lng = Number(lng);

  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

/**
 * Decode a Google-encoded polyline string into an array of coordinates.
 * Uses the standard Google Polyline Encoding Algorithm.
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/**
 * Haversine distance between two coordinates in meters.
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const R = 6371e3;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Calculate bearing from point A to point B in degrees (0-360, clockwise from north).
 */
export function calculateBearing(a: LatLng, b: LatLng): number {
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Find the nearest point on a polyline to a given point.
 * Returns the distance, the segment index, and the fractional position along that segment.
 */
export function findNearestPointOnRoute(
  point: LatLng,
  route: LatLng[]
): { distance: number; index: number; fraction: number } {
  if (route.length === 0) return { distance: Infinity, index: 0, fraction: 0 };

  let minDist = Infinity;
  let nearestIdx = 0;
  let fraction = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i];
    const p2 = route[i + 1];

    const A = point.lat - p1.lat;
    const B = point.lng - p1.lng;
    const C = p2.lat - p1.lat;
    const D = p2.lng - p1.lng;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let t = lenSq !== 0 ? dot / lenSq : -1;
    t = Math.max(0, Math.min(1, t));

    const projLat = p1.lat + t * C;
    const projLng = p1.lng + t * D;
    const dist = haversineDistance(point, { lat: projLat, lng: projLng });

    if (dist < minDist) {
      minDist = dist;
      nearestIdx = i;
      fraction = t;
    }
  }

  return { distance: minDist, index: nearestIdx, fraction };
}
