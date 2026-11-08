import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ParkingLot } from '../types';
import { fetchNearbyParking } from '../services/parkingService';
import { LocationCoords } from '../services/locationService';

interface UseNearbyParkingState {
  lots: ParkingLot[];
  isLoading: boolean;
  error: string | null;
  status: string | null;
  /** True when the Google request itself failed (vs. genuine zero results). */
  isApiError: boolean;
  refetch: () => void;
}

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map<string, { data: ParkingLot[]; fetchedAt: number }>();

function getCacheKey(location: LocationCoords, radiusMeters: number, searchQuery: string): string {
  return `${location.lat.toFixed(4)},${location.lng.toFixed(4)},${radiusMeters},${searchQuery.trim().toLowerCase()}`;
}

export function useNearbyParking(
  location: LocationCoords | null,
  radiusMeters = 5000,
  searchQuery = ''
): UseNearbyParkingState {
  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isApiError, setIsApiError] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const debounceTimerRef = useRef<number | null>(null);

  const effectiveRadius = useMemo(() => Math.max(1000, Math.min(20000, radiusMeters)), [radiusMeters]);
  const trimmedQuery = searchQuery.trim();

  const refetch = useCallback(() => {
    setRefreshToken((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!location) return;

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    const controller = new AbortController();
    const cacheKey = getCacheKey(location, effectiveRadius, trimmedQuery);

    debounceTimerRef.current = window.setTimeout(() => {
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        setLots(cached.data);
        setError(null);
        setStatus('CACHED');
        setIsApiError(false);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      setIsApiError(false);

      fetchNearbyParking({
        location,
        radiusMeters: effectiveRadius,
        searchText: trimmedQuery || undefined,
        signal: controller.signal,
      })
        .then(({ lots: nearbyLots, warning, status: searchStatus, isApiError: apiErrorFlag }) => {
          if (controller.signal.aborted) return;
          setLots(nearbyLots);
          setStatus(searchStatus ?? null);
          setError(warning ?? null);
          setIsApiError(Boolean(apiErrorFlag));
          cache.set(cacheKey, { data: nearbyLots, fetchedAt: Date.now() });
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : 'Unable to fetch nearby parking');
          setStatus('ERROR');
          setIsApiError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      controller.abort();
    };
  }, [location?.lat, location?.lng, effectiveRadius, trimmedQuery, refreshToken]);

  return {
    lots,
    isLoading,
    error,
    status,
    isApiError,
    refetch,
  };
}