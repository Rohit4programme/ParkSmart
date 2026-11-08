import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Navigation,
  X,
  Volume2,
  VolumeX,
  Map,
  Car,
  AlertTriangle,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  Route,
  Clock,
  Fuel,
  Repeat,
  Mic,
  MicOff,
  RotateCcw,
  Layers,
  Satellite,
  Moon,
  Plus,
  Minus,
  Target,
  Compass,
  Info,
  Shield,
  Zap,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  ArrowDownLeft,
  ArrowDownRight,
  CircleDot,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useNavigationEngine, NavStep, NavRoute, TrafficSegment, NavigationState } from '../../hooks/useNavigationEngine';
import { RoutingErrorCode, getRoutingSessionStats } from '../../services/routingService';
import { getNavigationPosition } from '../../services/locationService';
import { toValidLatLng } from '../../utils/polyline';
import { ParkingLot } from '../../types';

/** True in `vite dev` only — used to show extra configuration diagnostics. */
const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true;

/** Code-specific friendly messages — the user sees the exact Google cause. */
const ROUTING_ERROR_COPY: Partial<Record<RoutingErrorCode, { title: string; message: string }>> = {
  GOOGLE_KEY_MISSING: {
    title: 'Google Maps API key is missing',
    message: 'Set GOOGLE_MAPS_PLATFORM_KEY (or VITE_GOOGLE_MAPS_PLATFORM_KEY) in .env.local, then restart the dev server.',
  },
  GOOGLE_API_NOT_ENABLED: {
    title: 'Google API not enabled for this project',
    message: 'Enable the Routes API (and confirm Maps JavaScript API + Places API (New)) for the Google Cloud project that owns this key.',
  },
  GOOGLE_API_RESTRICTED: {
    title: 'API key is restricted or invalid',
    message: 'The key is not authorized for routing. Add the Maps JavaScript API, Routes API and Places API (New) to the key\u2019s allowed APIs, or verify the key itself.',
  },
  GOOGLE_REFERRER_BLOCKED: {
    title: 'HTTP referrer blocked by the API key',
    message: 'The key\u2019s HTTP referrer restriction rejects this origin. Allow http://localhost:5173/* and your production domain.',
  },
  GOOGLE_BILLING_ERROR: {
    title: 'Billing issue on the Google Cloud project',
    message: 'Routing requires billing on the same project that owns the API key. Enable billing (or attach a valid billing account), then wait a few minutes.',
  },
  ROUTING_QUOTA_EXCEEDED: {
    title: 'Routing quota exceeded',
    message: 'Daily routing quota has been reached. Please try again later. (Dev: Routes API Compute Routes per-request quota exhausted — the key is valid and was accepted; nothing to reconfigure.)',
  },
  INVALID_ORIGIN: {
    title: 'Invalid origin',
    message: 'Your current location is invalid. Try again once the GPS fix improves.',
  },
  INVALID_DESTINATION: {
    title: 'Invalid destination',
    message: 'The selected parking spot could not be geocoded.',
  },
  NO_ROUTE_FOUND: {
    title: 'No route found',
    message: 'Google could not find a driving route between your location and this parking spot.',
  },
  ROUTE_GEOMETRY_INVALID: {
    title: 'Invalid route geometry',
    message: 'Google returned a route without usable road geometry. Please retry.',
  },
  NETWORK_ERROR: {
    title: 'Network error',
    message: 'The routing request failed to reach Google. Check your connection and retry.',
  },
  UNKNOWN_ROUTING_ERROR: {
    title: 'Unknown routing error',
    message: 'Google returned an unexpected routing error. See the diagnostics below for the exact cause.',
  },
};

/** STEP-23 dev diagnostics checklist. */
function DiagnosticsPanel({ diagnostics }: { diagnostics: NavigationState['routingDiagnostics'] }) {
  if (!diagnostics) return null;
  const rows: { label: string; ok: boolean | null; detail?: string }[] = [
    { label: 'Maps JavaScript API loaded', ok: diagnostics.mapsJsLoaded },
    { label: 'Routes library loaded', ok: diagnostics.routesLibraryLoaded },
    { label: 'API key configured', ok: diagnostics.keyPresent, detail: diagnostics.keyPresent ? `length ${diagnostics.keyLength}` : undefined },
    {
      label: 'Key accepted by routing service',
      ok: diagnostics.keyAcceptedByService,
      detail: diagnostics.keyAcceptedByService ? 'request reached Google' : undefined,
    },
    { label: 'Origin valid', ok: diagnostics.originValid },
    { label: 'Destination valid', ok: diagnostics.destinationValid },
    { label: 'Routing request', ok: diagnostics.status === 'OK', detail: diagnostics.status ?? undefined },
    { label: 'Route geometry', ok: diagnostics.geometryPresent, detail: diagnostics.routesReceived !== null ? `routes: ${diagnostics.routesReceived}` : undefined },
  ];
  const stats = getRoutingSessionStats();
  return (
    <div className="mt-2 p-2 bg-rose-100/70 dark:bg-rose-900/30 rounded-lg text-rose-800 dark:text-rose-200 text-[10px] font-mono space-y-1.5">
      <div className="font-bold">Diagnostics (dev)</div>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-start gap-1.5">
            <span>{r.ok === true ? '✔' : r.ok === false ? '✘' : '—'}</span>
            <span>
              {r.label}
              {r.detail ? <span className="opacity-70"> — {r.detail}</span> : null}
            </span>
          </li>
        ))}
        {diagnostics.googleMessage ? (
          <li className="flex items-start gap-1.5">
            <span>ℹ</span>
            <span className="break-all">Google: {diagnostics.googleMessage}</span>
          </li>
        ) : null}
      </ul>
      <div className="border-t border-rose-300/40 dark:border-rose-500/30 pt-1.5">
        <div className="font-bold">Google routing quota (this session)</div>
        <ul className="space-y-0.5">
          <li>Provider: {stats.provider}</li>
          <li>Service: {stats.service}</li>
          <li>Status: {stats.status}</li>
          <li>Route requests: {stats.routeRequests} (success {stats.routeSuccess}, failed {stats.routeFailed})</li>
          <li>Last request: {stats.lastRequestAt ? new Date(stats.lastRequestAt).toLocaleTimeString() : 'never'}</li>
          {stats.lastStatus ? <li>Last status: {stats.lastStatus}</li> : null}
          {stats.lastErrorCode ? <li>Last error code: {stats.lastErrorCode}</li> : null}
        </ul>
      </div>
    </div>
  );
}

interface NavigationUIProps {
  parkingLot: ParkingLot | null;
  userLocation: { lat: number; lng: number } | null;
  onClose: () => void;
  onCameraUpdate?: (center: { lat: number; lng: number }, zoom: number, heading?: number) => void;
  /** When true, navigation starts immediately once the parking lot is known. */
  autoStart?: boolean;
  /** Expose full navigation state to parent for map component rendering. */
  onNavStateChange?: (state: {
    directionsResult: any | null;
    cameraMode: NavigationState['cameraMode'];
    userLocation: { lat: number; lng: number } | null;
    heading: number | null;
    destination: { lat: number; lng: number } | null;
    routeBounds: { northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } } | null;
    selectedRouteIndex: number;
    travelMode: 'DRIVING' | 'WALKING';
  }) => void;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return '1 min';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getManeuverIconComponent(maneuver: NavStep['maneuver'], bearing?: number): React.ReactNode {
  switch (maneuver) {
    case 'turn-left':
      return <ArrowLeft className="w-8 h-8" />;
    case 'turn-right':
      return <ArrowRight className="w-8 h-8" />;
    case 'straight':
      return <ArrowUp className="w-8 h-8" />;
    case 'uturn':
      return <RotateCcw className="w-8 h-8" />;
    case 'roundabout':
      return <RotateCcw className="w-8 h-8" />;
    case 'exit-roundabout':
      return <ArrowUpRight className="w-8 h-8" />;
    case 'merge':
      return <ArrowDownRight className="w-8 h-8" />;
    case 'arrive':
      return <CircleDot className="w-8 h-8" />;
    case 'depart':
      return <CircleDot className="w-8 h-8" />;
    case 'keep-left':
      return <ArrowLeft className="w-8 h-8" />;
    case 'keep-right':
      return <ArrowRight className="w-8 h-8" />;
    default:
      return <ArrowUp className="w-8 h-8" />;
  }
}

function getTrafficStatusText(status: TrafficSegment['status']): string {
  switch (status) {
    case 'normal': return 'Normal traffic';
    case 'moderate': return 'Moderate traffic';
    case 'heavy': return 'Heavy traffic';
    case 'severe': return 'Severe delays';
    default: return 'Normal traffic';
  }
}

function getTrafficStatusColor(status: TrafficSegment['status']): string {
  switch (status) {
    case 'normal': return 'text-emerald-500';
    case 'moderate': return 'text-amber-500';
    case 'heavy': return 'text-orange-500';
    case 'severe': return 'text-red-500';
    default: return 'text-emerald-500';
  }
}

export const NavigationUI: React.FC<NavigationUIProps> = ({
  parkingLot,
  userLocation,
  onClose,
  onCameraUpdate,
  autoStart = false,
  onNavStateChange,
}) => {
  const nav = useNavigationEngine();
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [travelMode] = useState<'DRIVING' | 'WALKING'>('DRIVING');

  // Navigation launch states: location lookup, error, transient "Route ready" banner
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [routeReady, setRouteReady] = useState(false);
  const autoStartedRef = useRef(false);
  const routeReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (routeReadyTimerRef.current) clearTimeout(routeReadyTimerRef.current);
    };
  }, []);

  const currentStep = useMemo(() => {
    if (nav.steps.length === 0) return null;
    return nav.steps[nav.currentStepIndex] || null;
  }, [nav.steps, nav.currentStepIndex]);

  const nextStep = useMemo(() => {
    if (nav.steps.length === 0) return null;
    return nav.steps[nav.currentStepIndex + 1] || null;
  }, [nav.steps, nav.currentStepIndex]);

  const getDestination = useCallback((): { lat: number; lng: number } | null => {
    if (!parkingLot) return null;
    // Prefer the road-accessible entrance coordinates when available.
    const dest = toValidLatLng({
      lat: parkingLot.entranceLat ?? parkingLot.lat,
      lng: parkingLot.entranceLng ?? parkingLot.lng,
    });
    if (!dest) {
      console.error('[NAV] Parking destination has no usable coordinates:', {
        name: parkingLot.name,
        lat: parkingLot.lat,
        lng: parkingLot.lng,
        entranceLat: parkingLot.entranceLat,
        entranceLng: parkingLot.entranceLng,
      });
      return null;
    }
    return dest;
  }, [parkingLot]);

  const resolveOrigin = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    // Reuse the app's existing, accuracy-gated GPS fix when we already have one.
    if (userLocation) return userLocation;
    try {
      return await getNavigationPosition();
    } catch (err) {
      console.error('[NAV] Location lookup failed:', err);
      return null;
    }
  }, [userLocation]);

  const handleStartNavigation = useCallback(async () => {
    if (!parkingLot || nav.isRecalculating) return;

    // Phase 2: route already fetched and drawn — begin live navigation.
    if (nav.isRoutePrepared && nav.currentRoute) {
      nav.beginNavigation();
      setRouteReady(true);
      if (routeReadyTimerRef.current) clearTimeout(routeReadyTimerRef.current);
      routeReadyTimerRef.current = setTimeout(() => setRouteReady(false), 3000);
      return;
    }

    // Phase 1: resolve location → validate destination → fetch + draw route.
    console.log('[NAV] Navigate clicked.');
    setStartError(null);
    setRouteReady(false);
    setIsResolvingLocation(true);

    const origin = await resolveOrigin();
    if (!mountedRef.current) return;
    if (!origin) {
      setIsResolvingLocation(false);
      setStartError('Location unavailable. Check that location access is allowed.');
      return;
    }

    const destination = getDestination();
    if (!destination) {
      setIsResolvingLocation(false);
      setStartError('Destination coordinates missing.');
      return;
    }

    const prepared = await nav.prepareRoute(origin, destination, parkingLot.name);
    if (!mountedRef.current) return;
    setIsResolvingLocation(false);

    if (prepared) {
      setRouteReady(true);
      if (routeReadyTimerRef.current) clearTimeout(routeReadyTimerRef.current);
      routeReadyTimerRef.current = setTimeout(() => setRouteReady(false), 3000);
    }
  }, [parkingLot, nav, resolveOrigin, getDestination]);

  // Auto-start: as soon as the panel opens from a Navigate button, resolve the
  // user's location and immediately fetch + draw the driving route.
  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    if (!parkingLot) return;
    if (nav.isNavigating || nav.isRecalculating) return;
    if (startError || nav.navigationError) return;

    autoStartedRef.current = true;
    handleStartNavigation();
  }, [autoStart, parkingLot, nav.isNavigating, nav.isRecalculating, startError, nav.navigationError, handleStartNavigation]);

  const handleStopNavigation = () => {
    nav.stopNavigation();
    onClose();
  };

  const handleSelectRoute = (index: number) => {
    nav.selectRoute(index);
  };

  const handleToggleVoice = () => {
    setIsMuted(!isMuted);
    nav.toggleVoice();
  };

  useEffect(() => {
    if (nav.isNavigating && nav.cameraMode === 'following' && userLocation && onCameraUpdate) {
      const heading = nav.steps[nav.currentStepIndex]?.bearing || 0;
      onCameraUpdate(userLocation, 18, heading);
    }
  }, [nav.isNavigating, nav.cameraMode, userLocation, nav.currentStepIndex, nav.steps, onCameraUpdate]);

  useEffect(() => {
    if (nav.isNavigating && nav.cameraMode === 'overview' && userLocation && parkingLot && onCameraUpdate) {
      const lat = (userLocation.lat + parkingLot.lat) / 2;
      const lng = (userLocation.lng + parkingLot.lng) / 2;
      onCameraUpdate({ lat, lng }, 14);
    }
  }, [nav.isNavigating, nav.cameraMode, userLocation, parkingLot, onCameraUpdate]);

  // Expose nav state to parent (MapView) for rendering navigation components on the map
  useEffect(() => {
    if (!onNavStateChange) return;
    onNavStateChange({
      directionsResult: nav.directionsResult,
      cameraMode: nav.cameraMode,
      userLocation: nav.currentLocation ?? userLocation,
      heading: nav.currentHeading,
      destination: parkingLot ? { lat: parkingLot.entranceLat ?? parkingLot.lat, lng: parkingLot.entranceLng ?? parkingLot.lng } : null,
      routeBounds: nav.currentRoute?.bounds ?? null,
      selectedRouteIndex: nav.selectedRouteIndex,
      travelMode,
    });
  }, [nav.directionsResult, nav.cameraMode, nav.currentHeading, nav.selectedRouteIndex, nav.currentRoute, nav.currentLocation, userLocation, parkingLot, travelMode, onNavStateChange]);

  if (!parkingLot) return null;

  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
      <AnimatePresence mode="wait">
        {!nav.isNavigating ? (
          <motion.div
            key="pre-navigation"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[280px] sm:w-[320px] pointer-events-auto"
          >
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-[var(--color-accent)]/10 rounded-lg">
                      <Navigation className="w-4 h-4 text-[var(--color-accent)]" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-xs">Navigation</h3>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[140px]">{parkingLot.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>

                {nav.currentRoute && (
                  <div className="flex items-center gap-3 mb-2 text-[11px]">
                    <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                      <Route className="w-3 h-3" />
                      <span>{formatDistance(nav.currentRoute.totalDistance)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                      <Clock className="w-3 h-3" />
                      <span>{formatDuration(nav.currentRoute.totalDuration)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                      <Car className="w-3 h-3" />
                      <span>{parkingLot.availableSpots ?? '—'} spots</span>
                    </div>
                  </div>
                )}

                {nav.isRoutePrepared && !nav.isNavigating && nav.currentRoute && (
                  <div className="mb-2 p-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                    <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      <span>Route Found</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-emerald-800 dark:text-emerald-200 text-[10px]">
                      <span className="flex items-center gap-1"><Route className="w-3 h-3" /> {formatDistance(nav.currentRoute.totalDistance)}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDuration(nav.currentRoute.totalDuration)}</span>
                      <span className="flex items-center gap-1"><Target className="w-3 h-3" /> ETA {nav.eta ? formatTime(nav.eta) : '—'}</span>
                    </div>
                  </div>
                )}

                {nav.isRecalculating && !nav.isNavigating && (
                  <div className="flex items-center gap-1.5 mb-2 p-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-amber-700 dark:text-amber-300 text-[10px]">
                    <Repeat className="w-3 h-3 animate-spin" />
                    <span>Calculating route...</span>
                  </div>
                )}

                {isResolvingLocation && (
                  <div className="flex items-center gap-1.5 mb-2 p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-700 dark:text-blue-300 text-[10px]">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Locating you...</span>
                  </div>
                )}

                {routeReady && !nav.isNavigating && (
                  <div className="flex items-center gap-1.5 mb-2 p-1.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-emerald-700 dark:text-emerald-300 text-[10px]">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Route found — ready to start</span>
                  </div>
                )}

                {(startError || nav.navigationError) && (
                  <div className="mb-2 p-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl">
                    <div className="flex items-start gap-1.5 text-rose-700 dark:text-rose-300 text-[10px]">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        {nav.routingErrorCode && ROUTING_ERROR_COPY[nav.routingErrorCode] ? (
                          <>
                            <div className="font-bold">{ROUTING_ERROR_COPY[nav.routingErrorCode]!.title}</div>
                            <div className="whitespace-pre-line">{ROUTING_ERROR_COPY[nav.routingErrorCode]!.message}</div>
                          </>
                        ) : (
                          <span className="whitespace-pre-line">{startError ?? nav.navigationError}</span>
                        )}
                        {!nav.routingErrorCode && startError && nav.navigationError && (
                          <div className="mt-0.5 whitespace-pre-line">{nav.navigationError}</div>
                        )}
                      </div>
                    </div>

                    {isDev && <DiagnosticsPanel diagnostics={nav.routingDiagnostics} />}

                    {nav.routingErrorCode === 'ROUTING_QUOTA_EXCEEDED' ? (
                      <div className="mt-1.5 flex items-center gap-1.5 px-2 py-1 bg-rose-100/60 dark:bg-rose-900/25 rounded-lg text-[10px] font-bold text-rose-700 dark:text-rose-300">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Retrying is disabled until the daily routing quota resets.
                      </div>
                    ) : (
                      <button
                        onClick={handleStartNavigation}
                        disabled={isResolvingLocation || nav.isRecalculating}
                        className="mt-1.5 flex items-center gap-1 px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-lg transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Retry
                      </button>
                    )}
                  </div>
                )}

                <button
                  onClick={handleStartNavigation}
                  disabled={!nav.isRoutePrepared || isResolvingLocation || nav.isRecalculating || !!nav.navigationError || !!startError}
                  className="w-full py-2.5 bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-hover)] hover:from-[var(--color-accent-hover)] hover:to-[var(--color-accent-dark)] text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 text-sm"
                >
                  {isResolvingLocation || (nav.isRecalculating && !nav.isNavigating) ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Calculating route...
                    </>
                  ) : (
                    <>
                      <Navigation className="w-4 h-4" />
                      Start Navigation
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="navigating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col h-full"
          >
            {/* Top Navigation Card */}
            <div className="pointer-events-auto">
              <div className="bg-gradient-to-b from-[var(--color-accent)] to-[var(--color-accent-hover)] text-white p-4 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleStopNavigation}
                      className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                      {currentStep && (
                        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                          {getManeuverIconComponent(currentStep.maneuver)}
                        </div>
                      )}
                      <div>
                        <div className="text-xl font-bold">
                          {currentStep ? formatDistance(currentStep.distance) : '—'}
                        </div>
                        <div className="text-sm text-white/80">
                          {currentStep?.roadName || 'Calculating...'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-bold">{nav.durationRemaining > 0 ? formatDuration(nav.durationRemaining) : '—'}</div>
                    <div className="text-sm text-white/80">
                      {nav.eta ? formatTime(nav.eta) : '—'}
                    </div>
                  </div>
                </div>

                {nextStep && (
                  <div className="mt-3 p-2 bg-white/10 rounded-xl flex items-center gap-2 text-sm">
                    <span className="text-white/60">Then:</span>
                    <span className="font-medium">{nextStep.instruction}</span>
                  </div>
                )}

                {nav.isRecalculating && (
                  <div className="mt-3 p-2 bg-amber-500/30 rounded-xl flex items-center gap-2 text-sm">
                    <Repeat className="w-4 h-4 animate-spin" />
                    <span>Recalculating...</span>
                  </div>
                )}
              </div>
            </div>

            {routeReady && (
              <div className="pointer-events-auto">
                <div className="bg-emerald-500/95 text-white px-4 py-2 shadow-lg flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="font-bold">Navigation started</span>
                  <span className="text-emerald-100 text-xs">
                    {formatDistance(nav.distanceRemaining)} • {formatDuration(nav.durationRemaining)} • ETA {formatTime(nav.eta ?? new Date(Date.now() + nav.durationRemaining * 1000))}
                  </span>
                </div>
              </div>
            )}

            {/* Route Info Bar */}
            <div className="pointer-events-auto">
              <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <Route className="w-4 h-4" />
                      <span>{formatDistance(nav.distanceRemaining)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <Clock className="w-4 h-4" />
                      <span>{formatDuration(nav.durationRemaining)}</span>
                    </div>
                    {nav.currentSpeed > 0 && (
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                        <Zap className="w-4 h-4" />
                        <span>{Math.round(nav.currentSpeed * 3.6)} km/h</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleToggleVoice}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      title={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted ? (
                        <VolumeX className="w-4 h-4 text-slate-400" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-[var(--color-accent)]" />
                      )}
                    </button>
                    <button
                      onClick={nav.toggleTraffic}
                      className={`p-2 rounded-lg transition-colors ${nav.showTraffic ? 'bg-[var(--color-accent)]/10' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      title="Toggle traffic"
                    >
                      <Layers className={`w-4 h-4 ${nav.showTraffic ? 'text-[var(--color-accent)]' : 'text-slate-400'}`} />
                    </button>
                    <button
                      onClick={() => setShowAlternatives(!showAlternatives)}
                      className={`p-2 rounded-lg transition-colors ${showAlternatives ? 'bg-[var(--color-accent)]/10' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      title="Route alternatives"
                    >
                      <Route className={`w-4 h-4 ${showAlternatives ? 'text-[var(--color-accent)]' : 'text-slate-400'}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Route Alternatives Panel */}
            <AnimatePresence>
              {showAlternatives && nav.alternativeRoutes.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="pointer-events-auto"
                >
                  <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-3">
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                      Alternative Routes
                    </div>
                    <div className="space-y-2">
                      {[nav.currentRoute, ...nav.alternativeRoutes].map((route, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSelectRoute(idx)}
                          className={`w-full p-3 rounded-xl border transition-all text-left ${
                            nav.selectedRouteIndex === idx
                              ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]/30'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-[var(--color-accent)]/30'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-[var(--color-accent)]' : idx === 1 ? 'bg-slate-400' : 'bg-slate-300'}`} />
                              <span className="font-medium text-sm text-slate-900 dark:text-white">
                                {idx === 0 ? 'Fastest' : idx === 1 ? 'Shortest' : 'Alternative'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                              <span>{formatDuration(route.totalDuration)}</span>
                              <span>{formatDistance(route.totalDistance)}</span>
                            </div>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{route.summary}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Turn-by-Turn Steps Panel */}
            <AnimatePresence>
              {showSteps && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="pointer-events-auto flex-1 overflow-hidden"
                >
                  <div className="h-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 overflow-y-auto">
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-slate-900 dark:text-white">Route Steps</h3>
                        <button
                          onClick={() => setShowSteps(false)}
                          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                        >
                          <ChevronDown className="w-5 h-5 text-slate-400" />
                        </button>
                      </div>
                      <div className="space-y-1">
                        {nav.steps.map((step, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-xl flex items-start gap-3 transition-colors ${
                              idx === nav.currentStepIndex
                                ? 'bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30'
                                : idx < nav.currentStepIndex
                                ? 'opacity-50'
                                : ''
                            }`}
                          >
                            <div className={`p-2 rounded-lg shrink-0 ${
                              idx === nav.currentStepIndex
                                ? 'bg-[var(--color-accent)] text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}>
                              {getManeuverIconComponent(step.maneuver)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                {step.instruction}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {formatDistance(step.distance)} • {formatDuration(step.duration)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bottom Panel */}
            {!showSteps && (
              <div className="mt-auto pointer-events-auto">
                <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-[var(--color-accent)]/10 rounded-xl">
                        <Target className="w-5 h-5 text-[var(--color-accent)]" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white text-sm">{parkingLot.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {parkingLot.availableSpots ?? '—'} spots • {parkingLot.formattedAddress || parkingLot.address}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowSteps(!showSteps)}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                    >
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
                      <div className="text-lg font-bold text-[var(--color-accent)]">{formatDistance(nav.distanceRemaining)}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Distance</div>
                    </div>
                    <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
                      <div className="text-lg font-bold text-[var(--color-accent)]">{nav.durationRemaining > 0 ? formatDuration(nav.durationRemaining) : '—'}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Duration</div>
                    </div>
                    <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
                      <div className="text-lg font-bold text-[var(--color-accent)]">{nav.eta ? formatTime(nav.eta) : '—'}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">ETA</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={nav.recalculate}
                      className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <Repeat className="w-4 h-4" />
                      Recalculate
                    </button>
                    <button
                      onClick={handleStopNavigation}
                      className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <X className="w-4 h-4" />
                      End
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Floating Controls */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-auto">
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => nav.setCameraMode('following')}
                  className={`p-3 rounded-xl shadow-lg transition-colors backdrop-blur-md ${
                    nav.cameraMode === 'following'
                      ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                      : 'bg-white/10 dark:bg-slate-900/10 text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-slate-800/20'
                  }`}
                  title="Follow me"
                >
                  <Navigation className="w-5 h-5" />
                </button>
                <button
                  onClick={() => nav.setCameraMode('overview')}
                  className={`p-3 rounded-xl shadow-lg transition-colors backdrop-blur-md ${
                    nav.cameraMode === 'overview'
                      ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                      : 'bg-white/10 dark:bg-slate-900/10 text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-slate-800/20'
                  }`}
                  title="Overview"
                >
                  <Map className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowSteps(!showSteps)}
                  className="p-3 rounded-xl shadow-lg backdrop-blur-md bg-white/10 dark:bg-slate-900/10 text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-slate-800/20 transition-colors"
                  title="Steps"
                >
                  <Info className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Arrival Overlay */}
            <AnimatePresence>
              {nav.isArrived && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-auto"
                >
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center max-w-sm mx-4 shadow-2xl"
                  >
                    <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Arrived!</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                      You have reached {parkingLot.name}
                    </p>
                    <button
                      onClick={handleStopNavigation}
                      className="w-full py-3 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-bold rounded-xl transition-colors"
                    >
                      End Navigation
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

function ArrowUpRight(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17l9.2-9.2M17 17V7H7" />
    </svg>
  );
}
