export interface LocationCoords {
  lat: number;
  lng: number;
}

export type GeolocationPermissionState = PermissionState | 'unknown';

export type LocationErrorCode =
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'
  | 'unsupported'
  | 'insecure_context'
  | 'unknown';

export interface LocationDebugInfo {
  source: 'gps' | 'fallback';
  permissionState: GeolocationPermissionState;
  accuracyMeters?: number;
  timestampMs?: number;
  errorCode?: LocationErrorCode;
  errorMessage?: string;
}

export const KOLKATA_FALLBACK: LocationCoords = {
  lat: 22.572646,
  lng: 88.363895,
};

export const CURRENT_LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
} as const;

/** Stricter options used when navigation starts and we need a fresh, accurate fix. */
export const NAVIGATION_LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
} as const;

/** Maps a geolocation error to a structured, machine-readable code. */
export function geolocationErrorCode(err: unknown): LocationErrorCode {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'insecure_context';
  }
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as GeolocationPositionError).code;
    if (code === 1) return 'permission_denied';
    if (code === 2) return 'position_unavailable';
    if (code === 3) return 'timeout';
  }
  if (err instanceof Error && err.message === 'Geolocation unavailable') {
    return 'unsupported';
  }
  return 'unknown';
}

/** Returns a user-friendly message for a geolocation error code. */
export function locationErrorMessage(code: LocationErrorCode): string {
  switch (code) {
    case 'permission_denied':
      return 'Location permission denied. Enable location access for this site in your browser settings, then try again.';
    case 'position_unavailable':
      return 'Unable to determine your location. Move to an open area or try again.';
    case 'timeout':
      return 'Location lookup timed out. Move to an open area or try again.';
    case 'insecure_context':
      return 'Geolocation is blocked because the app is not running over HTTPS (or localhost). Open it via http://localhost:3000 or a secure https URL.';
    case 'unsupported':
      return 'This browser does not support geolocation. Search for a destination instead.';
    default:
      return 'Unable to determine your location. Search for a destination instead.';
  }
}

export async function getGeolocationPermissionState(): Promise<GeolocationPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unknown';
  }

  try {
    const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return result.state;
  } catch {
    return 'unknown';
  }
}

export function getBrowserPosition(options: PositionOptions = CURRENT_LOCATION_OPTIONS): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('Geolocation unavailable'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

export function getBrowserLocation(): Promise<LocationCoords> {
  return getBrowserPosition().then((position) => ({
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  }));
}

/** Fresh high-accuracy GPS fix used when navigation begins (never a cached/course fix). */
export function getNavigationPosition(): Promise<LocationCoords> {
  return getBrowserPosition(NAVIGATION_LOCATION_OPTIONS).then((position) => ({
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  }));
}

/**
 * NOTE: This function intentionally NO LONGER falls back to Kolkata.
 * It rejects when GPS fails so callers can show a real error instead of
 * silently centering the map on a hardcoded city.
 */
export async function getCurrentLocationOrFallback(): Promise<LocationCoords> {
  return getBrowserLocation();
}

export function watchCurrentLocation(
  onUpdate: (location: LocationCoords, accuracyMeters?: number) => void
): () => void {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return () => undefined;
  }

  let cancelled = false;
  let watchId: number | null = null;

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      if (!cancelled) {
        onUpdate(
          { lat: position.coords.latitude, lng: position.coords.longitude },
          position.coords.accuracy
        );
      }
    },
    () => {
      // Keep the current location when updates fail; the initial fix remains active.
    },
    CURRENT_LOCATION_OPTIONS
  );

  return () => {
    cancelled = true;
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
    }
  };
}