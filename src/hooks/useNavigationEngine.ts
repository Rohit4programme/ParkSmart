import { useState, useEffect, useRef, useCallback } from 'react';
import { decodePolyline, haversineDistance, findNearestPointOnRoute, calculateBearing, toValidLatLng, LatLng } from '../utils/polyline';
import { requestRouteData, RoutingError, extractOverviewCoordinates, latLngValue, RoutingDiagnostics, RoutingErrorCode } from '../services/routingService';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NavStep {
  instruction: string;
  maneuver: 'turn-left' | 'turn-right' | 'straight' | 'uturn' | 'roundabout' | 'exit-roundabout' | 'merge' | 'arrive' | 'depart' | 'keep-left' | 'keep-right';
  distance: number;
  duration: number;
  roadName: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  bearing: number;
  path: LatLng[];
}

export interface NavLeg {
  distance: number;
  duration: number;
  startAddress: string;
  endAddress: string;
  steps: NavStep[];
}

export interface NavRoute {
  legs: NavLeg[];
  totalDistance: number;
  totalDuration: number;
  trafficDuration: number;
  summary: string;
  polyline: string;
  steps: NavStep[];
  bounds: { northeast: LatLng; southwest: LatLng };
  decodedPath: LatLng[];
}

export type FetchRoutesResult = {
  routes: NavRoute[];
  rawResult: any;
  error: string | null;
  errorCode: RoutingErrorCode | null;
  diagnostics: RoutingDiagnostics | null;
};

export interface TrafficSegment {
  startIdx: number;
  endIdx: number;
  status: 'normal' | 'moderate' | 'heavy' | 'severe';
  color: string;
  delay: number;
}

export interface NavigationState {
  isNavigating: boolean;
  /** True when a valid route has been fetched and is drawn on the map, awaiting Start. */
  isRoutePrepared: boolean;
  isOffRoute: boolean;
  isRecalculating: boolean;
  isArrived: boolean;
  /** Human-readable routing failure message, or null when the last request succeeded. */
  navigationError: string | null;
  /** Machine-readable routing failure code (RoutingErrorCode), or null on success. */
  routingErrorCode: RoutingErrorCode | null;
  /** Step-by-step diagnostics from the last routing attempt (dev panel). */
  routingDiagnostics: RoutingDiagnostics | null;
  currentRoute: NavRoute | null;
  alternativeRoutes: NavRoute[];
  selectedRouteIndex: number;
  currentStepIndex: number;
  steps: NavStep[];
  trafficSegments: TrafficSegment[];
  distanceRemaining: number;
  durationRemaining: number;
  eta: Date | null;
  currentSpeed: number;
  speedLimit: number | null;
  distanceToRoute: number;
  isVoiceEnabled: boolean;
  showTraffic: boolean;
  showAlternatives: boolean;
  cameraMode: 'overview' | 'following' | 'destination';
  currentHeading: number | null;
  /** The raw routing result (REST JSON or JS API DirectionsResult) — used to render the wayline. */
  directionsResult: any | null;
  /** Live smoothed GPS position (reactive state — updates every GPS tick). */
  currentLocation: LatLng | null;
  travelMode: 'DRIVING' | 'WALKING';
}

interface GPSPoint {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number;
  timestamp: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const REROUTE_TRIGGER_THRESHOLD_METERS = 50;
const REROUTE_CLEAR_THRESHOLD_METERS = 30;
const ARRIVAL_THRESHOLD_METERS = 100;
const STEP_ADVANCE_THRESHOLD_METERS = 40;
const KALMAN_Q = 0.01;
const KALMAN_R = 0.1;
const GPS_SMOOTHING_FACTOR = 0.3;
const REROUTE_COOLDOWN_MS = 30000;
const REROUTE_CONFIRM_DELAY_MS = 3000;

// ─── Route Cache ─────────────────────────────────────────────────────────────

const routeCache = new Map<string, { routes: NavRoute[]; timestamp: number }>();
const ROUTE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getRouteCacheKey(origin: LatLng, destination: LatLng, travelMode: 'DRIVING' | 'WALKING' = 'DRIVING'): string {
  return `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}->${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}@${travelMode}`;
}

function getCachedRoutes(origin: LatLng, destination: LatLng, travelMode: 'DRIVING' | 'WALKING' = 'DRIVING'): NavRoute[] | null {
  const key = getRouteCacheKey(origin, destination, travelMode);
  const cached = routeCache.get(key);
  if (cached && Date.now() - cached.timestamp < ROUTE_CACHE_TTL) {
    return cached.routes;
  }
  routeCache.delete(key);
  return null;
}

function setRouteCache(origin: LatLng, destination: LatLng, routes: NavRoute[], travelMode: 'DRIVING' | 'WALKING' = 'DRIVING'): void {
  const key = getRouteCacheKey(origin, destination, travelMode);
  routeCache.set(key, { routes, timestamp: Date.now() });
  // Evict old entries
  if (routeCache.size > 50) {
    const oldest = routeCache.keys().next().value;
    if (oldest) routeCache.delete(oldest);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getManeuverType(maneuver?: string): NavStep['maneuver'] {
  if (!maneuver) return 'straight';
  const m = maneuver.toLowerCase();
  if (m.includes('uturn') || m === 'u-turn') return 'uturn';
  if (m.includes('roundabout') || m.includes('rotary')) return 'roundabout';
  if (m.includes('exit roundabout') || m.includes('exit rotary')) return 'exit-roundabout';
  if (m.includes('keep left') || m.includes('slight left')) return 'keep-left';
  if (m.includes('keep right') || m.includes('slight right')) return 'keep-right';
  if (m.includes('left')) return 'turn-left';
  if (m.includes('right')) return 'turn-right';
  if (m.includes('merge')) return 'merge';
  if (m.includes('arrive') || m.includes('destination')) return 'arrive';
  if (m.includes('depart') || m.includes('start')) return 'depart';
  return 'straight';
}

/**
 * Infer the turn maneuver from the bearing change between two consecutive
 * steps. Used when the provider (e.g. the REST Directions API) does not
 * include a `maneuver` field on each step.
 */
function getManeuverFromBearingDelta(prevBearing: number, nextBearing: number): NavStep['maneuver'] {
  const delta = ((nextBearing - prevBearing + 540) % 360) - 180;
  if (Math.abs(delta) < 20) return 'straight';
  if (delta <= -100 || delta >= 100) return 'uturn';
  if (delta <= -45) return 'turn-left';
  if (delta >= 45) return 'turn-right';
  if (delta < 0) return 'keep-left';
  return 'keep-right';
}

function getManeuverIcon(maneuver: NavStep['maneuver']): string {
  switch (maneuver) {
    case 'turn-left': return '←';
    case 'turn-right': return '→';
    case 'straight': return '↑';
    case 'uturn': return '↺';
    case 'roundabout': return '↻';
    case 'exit-roundabout': return '↗';
    case 'merge': return '⤵';
    case 'arrive': return '◉';
    case 'depart': return '⊙';
    case 'keep-left': return '↰';
    case 'keep-right': return '↱';
    default: return '↑';
  }
}

function getTrafficColor(status: TrafficSegment['status']): string {
  switch (status) {
    case 'normal': return '#22c55e';
    case 'moderate': return '#f59e0b';
    case 'heavy': return '#f97316';
    case 'severe': return '#ef4444';
    default: return '#22c55e';
  }
}

function getTrafficStatusFromRatio(ratio: number): TrafficSegment['status'] {
  if (ratio <= 1.1) return 'normal';
  if (ratio <= 1.3) return 'moderate';
  if (ratio <= 1.6) return 'heavy';
  return 'severe';
}

/**
 * Build traffic segments from a Directions API route's step-level duration data.
 * Google provides `duration` (without traffic) and `duration_in_traffic` (with traffic)
 * at the step level. We compare them to determine traffic status per step.
 */
function buildTrafficSegmentsFromSteps(
  steps: NavStep[],
  googleSteps: any[]
): TrafficSegment[] {
  if (steps.length === 0 || googleSteps.length === 0) return [];

  const segments: TrafficSegment[] = [];
  let currentStatus: TrafficSegment['status'] = 'normal';
  let segStart = 0;

  for (let i = 0; i < steps.length; i++) {
    const gStep = googleSteps[i];
    const normalDuration = gStep?.duration?.value ?? steps[i].duration;
    const trafficDuration = gStep?.duration_in_traffic?.value ?? normalDuration;
    const ratio = normalDuration > 0 ? trafficDuration / normalDuration : 1;
    const status = getTrafficStatusFromRatio(ratio);

    if (status !== currentStatus) {
      if (i > segStart) {
        segments.push({
          startIdx: segStart,
          endIdx: i - 1,
          status: currentStatus,
          color: getTrafficColor(currentStatus),
          delay: 0,
        });
      }
      currentStatus = status;
      segStart = i;
    }
  }

  // Final segment
  segments.push({
    startIdx: segStart,
    endIdx: steps.length - 1,
    status: currentStatus,
    color: getTrafficColor(currentStatus),
    delay: 0,
  });

  return segments;
}

// ─── Navigation Engine Hook ──────────────────────────────────────────────────

export function useNavigationEngine() {
  const [state, setState] = useState<NavigationState>({
    isNavigating: false,
    isRoutePrepared: false,
    isOffRoute: false,
    isRecalculating: false,
    isArrived: false,
    navigationError: null,
    routingErrorCode: null,
    routingDiagnostics: null,
    currentRoute: null,
    alternativeRoutes: [],
    selectedRouteIndex: 0,
    currentStepIndex: 0,
    steps: [],
    trafficSegments: [],
    distanceRemaining: 0,
    durationRemaining: 0,
    eta: null,
    currentSpeed: 0,
    speedLimit: null,
    distanceToRoute: 0,
    isVoiceEnabled: true,
    showTraffic: true,
    showAlternatives: false,
    cameraMode: 'overview',
    currentHeading: null,
    directionsResult: null,
    currentLocation: null,
    travelMode: 'DRIVING',
  });

  const gpsHistoryRef = useRef<GPSPoint[]>([]);
  const kalmanStateRef = useRef({ q: KALMAN_Q, r: KALMAN_R, x: 0, p: 1 });
  const watchIdRef = useRef<number | null>(null);
  const rerouteTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastRerouteTimeRef = useRef<number>(0);
  const offRouteConfirmTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestDistanceToRouteRef = useRef<number>(0);
  const routingPromiseKeyRef = useRef<{ key: string; promise: Promise<FetchRoutesResult> } | null>(null);
  const routingAbortRef = useRef<AbortController | null>(null);
  const currentLocationRef = useRef<LatLng | null>(null);
  const destinationRef = useRef<LatLng | null>(null);
  const destinationNameRef = useRef<string | null>(null);
  const currentRouteRef = useRef<NavRoute | null>(null);
  const lastStepAnnouncementRef = useRef<number>(-1);
  const rawDirectionsResultRef = useRef<any | null>(null);

  // ─── GPS Smoothing ───────────────────────────────────────────────────────

  const kalmanFilter = useCallback((measurement: number): number => {
    const s = kalmanStateRef.current;
    s.p += s.q;
    const k = s.p / (s.p + s.r);
    s.x += k * (measurement - s.x);
    s.p *= 1 - k;
    return s.x;
  }, []);

  const smoothGPS = useCallback((point: GPSPoint): GPSPoint => {
    const history = gpsHistoryRef.current;
    if (history.length === 0) {
      history.push(point);
      return point;
    }

    const last = history[history.length - 1];
    const dist = haversineDistance(last, point);
    const timeDiff = (point.timestamp - last.timestamp) / 1000;

    // Reject implausible jumps (> 50 m/s ≈ 180 km/h between consecutive readings)
    if (timeDiff > 0 && dist / timeDiff > 50) {
      return last;
    }

    const smoothedLat = last.lat + (point.lat - last.lat) * GPS_SMOOTHING_FACTOR;
    const smoothedLng = last.lng + (point.lng - last.lng) * GPS_SMOOTHING_FACTOR;

    const smoothed: GPSPoint = {
      lat: smoothedLat,
      lng: smoothedLng,
      heading: point.heading,
      speed: point.speed,
      accuracy: point.accuracy,
      timestamp: point.timestamp,
    };

    history.push(smoothed);
    if (history.length > 50) history.shift();

    return smoothed;
  }, []);

  // ─── Route Fetching ──────────────────────────────────────────────────────

  /**
   * Validate a parsed route before it is shown. The geometry always comes from
   * the routing API (never synthesized), so we only reject geometry that is
   * missing, degenerate, or contains invalid coordinates.
   */
  const isValidRoute = useCallback((route: NavRoute): boolean => {
    if (!route) return false;
    const path = route.decodedPath;
    if (!Array.isArray(path) || path.length < 2) return false;

    for (const p of path) {
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
      if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return false;
    }

    return true;
  }, []);

  const parseDirectionsResult = useCallback((result: any): NavRoute[] => {
    if (!result || !Array.isArray(result.routes)) {
      console.error('[NAV] Routes response has no routes array:', result);
      return [];
    }

    return result.routes.map((route: any) => {
      const legs: NavLeg[] = (route.legs ?? []).map((leg: any) => ({
        distance: leg.distanceMeters || 0,
        duration: (leg.durationMillis ?? leg.staticDurationMillis ?? 0) / 1000,
        startAddress: '',
        endAddress: '',
        steps: (leg.steps ?? []).map((step: any) => {
          // Routes library steps expose a decoded path (LatLngAltitude[]).
          const stepPath = (Array.isArray(step.path) ? step.path : [])
            .map((p: any) => {
              const lat = latLngValue(p, 'lat');
              const lng = latLngValue(p, 'lng');
              return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
            })
            .filter(Boolean) as LatLng[];
          // Routes library locations are DirectionalLocation (.lat()/.lng() methods).
          const startLat = latLngValue(step.startLocation, 'lat');
          const startLng = latLngValue(step.startLocation, 'lng');
          const endLat = latLngValue(step.endLocation, 'lat');
          const endLng = latLngValue(step.endLocation, 'lng');
          const bearing = stepPath.length >= 2
            ? calculateBearing(stepPath[0], stepPath[stepPath.length - 1])
            : calculateBearing({ lat: startLat, lng: startLng }, { lat: endLat, lng: endLng });

          return {
            instruction: step.instructions || '',
            maneuver: getManeuverType(step.maneuver),
            distance: step.distanceMeters || 0,
            duration: (step.staticDurationMillis ?? 0) / 1000,
            roadName: extractRoadName(step.instructions || ''),
            startLat,
            startLng,
            endLat,
            endLng,
            bearing,
            path: stepPath,
          };
        }),
      }));

      // The Routes library omits `maneuver` on some steps — infer turns from bearing deltas.
      const allStepsRaw = legs.flatMap((l) => l.steps);
      const allSteps: NavStep[] = allStepsRaw.map((step, i) => {
        const prev = allStepsRaw[i - 1];
        const maneuver = step.maneuver !== 'straight' && step.maneuver
          ? step.maneuver
          : i > 0 && prev
          ? getManeuverFromBearingDelta(prev.bearing, step.bearing)
          : step.maneuver;
        return { ...step, maneuver };
      });
      // Routes library exposes the decoded route path (LatLngAltitude[]) — real road geometry.
      const decoded = extractOverviewCoordinates(route);
      console.log(`[NAV] Route geometry decoded: ${decoded.length} road coordinates`);

      const totalDistance = route.distanceMeters ?? legs.reduce((sum, l) => sum + l.distance, 0);
      const totalDuration = (route.staticDurationMillis ?? 0) / 1000 || legs.reduce((sum, l) => sum + l.duration, 0);

      // trafficDuration: durationMillis is traffic-aware (TRAFFIC_AWARE); staticDurationMillis is not.
      const trafficDuration = (route.durationMillis ?? route.staticDurationMillis ?? 0) / 1000;

      const allLats = decoded.map((p) => p.lat);
      const allLngs = decoded.map((p) => p.lng);

      return {
        legs,
        totalDistance,
        totalDuration,
        trafficDuration,
        summary: route.summary || '',
        polyline: '',
        steps: allSteps,
        decodedPath: decoded,
        bounds: decoded.length > 0
          ? {
              northeast: { lat: Math.max(...allLats), lng: Math.max(...allLngs) },
              southwest: { lat: Math.min(...allLats), lng: Math.min(...allLngs) },
            }
          : { northeast: { lat: 0, lng: 0 }, southwest: { lat: 0, lng: 0 } },
      };
    });
  }, []);

  const fetchRoutes = useCallback(async (
    origin: LatLng,
    destination: LatLng,
    alternatives: boolean = true,
    travelMode: 'DRIVING' | 'WALKING' = 'DRIVING'
  ): Promise<FetchRoutesResult> => {
    const o = toValidLatLng(origin);
    const d = toValidLatLng(destination);
    if (!o || !d) {
      return { routes: [], rawResult: null, error: 'Invalid coordinates.', errorCode: 'INVALID_ORIGIN', diagnostics: null };
    }

    const requestKey = `${getRouteCacheKey(o, d, travelMode)}|${alternatives ? 'alt' : 'single'}`;

    if (!alternatives) {
      const cached = getCachedRoutes(o, d, travelMode);
      if (cached && cached.length > 0 && rawDirectionsResultRef.current) {
        return { routes: [cached[0]], rawResult: rawDirectionsResultRef.current, error: null, errorCode: null, diagnostics: null };
      }
    }
    const cachedAll = getCachedRoutes(o, d, travelMode);
    if (cachedAll && cachedAll.length > 0 && rawDirectionsResultRef.current) {
      return { routes: alternatives ? cachedAll : [cachedAll[0]], rawResult: rawDirectionsResultRef.current, error: null, errorCode: null, diagnostics: null };
    }

    if (routingPromiseKeyRef.current?.key === requestKey) {
      return routingPromiseKeyRef.current.promise;
    }

    routingAbortRef.current?.abort();
    const controller = new AbortController();
    routingAbortRef.current = controller;

    const promise = (async (): Promise<FetchRoutesResult> => {
      try {
        const { response, diagnostics } = await requestRouteData(o, d, { alternatives, signal: controller.signal });
        rawDirectionsResultRef.current = response;
        const parsedRoutes = parseDirectionsResult(response).filter((route) => isValidRoute(route));
        if (parsedRoutes.length > 0) {
          setRouteCache(o, d, parsedRoutes, travelMode);
          return { routes: parsedRoutes, rawResult: response, error: null, errorCode: null, diagnostics };
        }
        return { routes: [], rawResult: null, error: 'Invalid route geometry.', errorCode: 'ROUTE_GEOMETRY_INVALID', diagnostics };
      } catch (err: any) {
        if (err instanceof RoutingError) {
          return { routes: [], rawResult: null, error: err.message, errorCode: err.code, diagnostics: err.diagnostics ?? null };
        }
        return { routes: [], rawResult: null, error: 'Network error while contacting the routing API.', errorCode: 'NETWORK_ERROR', diagnostics: null };
      } finally {
        if (routingPromiseKeyRef.current?.promise === promise) routingPromiseKeyRef.current = null;
        if (routingAbortRef.current === controller) routingAbortRef.current = null;
      }
    })();

    routingPromiseKeyRef.current = { key: requestKey, promise };
    return promise;
  }, [parseDirectionsResult, isValidRoute]);

  // ─── Voice ───────────────────────────────────────────────────────────────

  const speak = useCallback((text: string) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  // ─── Navigation Lifecycle ────────────────────────────────────────────────

  /**
   * Phase 1 — fetch a driving route, decode its geometry, and draw the wayline.
   * Live navigation does NOT start; the user then taps "Start Navigation".
   */
  const prepareRoute = useCallback(async (
    origin: LatLng,
    dest: LatLng,
    parkingName?: string
  ): Promise<boolean> => {
    console.log('[NAV] prepareRoute called.');
    console.log('[NAV] Selected parking:', parkingName ?? '(unnamed)');
    console.log('[NAV] Origin:', origin);
    console.log('[NAV] Destination:', dest);

    setState((s) => ({ ...s, isRecalculating: true, navigationError: null }));
    destinationRef.current = dest;
    destinationNameRef.current = parkingName ?? null;
    currentLocationRef.current = origin;

    const { routes, rawResult, error, errorCode, diagnostics } = await fetchRoutes(origin, dest, true);
    if (routes.length === 0) {
      console.error('[NAV] prepareRoute failed:', error);
      setState((s) => ({
        ...s,
        isRecalculating: false,
        isRoutePrepared: false,
        navigationError: error ?? 'No route found.',
        routingErrorCode: errorCode,
        routingDiagnostics: diagnostics,
      }));
      return false;
    }

    const selectedRoute = routes[0];
    const alternatives = routes.slice(1);
    lastStepAnnouncementRef.current = -1;
    currentRouteRef.current = selectedRoute;

    // Build traffic segments from step-level traffic data
    const trafficSegments: TrafficSegment[] = [{
      startIdx: 0,
      endIdx: selectedRoute.steps.length - 1,
      status: 'normal',
      color: '#22c55e',
      delay: 0,
    }];

    console.log('[NAV] Route ready:', {
      distanceMeters: selectedRoute.totalDistance,
      durationSeconds: selectedRoute.totalDuration,
      eta: new Date(Date.now() + selectedRoute.totalDuration * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      coordinatesCount: selectedRoute.decodedPath.length,
      summary: selectedRoute.summary,
    });

    setState((s) => ({
      ...s,
      isRoutePrepared: true,
      isNavigating: false,
      isOffRoute: false,
      isRecalculating: false,
      isArrived: false,
      navigationError: null,
      routingErrorCode: null,
      routingDiagnostics: diagnostics ?? s.routingDiagnostics,
      currentRoute: selectedRoute,
      alternativeRoutes: alternatives,
      selectedRouteIndex: 0,
      currentStepIndex: 0,
      steps: selectedRoute.steps,
      trafficSegments,
      distanceRemaining: selectedRoute.totalDistance,
      durationRemaining: selectedRoute.totalDuration,
      eta: new Date(Date.now() + selectedRoute.totalDuration * 1000),
      cameraMode: 'overview',
      directionsResult: rawResult,
      currentLocation: origin,
    }));

    return true;
  }, [fetchRoutes]);

  /**
   * Phase 2 — begin live navigation for the already-prepared route.
   * Starts the GPS watch, turn-by-turn updates, and ETA tracking.
   */
  const beginNavigation = useCallback(() => {
    console.log('[NAV] beginNavigation called.');
    setState((s) => {
      if (!s.isRoutePrepared || s.isNavigating || !s.currentRoute) return s;
      return {
        ...s,
        isNavigating: true,
        isOffRoute: false,
        isArrived: false,
        cameraMode: 'overview',
      };
    });

    const route = currentRouteRef.current;
    const name = destinationNameRef.current;
    if (route?.steps?.[0]) {
      speak(name ? `Navigation started to ${name}. ${route.steps[0].instruction}` : route.steps[0].instruction);
    }
  }, [speak]);

  const stopNavigation = useCallback(() => {
    routingAbortRef.current?.abort();
    routingAbortRef.current = null;
    routingPromiseKeyRef.current = null;

    if (offRouteConfirmTimerRef.current) {
      clearTimeout(offRouteConfirmTimerRef.current);
      offRouteConfirmTimerRef.current = null;
    }
    if (rerouteTimerRef.current) {
      clearTimeout(rerouteTimerRef.current);
      rerouteTimerRef.current = null;
    }
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    window.speechSynthesis.cancel();
    destinationRef.current = null;
    destinationNameRef.current = null;
    currentLocationRef.current = null;
    currentRouteRef.current = null;
    lastStepAnnouncementRef.current = -1;
    rawDirectionsResultRef.current = null;

    setState({
      isNavigating: false,
      isRoutePrepared: false,
      isOffRoute: false,
      isRecalculating: false,
      isArrived: false,
      navigationError: null,
      routingErrorCode: null,
      routingDiagnostics: null,
      currentRoute: null,
      alternativeRoutes: [],
      selectedRouteIndex: 0,
      currentStepIndex: 0,
      steps: [],
      trafficSegments: [],
      distanceRemaining: 0,
      durationRemaining: 0,
      eta: null,
      currentSpeed: 0,
      speedLimit: null,
      distanceToRoute: 0,
      isVoiceEnabled: true,
      showTraffic: true,
      showAlternatives: false,
      cameraMode: 'overview',
      currentHeading: null,
      directionsResult: null,
      currentLocation: null,
      travelMode: 'DRIVING',
    });
  }, []);

  const selectRoute = useCallback((index: number) => {
    setState((s) => {
      const allRoutes = [s.currentRoute, ...s.alternativeRoutes];
      const route = allRoutes[index];
      if (!route) return s;
      lastStepAnnouncementRef.current = -1;
      currentRouteRef.current = route;
      return {
        ...s,
        selectedRouteIndex: index,
        currentRoute: route,
        steps: route.steps,
        trafficSegments: [{
          startIdx: 0,
          endIdx: route.steps.length - 1,
          status: 'normal' as const,
          color: '#22c55e',
          delay: 0,
        }],
        distanceRemaining: route.totalDistance,
        durationRemaining: route.totalDuration,
        eta: new Date(Date.now() + route.totalDuration * 1000),
        currentStepIndex: 0,
      };
    });
  }, []);

  // ─── Rerouting ───────────────────────────────────────────────────────────

  const reroute = useCallback(async (currentPos: LatLng, dest: LatLng) => {
    const now = Date.now();
    if (now - lastRerouteTimeRef.current < REROUTE_COOLDOWN_MS) return;
    lastRerouteTimeRef.current = now;

    setState((s) => ({ ...s, isRecalculating: true }));

    routeCache.delete(getRouteCacheKey(currentPos, dest, state.travelMode));

    const { routes, rawResult, error, errorCode } = await fetchRoutes(currentPos, dest, false, state.travelMode);
    if (routes.length === 0) {
      setState((s) => ({ ...s, isRecalculating: false, routingError: error, routingErrorCode: errorCode }));
      return;
    }

    const selectedRoute = routes[0];
    lastStepAnnouncementRef.current = -1;
    currentRouteRef.current = selectedRoute;

    setState((s) => ({
      ...s,
      isRecalculating: false,
      isOffRoute: false,
      currentRoute: selectedRoute,
      steps: selectedRoute.steps,
      trafficSegments: [{
        startIdx: 0,
        endIdx: selectedRoute.steps.length - 1,
        status: 'normal',
        color: '#22c55e',
        delay: 0,
      }],
      distanceRemaining: selectedRoute.totalDistance,
      durationRemaining: selectedRoute.totalDuration,
      eta: new Date(Date.now() + selectedRoute.totalDuration * 1000),
      currentStepIndex: 0,
      directionsResult: rawResult,
    }));

    speak('Recalculating route');
  }, [fetchRoutes, speak]);

  // ─── Location Update ─────────────────────────────────────────────────────

  const updateLocation = useCallback((point: GPSPoint) => {
    const smoothed = smoothGPS(point);
    currentLocationRef.current = { lat: smoothed.lat, lng: smoothed.lng };

    // Compute heading from GPS or from last two positions
    let heading = smoothed.heading;
    if (heading === null && gpsHistoryRef.current.length >= 2) {
      const prev = gpsHistoryRef.current[gpsHistoryRef.current.length - 2];
      heading = calculateBearing(prev, smoothed);
    }

    setState((s) => {
      if (!s.isNavigating || !s.currentRoute) return s;

      const userPos = { lat: smoothed.lat, lng: smoothed.lng };
      const route = s.currentRoute;

      const nearest = findNearestPointOnRoute(userPos, route.decodedPath);
      latestDistanceToRouteRef.current = nearest.distance;
      const isOffRoute = nearest.distance > REROUTE_TRIGGER_THRESHOLD_METERS;

      // Advance step index: find the step whose end is closest to us and behind us
      let newStepIndex = s.currentStepIndex;
      for (let i = s.steps.length - 1; i >= 0; i--) {
        const step = s.steps[i];
        const distToStepEnd = haversineDistance(userPos, { lat: step.endLat, lng: step.endLng });
        if (distToStepEnd < STEP_ADVANCE_THRESHOLD_METERS) {
          newStepIndex = Math.min(i + 1, s.steps.length - 1);
          break;
        }
      }

      // Recompute remaining distance and duration from current step
      const remainingSteps = s.steps.slice(newStepIndex);
      const distanceRemaining = remainingSteps.reduce((sum, step) => sum + step.distance, 0);
      const durationRemaining = remainingSteps.reduce((sum, step) => sum + step.duration, 0);
      const eta = new Date(Date.now() + durationRemaining * 1000);

      // Arrival detection
      const isArrived = distanceRemaining < ARRIVAL_THRESHOLD_METERS;

      // Announce next step
      if (newStepIndex !== s.currentStepIndex && newStepIndex !== lastStepAnnouncementRef.current) {
        lastStepAnnouncementRef.current = newStepIndex;
        const nextStep = s.steps[newStepIndex];
        if (nextStep) {
          speak(nextStep.instruction);
        }
      }

      return {
        ...s,
        currentLocation: userPos,
        currentStepIndex: newStepIndex,
        distanceRemaining,
        durationRemaining,
        eta,
        currentSpeed: smoothed.speed || 0,
        currentHeading: heading,
        distanceToRoute: nearest.distance,
        isOffRoute,
        isArrived,
        cameraMode: isArrived ? 'destination' : s.cameraMode === 'overview' ? 'overview' : 'following',
      };
    });
  }, [smoothGPS, speak]);

  // ─── GPS Watch ───────────────────────────────────────────────────────────

  const startGPSWatch = useCallback(() => {
    if (!navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const point: GPSPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };
        updateLocation(point);
      },
      (error) => {
        console.error('[NavigationEngine] GPS error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    );
  }, [updateLocation]);

  useEffect(() => {
    if (state.isNavigating) {
      startGPSWatch();
    }
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [state.isNavigating, startGPSWatch]);

  // ─── Off-route debounce + hysteresis ────────────────────────────────────────
  useEffect(() => {
    const dist = latestDistanceToRouteRef.current;

    if (dist <= REROUTE_CLEAR_THRESHOLD_METERS) {
      if (offRouteConfirmTimerRef.current) {
        clearTimeout(offRouteConfirmTimerRef.current);
        offRouteConfirmTimerRef.current = null;
      }
      return;
    }

    if (dist > REROUTE_TRIGGER_THRESHOLD_METERS && !offRouteConfirmTimerRef.current) {
      offRouteConfirmTimerRef.current = setTimeout(() => {
        offRouteConfirmTimerRef.current = null;
        if (latestDistanceToRouteRef.current > REROUTE_TRIGGER_THRESHOLD_METERS) {
          if (state.currentRoute && currentLocationRef.current) {
            const lastStep = state.currentRoute.steps[state.currentRoute.steps.length - 1];
            if (lastStep) reroute(currentLocationRef.current, { lat: lastStep.endLat, lng: lastStep.endLng });
          }
        }
      }, REROUTE_CONFIRM_DELAY_MS);
    }

    return () => {
      if (offRouteConfirmTimerRef.current) {
        clearTimeout(offRouteConfirmTimerRef.current);
        offRouteConfirmTimerRef.current = null;
      }
    };
  }, [state.currentRoute, reroute]);

  // ─── Controls ────────────────────────────────────────────────────────────

  const toggleVoice = useCallback(() => {
    setState((s) => ({ ...s, isVoiceEnabled: !s.isVoiceEnabled }));
    if (state.isVoiceEnabled) {
      window.speechSynthesis.cancel();
    }
  }, [state.isVoiceEnabled]);

  const toggleTraffic = useCallback(() => {
    setState((s) => ({ ...s, showTraffic: !s.showTraffic }));
  }, []);

  const toggleAlternatives = useCallback(() => {
    setState((s) => ({ ...s, showAlternatives: !s.showAlternatives }));
  }, []);

  const setCameraMode = useCallback((mode: NavigationState['cameraMode']) => {
    setState((s) => ({ ...s, cameraMode: mode }));
  }, []);

  const recalculate = useCallback(async () => {
    if (!currentLocationRef.current || !destinationRef.current) return;
    if (state.isNavigating) {
      await reroute(currentLocationRef.current, destinationRef.current);
    } else {
      // Preview retry: refetch with the latest GPS fix and redraw the wayline.
      routeCache.delete(getRouteCacheKey(currentLocationRef.current, destinationRef.current, state.travelMode));
      await prepareRoute(currentLocationRef.current, destinationRef.current, destinationNameRef.current ?? undefined);
    }
  }, [state.isNavigating, reroute, prepareRoute]);

  return {
    ...state,
    prepareRoute,
    beginNavigation,
    stopNavigation,
    selectRoute,
    startGPSWatch,
    toggleVoice,
    toggleTraffic,
    toggleAlternatives,
    setCameraMode,
    recalculate,
    getManeuverIcon,
    getTrafficColor,
    currentLocation: state.currentLocation ?? currentLocationRef.current,
  };
}

// ─── Utility: extract road name from HTML instruction ────────────────────────

function extractRoadName(instruction: string): string {
  // Google wraps road names in <b> tags
  const bMatch = instruction.match(/<b>([^<]+)<\/b>/);
  if (bMatch) return bMatch[1];

  // Try extracting from "on {road}" or "onto {road}" patterns
  const onMatch = instruction.match(/\b(?:on|onto|to)\s+(.+?)(?:\s+for|\s*$)/i);
  if (onMatch) return onMatch[1].trim();

  return 'Continue';
}
