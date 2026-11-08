
import { haversineDistance } from './polyline';

export interface DrivingEstimate {
  durationText: string;
  distanceText: string;
  durationMinutes: number;
  distanceKm: number;
}

export function calculateHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return haversineDistance({ lat: lat1, lng: lon1 }, { lat: lat2, lng: lon2 }) / 1000;
}

export function getFallbackDrivingEstimate(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): DrivingEstimate {
  const distKm = calculateHaversineKm(origin.lat, origin.lng, destination.lat, destination.lng);
  const distMiles = distKm * 0.621371;

  const speedKmH = 28;
  const durationHours = distKm / speedKmH;
  const durationMinutes = Math.max(2, Math.ceil(durationHours * 60));

  return {
    durationText: `${durationMinutes} mins drive`,
    distanceText: `${distMiles.toFixed(1)} mi (${distKm.toFixed(1)} km)`,
    durationMinutes,
    distanceKm: distKm,
  };
}
