import { useEffect, useState, useCallback, useRef } from 'react';
import {
  LocationCoords,
  LocationErrorCode,
  getBrowserPosition,
  geolocationErrorCode,
  locationErrorMessage,
  watchCurrentLocation,
} from '../services/locationService';

export interface UseCurrentLocationState {
  location: LocationCoords | null;
  /** Accuracy of the most recent GPS fix in meters. */
  accuracyMeters: number | null;
  permissionState: PermissionState | 'unknown';
  /** Timestamp of the most recent GPS fix, in milliseconds since epoch. */
  timestampMs: number | null;
  isLoading: boolean;
  errorCode: LocationErrorCode | null;
  error: string | null;
  /** Re-run the initial GPS lookup. */
  retry: () => void;
}

export function useCurrentLocation(): UseCurrentLocationState {
  const [location, setLocation] = useState<LocationCoords | null>(null);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [timestampMs, setTimestampMs] = useState<number | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState | 'unknown'>('unknown');
  const [isLoading, setIsLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<LocationErrorCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Best accuracy (meters) seen so far, used to reject coarse GPS blips. */
  const accuracyRef = useRef<number | null>(null);

  // One-time permission state read.
  useEffect(() => {
    let cancelled = false;
    if ('permissions' in navigator && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((status) => {
          if (!cancelled) setPermissionState(status.state);
        })
        .catch(() => {
          if (!cancelled) setPermissionState('unknown');
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Initial GPS fix + live location watching.
  useEffect(() => {
    let cancelled = false;

    setErrorCode(null);
    setError(null);
    accuracyRef.current = null;

    // Shared "commit" path used by both the one-time fix and the live watcher.
    // Guarded so a coarse WiFi/IP fix never replaces a good GPS fix.
    const commitFix = (lat: number, lng: number, accuracy: number, timestamp: number) => {
      if (cancelled) return;

      const currentAccuracy = accuracyRef.current;
      if (currentAccuracy !== null && accuracy > 200 && accuracy > currentAccuracy * 3) {
        return;
      }
      accuracyRef.current = accuracy;

      setLocation({ lat, lng });
      setAccuracyMeters(accuracy);
      setTimestampMs(timestamp);
      setPermissionState('granted');
      setIsLoading(false);
      setErrorCode(null);
      setError(null);
    };

    const handlePosition = (position: GeolocationPosition) => {
      commitFix(
        position.coords.latitude,
        position.coords.longitude,
        position.coords.accuracy,
        position.timestamp
      );
    };

    const handleError = (err: unknown) => {
      if (cancelled) return;
      const code = geolocationErrorCode(err);
      setErrorCode(code);
      setError(locationErrorMessage(code));
      setIsLoading(false);
    };

    setIsLoading(true);

    getBrowserPosition().then(handlePosition).catch(handleError);

    const stopWatching = watchCurrentLocation((nextLocation, accuracy) => {
      commitFix(nextLocation.lat, nextLocation.lng, accuracy ?? 9999, Date.now());
    });

    return () => {
      cancelled = true;
      stopWatching();
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setIsLoading(true);
    setAttempt((value) => value + 1);
  }, []);

  return {
    location,
    accuracyMeters,
    permissionState,
    timestampMs,
    isLoading,
    errorCode,
    error,
    retry,
  };
}