import { getApiKey } from './googlePlacesService';

// ─── Error Codes ─────────────────────────────────────────────────────────────

export type RoutingErrorCode =
  | 'GOOGLE_KEY_MISSING'
  | 'GOOGLE_API_NOT_ENABLED'
  | 'GOOGLE_API_RESTRICTED'
  | 'GOOGLE_REFERRER_BLOCKED'
  | 'GOOGLE_BILLING_ERROR'
  | 'ROUTING_QUOTA_EXCEEDED'
  | 'INVALID_ORIGIN'
  | 'INVALID_DESTINATION'
  | 'NO_ROUTE_FOUND'
  | 'ROUTE_GEOMETRY_INVALID'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ROUTING_ERROR';

export class RoutingError extends Error {
  constructor(
    public readonly code: RoutingErrorCode,
    message: string,
    public readonly googleStatus?: string,
    public readonly googleMessage?: string
  ) {
    super(message);
    this.name = 'RoutingError';
  }

  /** Step-by-step diagnostics snapshot from the failed request (dev panel). */
  diagnostics: RoutingDiagnostics | null = null;
}

export function isRoutingError(err: unknown): err is RoutingError {
  return err instanceof RoutingError;
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export interface RoutingDiagnostics {
  mapsJsLoaded: boolean;
  routesLibraryLoaded: boolean;
  keyPresent: boolean;
  keyLength: number;
  originValid: boolean;
  destinationValid: boolean;
  /** 'OK' on success, otherwise Google's status string (REQUEST_DENIED, ZERO_RESULTS, ...). */
  status: string | null;
  geometryPresent: boolean;
  routesReceived: number | null;
  keyAcceptedByService: boolean;
  googleMessage?: string;
}

// ─── Public Result Types ─────────────────────────────────────────────────────

export interface RoutingStepData {
  instruction: string;
  maneuver: string;
  distanceMeters: number;
  durationSeconds: number;
  roadName: string;
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  path: { lat: number; lng: number }[];
}

export interface DrivingRouteResult {
  coordinates: { lat: number; lng: number }[];
  distanceMeters: number;
  durationSeconds: number;
  steps: RoutingStepData[];
  polyline: string;
  bounds: { northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } };
  /** Normalized DirectionsResult-like payload consumed by the nav engine and map renderers. */
  rawRoute: { routes: any[] };
}

export interface RouteRequestOptions {
  travelMode?: 'DRIVING' | 'WALKING';
  alternatives?: boolean;
  signal?: AbortSignal;
}

export interface RouteSummaryData {
  durationText: string;
  distanceText: string;
  durationMinutes: number;
  distanceKm: number;
}

// ─── Internal State ──────────────────────────────────────────────────────────

const TIMEOUT_MS = 25000;

let routesLibraryPromise: Promise<any> | null = null;

// ─── Plain-Coordinate Helpers ────────────────────────────────────────────────

/**
 * Read `lat`/`lng` from a value that may be a plain object ({lat, lng}),
 * a Google Maps LatLng-like object (`.lat()`/`.lng()` methods), or a
 * Directions/Places location wrapper ({latLng: ...}). Returns NaN when absent.
 */
export function latLngValue(value: any, key: 'lat' | 'lng'): number {
  if (!value) return NaN;
  if (typeof value[key] === 'function') {
    const v = value[key]();
    return Number.isFinite(v) ? v : NaN;
  }
  const v = Number(value[key]);
  return Number.isFinite(v) ? v : NaN;
}

function toPlainPoint(value: any): { lat: number; lng: number } | null {
  if (!value) return null;
  if (value.latLng) value = value.latLng;
  const lat = latLngValue(value, 'lat');
  const lng = latLngValue(value, 'lng');
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function extractPath(value: any): { lat: number; lng: number }[] {
  if (!Array.isArray(value)) return [];
  return value.map(toPlainPoint).filter(Boolean) as { lat: number; lng: number }[];
}

/**
 * Extract the decoded road-following coordinates from a route object.
 * The Routes library exposes them as `route.path` (LatLngAltitude[] with
 * `.lat()`/`.lng()` methods); we also accept a plain `overview_path` array
 * so the same helper works for any normalized payload.
 */
export function extractOverviewCoordinates(route: any): { lat: number; lng: number }[] {
  if (!route) return [];
  const raw = Array.isArray(route.overview_path) ? route.overview_path : route.path;
  return extractPath(raw);
}

function computeBounds(coordinates: { lat: number; lng: number }[]) {
  if (coordinates.length === 0) {
    return {
      northeast: { lat: 0, lng: 0 },
      southwest: { lat: 0, lng: 0 },
    };
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const c of coordinates) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
  }
  return {
    northeast: { lat: maxLat, lng: maxLng },
    southwest: { lat: minLat, lng: minLng },
  };
}

function formatDistanceText(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDurationText(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} mins`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} hour${h > 1 ? 's' : ''} ${m} min` : `${h} hour${h > 1 ? 's' : ''}`;
}

// ─── Error Classification ────────────────────────────────────────────────────

function classifyRoutingError(statusRaw: string, messageRaw: string): RoutingError {
  const status = (statusRaw || '').toUpperCase();
  const msg = (messageRaw || '').toLowerCase();

  if (status === 'ZERO_RESULTS') {
    return new RoutingError(
      'NO_ROUTE_FOUND',
      'No driving route exists between these locations. Try picking a destination closer to a road.',
      statusRaw,
      messageRaw || undefined
    );
  }
  if (status === 'NOT_FOUND') {
    return new RoutingError(
      'NO_ROUTE_FOUND',
      'The origin or destination could not be mapped to the road network.',
      statusRaw,
      messageRaw || undefined
    );
  }
  if (status === 'OVER_QUERY_LIMIT' || status === 'RESOURCE_EXHAUSTED') {
    return new RoutingError(
      'ROUTING_QUOTA_EXCEEDED',
      'Google routes.googleapis.com daily quota exhausted: the API key was accepted, but the ComputeRoutes per-request quota for this project is used up. Retry the same request after the quota resets (or raise the quota / enable billing in the Google Cloud Console).',
      statusRaw,
      messageRaw || undefined
    );
  }
  if (status === 'REQUEST_DENIED') {
    if (msg.includes('billing')) {
      return new RoutingError(
        'GOOGLE_BILLING_ERROR',
        'Billing is not enabled for the Google Cloud project using this API key. Enable billing and the Routes API in the Google Cloud Console.',
        statusRaw,
        messageRaw || undefined
      );
    }
    if (msg.includes('referer') || msg.includes('referrer') || msg.includes('website not allowed') || msg.includes('application restriction')) {
      return new RoutingError(
        'GOOGLE_REFERRER_BLOCKED',
        'This website is blocked by the API key referrer restriction in the Google Cloud Console. Allow this origin (dev server or production domain) under API & Services → API keys.',
        statusRaw,
        messageRaw || undefined
      );
    }
    if (msg.includes('not authorized to use this api') || msg.includes('has not been used') || msg.includes('not enabled') || msg.includes('api not found')) {
      return new RoutingError(
        'GOOGLE_API_NOT_ENABLED',
        'The Routes API is not enabled for the Google Cloud project behind this API key. Enable "Routes API" in the Google Cloud Console.',
        statusRaw,
        messageRaw || undefined
      );
    }
    if (msg.includes('key') && (msg.includes('invalid') || msg.includes('not valid'))) {
      return new RoutingError(
        'GOOGLE_API_RESTRICTED',
        'The Google Maps API key is invalid. Check the VITE_GOOGLE_MAPS_PLATFORM_KEY value.',
        statusRaw,
        messageRaw || undefined
      );
    }
    return new RoutingError(
      'GOOGLE_API_RESTRICTED',
      `Google rejected the routing request (REQUEST_DENIED). Google's message: ${messageRaw || 'see the Google Cloud Console'}`,
      statusRaw,
      messageRaw || undefined
    );
  }
  if (status === 'INVALID_REQUEST' || status === 'INVALID_ARGUMENT') {
    if (msg.includes('origin')) {
      return new RoutingError('INVALID_ORIGIN', 'The origin location is invalid for routing.', statusRaw, messageRaw || undefined);
    }
    if (msg.includes('destination')) {
      return new RoutingError('INVALID_DESTINATION', 'The destination location is invalid for routing.', statusRaw, messageRaw || undefined);
    }
    return new RoutingError(
      'UNKNOWN_ROUTING_ERROR',
      `The routing request was rejected as invalid (${statusRaw}).`,
      statusRaw,
      messageRaw || undefined
    );
  }
  if (status === 'NETWORK_ERROR' || status === 'TIMEOUT' || status === 'UNAVAILABLE') {
    return new RoutingError(
      'NETWORK_ERROR',
      'The Google routing service could not be reached. Check your network connection.',
      statusRaw,
      messageRaw || undefined
    );
  }
  if (!status && !msg) {
    return new RoutingError('NETWORK_ERROR', 'The routing request failed with no provider response. Check your network connection.');
  }
  return new RoutingError(
    'UNKNOWN_ROUTING_ERROR',
    `Routing failed with status ${statusRaw || 'UNKNOWN'}. ${messageRaw || ''}`.trim(),
    statusRaw,
    messageRaw || undefined
  );
}

// ─── Routes Library Loading ──────────────────────────────────────────────────

async function loadRoutesLibrary(): Promise<any> {
  if (typeof window === 'undefined' || !window.google?.maps?.importLibrary) {
    throw new RoutingError(
      'UNKNOWN_ROUTING_ERROR',
      'The Google Maps JavaScript API is not loaded yet. The map must render before routing can be used.',
      'NOT_LOADED'
    );
  }
  if (!routesLibraryPromise) {
    routesLibraryPromise = window.google.maps
      .importLibrary('routes')
      .catch((err: any) => {
        routesLibraryPromise = null;
        throw err;
      });
  }
  return routesLibraryPromise;
}

async function executeRouteRequest(RouteClass: any, request: any, signal?: AbortSignal): Promise<any[]> {
  if (signal?.aborted) {
    throw new RoutingError('UNKNOWN_ROUTING_ERROR', 'Routing request aborted.');
  }

  const run = async (): Promise<any[]> => {
    if (typeof RouteClass.computeRoutes === 'function') {
      const result = await RouteClass.computeRoutes(request);
      return result?.routes ?? [];
    }
    if (typeof RouteClass.prototype?.route === 'function') {
      const client = new RouteClass();
      const result = await client.route(request);
      return result?.routes ?? [];
    }
    throw new RoutingError(
      'UNKNOWN_ROUTING_ERROR',
      'The Routes library loaded but does not expose a supported route method.',
      'NOT_LOADED'
    );
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new RoutingError(
            'NETWORK_ERROR',
            'The Google routing request timed out. Check your network connection and Google Cloud configuration.'
          )
        ),
      TIMEOUT_MS
    );
  });
  const abort = new Promise<never>((_, reject) => {
    const onAbort = () => reject(new RoutingError('UNKNOWN_ROUTING_ERROR', 'Routing request aborted.'));
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });

  try {
    return await Promise.race([run(), timeout, abort]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ─── Response Normalization ──────────────────────────────────────────────────

/**
 * Convert Routes library routes into a DirectionsResult-like payload that the
 * nav engine and map renderers can consume. Field names used by this app
 * (distanceMeters, durationMillis, staticDurationMillis, step.path,
 * startLocation/endLocation, instructions, maneuver) are preserved verbatim;
 * all locations are normalized to plain {lat, lng} objects so the payload is
 * safe to store in React state.
 */
function normalizeToDirectionsShape(routes: any[]): { routes: any[] } {
  return {
    routes: routes.map((r: any) => {
      const googleLegs: any[] = Array.isArray(r?.legs) && r.legs.length > 0 ? r.legs : [null];
      const legs = googleLegs.map((leg: any) => ({
        distanceMeters: leg?.distanceMeters ?? r?.distanceMeters ?? 0,
        durationMillis: leg?.durationMillis ?? leg?.staticDurationMillis ?? r?.staticDurationMillis ?? 0,
        staticDurationMillis: leg?.staticDurationMillis ?? r?.staticDurationMillis ?? leg?.durationMillis ?? 0,
        startLocation: toPlainPoint(leg?.startLocation) ?? toPlainPoint(r?.legs?.[0]?.startLocation) ?? null,
        endLocation: toPlainPoint(leg?.endLocation) ?? toPlainPoint(r?.legs?.[0]?.endLocation) ?? null,
        steps: (leg?.steps ?? []).map((s: any) => ({
          instructions: s?.instructions ?? '',
          maneuver: s?.maneuver ?? '',
          distanceMeters: s?.distanceMeters ?? 0,
          staticDurationMillis: s?.staticDurationMillis ?? 0,
          startLocation: toPlainPoint(s?.startLocation) ?? { lat: 0, lng: 0 },
          endLocation: toPlainPoint(s?.endLocation) ?? { lat: 0, lng: 0 },
          path: extractPath(s?.path),
        })),
      }));

      const coords = extractPath(googleLegs[0]?.path ?? r?.path);
      const distanceMeters = r?.distanceMeters ?? googleLegs[0]?.distanceMeters ?? 0;
      const staticDurationMillis = r?.staticDurationMillis ?? googleLegs[0]?.staticDurationMillis ?? 0;
      const durationMillis = r?.durationMillis ?? staticDurationMillis;

      return {
        legs,
        distanceMeters,
        staticDurationMillis,
        durationMillis,
        summary: r?.description ?? '',
        overview_polyline: { points: '' },
        overview_path: coords,
        bounds: computeBounds(coords),
      };
    }),
  };
}

// ─── Session Quota Monitoring ────────────────────────────────────────────────

const routingSession = {
  provider: 'Google Routes API (Route.computeRoutes)',
  service: 'routes.googleapis.com',
  status: 'idle' as 'idle' | 'ok' | 'error',
  routeRequests: 0,
  routeSuccess: 0,
  routeFailed: 0,
  lastRequestAt: null as number | null,
  lastStatus: null as string | null,
  lastErrorCode: null as RoutingErrorCode | null,
};

export function getRoutingSessionStats(): Readonly<typeof routingSession> {
  return { ...routingSession };
}

// ─── Main Routing API ────────────────────────────────────────────────────────

/**
 * Request a driving (or walking) route from the Google Routes library
 * (Route.computeRoutes) and return a normalized, plain-object payload plus
 * step-by-step diagnostics for the dev panel.
 *
 * Throws a `RoutingError` with a machine-readable `code` on any failure;
 * the error carries a `diagnostics` snapshot of the failed attempt.
 */
export async function requestRouteData(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  options?: RouteRequestOptions
): Promise<{ response: { routes: any[] }; diagnostics: RoutingDiagnostics }> {
  const apiKey = getApiKey();
  routingSession.routeRequests += 1;
  routingSession.lastRequestAt = Date.now();

  const diagnostics: RoutingDiagnostics = {
    mapsJsLoaded: typeof window !== 'undefined' && Boolean(window.google?.maps?.Map),
    routesLibraryLoaded: Boolean(routesLibraryPromise),
    keyPresent: Boolean(apiKey),
    keyLength: apiKey?.length ?? 0,
    originValid: Boolean(toPlainPoint(origin)),
    destinationValid: Boolean(toPlainPoint(destination)),
    status: null,
    geometryPresent: false,
    routesReceived: null,
    keyAcceptedByService: false,
  };

  try {
    const result = await calculateDrivingRoute(origin, destination, options);
    diagnostics.routesLibraryLoaded = true;
    diagnostics.status = 'OK';
    diagnostics.geometryPresent = true;
    diagnostics.routesReceived = result.rawRoute.routes.length;
    diagnostics.keyAcceptedByService = true;
    routingSession.status = 'ok';
    routingSession.routeSuccess += 1;
    routingSession.lastStatus = 'OK';
    return { response: result.rawRoute, diagnostics };
  } catch (err) {
    if (err instanceof RoutingError) {
      diagnostics.status = err.googleStatus ?? 'FAILED';
      diagnostics.googleMessage = err.googleMessage;
      diagnostics.keyAcceptedByService = Boolean(err.googleStatus) && err.code !== 'GOOGLE_KEY_MISSING';
      err.diagnostics = diagnostics;
      routingSession.status = 'error';
      routingSession.routeFailed += 1;
      routingSession.lastStatus = diagnostics.status;
      routingSession.lastErrorCode = err.code;
    }
    throw err;
  }
}

/**
 * Core routing implementation. Requests a driving route via the Google Routes
 * library and returns road-following geometry, durations, steps and bounds.
 */
export async function calculateDrivingRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  options?: RouteRequestOptions
): Promise<DrivingRouteResult> {
  const originValid = toPlainPoint(origin);
  const destinationValid = toPlainPoint(destination);
  if (!originValid) {
    throw new RoutingError('INVALID_ORIGIN', `Origin coordinates are invalid: ${JSON.stringify(origin)}`);
  }
  if (!destinationValid) {
    throw new RoutingError('INVALID_DESTINATION', `Destination coordinates are invalid: ${JSON.stringify(destination)}`);
  }

  console.log('[ROUTING] Provider: Google Routes library (Route.computeRoutes via Maps JavaScript API)');
  console.log('[ROUTING] Maps JavaScript API: loaded');
  console.log('[ROUTING] Origin: valid');

  const apiKey = getApiKey();
  console.log(`[ROUTING] API key: present=${Boolean(apiKey)}`);
  if (!apiKey) {
    throw new RoutingError(
      'GOOGLE_KEY_MISSING',
      'The Google Maps API key is missing from the client environment. Set VITE_GOOGLE_MAPS_PLATFORM_KEY (or GOOGLE_MAPS_PLATFORM_KEY) in .env.local and restart the dev server.'
    );
  }

  const lib = await loadRoutesLibrary();
  const RouteClass = lib?.Route;
  if (!RouteClass) {
    throw new RoutingError('UNKNOWN_ROUTING_ERROR', 'The Routes library loaded but did not expose a Route class.', 'NOT_LOADED');
  }
  console.log('[ROUTING] Routes library: loaded');

  const request: any = {
    origin: { lat: originValid.lat, lng: originValid.lng },
    destination: { lat: destinationValid.lat, lng: destinationValid.lng },
    travelMode: options?.travelMode === 'WALKING' ? 'WALKING' : 'DRIVING',
    routingPreference: 'TRAFFIC_AWARE',
    computeAlternativeRoutes: options?.alternatives ?? true,
    polylineQuality: 'HIGH_QUALITY',
    fields: ['*'],
  };

  console.log('[ROUTING] Routing request started');
  let routes: any[] = [];
  try {
    routes = await executeRouteRequest(RouteClass, request, options?.signal);
  } catch (err: any) {
    const status = String(err?.status ?? err?.code ?? '');
    const message = String(err?.message ?? err?.details ?? '');
    const error = classifyRoutingError(status, message);
    console.error(`[ROUTING] Routing request failed: ${error.code}`, error.googleStatus ?? '', error.googleMessage ?? '');
    throw error;
  }

  const primary = routes[0];
  if (!primary) {
    throw new RoutingError('NO_ROUTE_FOUND', 'The routing provider returned no routes for this origin and destination.', 'ZERO_RESULTS');
  }

  const leg = primary.legs?.[0] ?? null;
  const coordinates = extractPath(leg?.path ?? primary.path);
  if (coordinates.length < 2) {
    throw new RoutingError(
      'ROUTE_GEOMETRY_INVALID',
      'The routing provider returned no usable road geometry for this route. Try a destination closer to a road.'
    );
  }

  const distanceMeters = leg?.distanceMeters ?? primary.distanceMeters ?? 0;
  const durationMillis = leg?.durationMillis ?? primary.durationMillis ?? leg?.staticDurationMillis ?? primary.staticDurationMillis ?? 0;
  const durationSeconds = Math.max(1, Math.round(durationMillis / 1000));

  const steps: RoutingStepData[] = (leg?.steps ?? []).map((s: any) => {
    const instruction = s?.instructions ?? '';
    return {
      instruction,
      maneuver: s?.maneuver ?? '',
      distanceMeters: s?.distanceMeters ?? 0,
      durationSeconds: Math.max(1, Math.round((s?.staticDurationMillis ?? 0) / 1000)),
      roadName: extractRoadName(instruction),
      start: toPlainPoint(s?.startLocation) ?? { lat: 0, lng: 0 },
      end: toPlainPoint(s?.endLocation) ?? { lat: 0, lng: 0 },
      path: extractPath(s?.path),
    };
  });

  console.log('[ROUTING] Routing result:', {
    distanceMeters,
    durationSeconds,
    coordinatesCount: coordinates.length,
    stepsCount: steps.length,
  });

  return {
    coordinates,
    distanceMeters,
    durationSeconds,
    steps,
    polyline: '',
    bounds: computeBounds(coordinates),
    rawRoute: normalizeToDirectionsShape(routes),
  };
}

function extractRoadName(instruction: string): string {
  const match = instruction?.match(/(?:onto|toward|to)\s+([^<>/]+?)\s*(?:\.|$)/i);
  return match?.[1]?.trim() ?? '';
}

/**
 * Quick driving summary (distance + duration) — used by the Distance Matrix
 * estimates and card badges. Returns null when routing fails so callers can
 * fall back to a straight-line estimate.
 */
export async function fetchRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  _mode?: string
): Promise<RouteSummaryData | null> {
  try {
    const { response } = await requestRouteData(origin, destination, {
      travelMode: 'DRIVING',
      alternatives: false,
    });
    const route = response.routes?.[0];
    if (!route) return null;
    const leg = route.legs?.[0];
    const distanceMeters = route.distanceMeters ?? leg?.distanceMeters ?? 0;
    const durationMillis = route.durationMillis ?? route.staticDurationMillis ?? leg?.durationMillis ?? 0;
    const durationMinutes = Math.max(1, Math.round(durationMillis / 60000));
    return {
      durationText: `${durationMinutes} mins drive`,
      distanceText: formatDistanceText(distanceMeters),
      durationMinutes,
      distanceKm: distanceMeters / 1000,
    };
  } catch {
    return null;
  }
}
