import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { APIProvider, Map as GoogleMap, InfoWindow, Circle, useMap } from '@vis.gl/react-google-maps';
import { ParkingLot } from '../types';
import { geocodeLocation } from '../utils/geocoding';
import { getBrowserLocation, geolocationErrorCode, locationErrorMessage } from '../services/locationService';

import { getApiKey } from '../services/googlePlacesService';
import PillNav from './PillNav';
import './InfoWindowGlass.css';
import { NavigationUI, NavigationRoute, NavigationCamera, NavigationMarker } from './navigation';
import { NavigationState } from '../hooks/useNavigationEngine';
import {
  MapPin,
  Star,
  Compass,
  ZoomIn,
  ZoomOut,
  Info,
  Building2,
  Navigation,
  Locate,
  Route as RouteIcon,
  RefreshCw,
  Maximize2,
  Minimize2,
  SearchX,
  ExternalLink,
  Phone,
  Globe,
  Clock,
  Zap,
  Accessibility,
  CreditCard,
  Share2,
} from 'lucide-react';
import { formatOpeningHours, formatEvChargeOptions, formatPaymentOptions } from '../utils/placeMapper';

interface Props {
  parkingLots: ParkingLot[];
  selectedLot: ParkingLot | null;
  onSelectLot: (lot: ParkingLot) => void;
  onOpenLotDetails: (lot: ParkingLot) => void;
  searchQuery: string;
  searchCenter: { lat: number; lng: number } | null;
  onSearchThisArea: (center: { lat: number; lng: number }) => void;
  searchStatus: string | null;
  isSearching: boolean;
  markersRendered: number;
  errorMessage?: string | null;
  onMapCenterChange?: (center: { lat: number; lng: number }) => void;
  /** Live, accuracy-gated GPS location provided by the parent App. */
  liveUserLocation?: { lat: number; lng: number } | null;
  /** Accuracy (meters) of the live GPS fix, if known. */
  liveAccuracyMeters?: number | null;
  /** Re-run the GPS lookup from the parent hook. */
  onRetryLocation?: () => void;
  /** Parking lot requested for INTERNAL navigation (from card/modal Navigate buttons). */
  navigationRequest?: ParkingLot | null;
  /** Called after the navigation request has been consumed by the map. */
  onNavigationRequestHandled?: () => void;
}

const API_KEY = getApiKey();

const MAPTILER_KEY = 'bJEJnXmRlZVhEh2wTH6P';

// Renders MapTiler street tiles as the actual base map type. Custom base map
// types only render on raster maps, so the map must not use a vector mapId
// (see <GoogleMap /> below).
const MapTilerBaseLayer: React.FC = () => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const mapTilerType = new google.maps.ImageMapType({
      getTileUrl: (coord: google.maps.Point, zoom: number) =>
        `https://api.maptiler.com/maps/streets-v2/${zoom}/${coord.x}/${coord.y}.png?key=${MAPTILER_KEY}`,
      tileSize: new google.maps.Size(256, 256),
      maxZoom: 19,
      name: 'MapTiler Streets',
    });

    map.mapTypes.set('maptiler-streets', mapTilerType);
    map.setMapTypeId('maptiler-streets');
  }, [map]);

  return null;
};

// HTML marker rendered as a google.maps.OverlayView — visual/click-equivalent
// replacement for AdvancedMarker (which is unavailable on raster maps).
const HtmlMarker: React.FC<{
  position: { lat: number; lng: number };
  onClick?: () => void;
  title?: string;
  zIndex?: number;
  children: React.ReactNode;
}> = ({ position, onClick, title, zIndex, children }) => {
  const map = useMap();
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<google.maps.OverlayView | null>(null);
  const positionRef = useRef(position);
  positionRef.current = position;
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    if (!map) return;

    const overlay = new google.maps.OverlayView();
    overlayRef.current = overlay;

    overlay.onAdd = () => {
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.transform = 'translate(-50%, -50%)';
      if (zIndex !== undefined) container.style.zIndex = String(zIndex);
      if (title) container.title = title;
      if (onClick) {
        container.addEventListener('click', (e) => {
          e.stopPropagation();
          onClickRef.current?.();
        });
      }
      containerRef.current = container;
      overlay.getPanes().overlayMouseTarget.appendChild(container);
      setPortalTarget(container);
    };

    overlay.draw = () => {
      const projection = overlay.getProjection();
      const container = containerRef.current;
      if (!projection || !container) return;
      const p = projection.fromLatLngToDivPixel(new google.maps.LatLng(positionRef.current));
      if (p) {
        container.style.left = `${p.x}px`;
        container.style.top = `${p.y}px`;
      }
    };

    overlay.onRemove = () => {
      containerRef.current?.remove();
      containerRef.current = null;
      overlayRef.current = null;
      setPortalTarget(null);
    };

    overlay.setMap(map);
    return () => overlay.setMap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Re-project when the marker's position changes (no remount needed).
  useEffect(() => {
    overlayRef.current?.draw();
  }, [position.lat, position.lng]);

  if (!portalTarget) return null;
  return createPortal(children, portalTarget);
};

const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY' && API_KEY !== 'MY_GOOGLE_MAPS_KEY';
const KOLKATA_CENTER = { lat: 22.5726, lng: 88.3639 };
const SEARCH_RADIUS_METERS = 5000;

const MapCenterController: React.FC<{
  center: { lat: number; lng: number } | null;
}> = ({ center }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !center) return;
    map.panTo({ lat: center.lat, lng: center.lng });
  }, [map, center]);

  return null;
};

const MapDragDetector: React.FC<{
  onMapCenterChange?: (center: { lat: number; lng: number }) => void;
  onMapDragged?: () => void;
}> = ({ onMapCenterChange, onMapDragged }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const idleListener = map.addListener('idle', () => {
      if (onMapCenterChange) {
        const c = map.getCenter();
        if (c) {
          onMapCenterChange({ lat: c.lat(), lng: c.lng() });
        }
      }
    });

    const dragListener = map.addListener('dragend', () => {
      if (onMapDragged) onMapDragged();
    });

    return () => {
      idleListener.remove();
      dragListener.remove();
    };
  }, [map, onMapCenterChange, onMapDragged]);

  return null;
};

export const MapView: React.FC<Props> = ({
  parkingLots,
  selectedLot,
  onSelectLot,
  onOpenLotDetails,
  searchQuery,
  searchCenter,
  onSearchThisArea,
  searchStatus,
  isSearching,
  markersRendered,
  errorMessage,
  onMapCenterChange,
  liveUserLocation,
  liveAccuracyMeters,
  onRetryLocation,
  navigationRequest,
  onNavigationRequestHandled,
}) => {
  const [zoomLevel, setZoomLevel] = useState(14);
  const [isHeatmapActive, setIsHeatmapActive] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [flyToKey, setFlyToKey] = useState<number>(0);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [hasCustomLocation, setHasCustomLocation] = useState<boolean>(false);
  const [searchResult, setSearchResult] = useState<{ lat: number; lng: number; displayName: string } | null>(null);
  const [searchStatusLocal, setSearchStatusLocal] = useState<'idle' | 'searching' | 'found' | 'empty'>('idle');
  const [showSearchThisArea, setShowSearchThisArea] = useState(false);
  const [lastMapCenter, setLastMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [showNavigation, setShowNavigation] = useState<boolean>(false);
  const [navigationLot, setNavigationLot] = useState<ParkingLot | null>(null);

  // Navigation state from NavigationUI — drives the map rendering components
  const [navDirectionsResult, setNavDirectionsResult] = useState<any | null>(null);
  const [navCameraMode, setNavCameraMode] = useState<NavigationState['cameraMode']>('overview');
  const [navUserLocation, setNavUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [navHeading, setNavHeading] = useState<number | null>(null);
  const [navDestination, setNavDestination] = useState<{ lat: number; lng: number } | null>(null);
  const [navRouteBounds, setNavRouteBounds] = useState<{ northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } } | null>(null);
  const [navSelectedRouteIndex, setNavSelectedRouteIndex] = useState<number>(0);
  const [navTravelMode, setNavTravelMode] = useState<'DRIVING' | 'WALKING'>('DRIVING');

  const [locationError, setLocationError] = useState<string | null>(null);


  const containerRef = useRef<HTMLDivElement>(null);





  const toggleFullscreen = () => {
    if (!isFullscreen) {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => { });
      }
      setIsFullscreen(true);
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { });
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const handleLocateMe = useCallback(() => {
    setIsLocating(true);
    setLocationError(null);
    if (onRetryLocation) {
      onRetryLocation();
      setIsLocating(false);
      return;
    }
    getBrowserLocation()
      .then((loc) => {
        setUserLocation(loc);
        setHasCustomLocation(true);
        setMapCenter(loc);
        setFlyToKey((k) => k + 1);
        setSearchResult(null);
        setSearchStatusLocal('idle');
        setIsLocating(false);
      })
      .catch((err) => {
        setLocationError(locationErrorMessage(geolocationErrorCode(err)));
        setHasCustomLocation(false);
        setIsLocating(false);
      });
  }, [onRetryLocation]);

  // Keep the map's marker in sync with the live, accuracy-gated GPS from App.
  useEffect(() => {
    if (liveUserLocation) {
      setUserLocation(liveUserLocation);
      setHasCustomLocation(true);
      setMapCenter(liveUserLocation);
      setFlyToKey((k) => k + 1);
      setSearchResult(null);
      setSearchStatusLocal('idle');
      setIsLocating(false);
    }
  }, [liveUserLocation?.lat, liveUserLocation?.lng]);

  // Stable callbacks for NavigationUI — must not change identity every render,
  // otherwise NavigationUI's effect triggers an infinite render loop.
  const handleCloseNavigation = useCallback(() => {
    setShowNavigation(false);
    setNavigationLot(null);
    setNavDirectionsResult(null);
    setNavUserLocation(null);
    setNavDestination(null);
  }, []);

  const handleNavStateChange = useCallback((navState: {
    directionsResult: any | null;
    cameraMode: NavigationState['cameraMode'];
    userLocation: { lat: number; lng: number } | null;
    heading: number | null;
    destination: { lat: number; lng: number } | null;
    routeBounds: { northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } } | null;
    selectedRouteIndex: number;
    travelMode: 'DRIVING' | 'WALKING';
  }) => {
    setNavDirectionsResult(navState.directionsResult);
    setNavCameraMode(navState.cameraMode);
    setNavUserLocation(navState.userLocation);
    setNavHeading(navState.heading);
    setNavDestination(navState.destination);
    setNavRouteBounds(navState.routeBounds);
    setNavSelectedRouteIndex(navState.selectedRouteIndex);
    setNavTravelMode(navState.travelMode);
  }, []);

  // Pan the map to the selected lot when it changes (e.g., from "Navigate to Lot")
  useEffect(() => {
    if (selectedLot) {
      setMapCenter({ lat: selectedLot.lat, lng: selectedLot.lng });
    }
  }, [selectedLot?.id, selectedLot?.lat, selectedLot?.lng]);

  // Open INTERNAL navigation mode when the parent requests navigation for a lot
  useEffect(() => {
    if (navigationRequest) {
      setNavigationLot(navigationRequest);
      setShowNavigation(true);
      // Ensure the lot is selected so the destination/route render correctly
      onSelectLot(navigationRequest);
      onNavigationRequestHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationRequest?.id]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResult(null);
      setSearchStatusLocal('idle');
      return;
    }
    setSearchStatusLocal('searching');
    const timer = setTimeout(async () => {
      const result = await geocodeLocation(query);
      if (result) {
        setSearchResult(result);
        setMapCenter({ lat: result.lat, lng: result.lng });
        setFlyToKey((k) => k + 1);
        setSearchStatusLocal('found');
        // Requirement: "If the user searches 'Bongaon', 'Barasat', etc.:
        // geocode the location, move the map, run a Nearby Search around
        // the new map center."
        onSearchThisArea({ lat: result.lat, lng: result.lng });
      } else {
        setSearchResult(null);
        setSearchStatusLocal('empty');
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [searchQuery, onSearchThisArea]);

  const handleMapCenterChange = useCallback((center: { lat: number; lng: number }) => {
    setLastMapCenter(center);
    if (onMapCenterChange) onMapCenterChange(center);
  }, [onMapCenterChange]);

  const handleMapDragged = useCallback(() => {
    setShowSearchThisArea(true);
  }, []);

  const handleSearchThisAreaClick = useCallback(() => {
    if (lastMapCenter) {
      onSearchThisArea(lastMapCenter);
      setShowSearchThisArea(false);
    }
  }, [lastMapCenter, onSearchThisArea]);

  const getLotDistanceText = (lot: ParkingLot) => {
    if (!lot.distanceKm) return '';
    if (lot.distanceKm < 1) return `${Math.round(lot.distanceKm * 1000)} m`;
    return `${lot.distanceKm.toFixed(1)} km`;
  };

  const getLotHoursText = (lot: ParkingLot) => {
    return formatOpeningHours(lot.currentOpeningHours) ?? 'Hours unavailable';
  };

  const getEvText = (lot: ParkingLot) => {
    return formatEvChargeOptions(lot.evChargeOptions);
  };

  const getPaymentText = (lot: ParkingLot) => {
    return formatPaymentOptions(lot.paymentOptions);
  };

  const handleShare = useCallback((lot: ParkingLot) => {
    const url = lot.googleMapsUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lot.name} ${lot.formattedAddress}`)}`;
    if (navigator.share) {
      navigator.share({ title: lot.name, text: lot.formattedAddress, url }).catch(() => { });
    } else {
      navigator.clipboard?.writeText(url).catch(() => { });
    }
  }, []);

  const defaultCenter = searchCenter || KOLKATA_CENTER;

  if (!hasValidKey) {
    return (
      <div className="w-full h-full min-h-[320px] flex items-center justify-center bg-slate-900 rounded-3xl border border-slate-700">
        <div className="text-center p-6 max-w-sm">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center">
            <Info className="w-6 h-6" />
          </div>
          <h3 className="text-white font-bold text-sm mb-1">Google Maps API key missing</h3>
          <p className="text-slate-400 text-xs leading-relaxed">
            Add <code className="text-blue-400 font-mono bg-slate-800 px-1.5 py-0.5 rounded">GOOGLE_MAPS_PLATFORM_KEY</code> to your <code className="text-blue-400 font-mono bg-slate-800 px-1.5 py-0.5 rounded">.env.local</code> file to display parking on Google Maps.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full transition-all duration-300 relative bg-slate-900 shadow-lg flex flex-col justify-between group select-none ${isFullscreen
        ? 'fixed inset-0 z-50 w-screen h-screen p-2 sm:p-4 rounded-none border-0 overflow-hidden'
        : 'h-full min-h-[320px] sm:min-h-[450px] rounded-3xl overflow-hidden border border-slate-200/90'
        }`}
    >
      <div className="absolute top-3 left-3 right-3 z-30 flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
        <PillNav
          hideLogo
          compact
          items={[
            { label: <span className="flex items-center gap-1.5"><Compass className="w-3.5 h-3.5" />Google Maps</span>, href: '#map', ariaLabel: 'Google Maps view' },
          ]}
          baseColor="#ffffff"
          pillColor="#ffffff"
          pillTextColor="#334155"
          hoveredPillTextColor="#0f172a"
        />

        <PillNav
          hideLogo
          compact
          items={[
            { label: <ZoomIn className="w-4 h-4" />, href: '#zoomin', onClick: () => setZoomLevel(Math.min(zoomLevel + 1, 18)), ariaLabel: 'Zoom in' },
            { label: <ZoomOut className="w-4 h-4" />, href: '#zoomout', onClick: () => setZoomLevel(Math.max(zoomLevel - 1, 10)), ariaLabel: 'Zoom out' },
            { label: <span className="flex items-center gap-1.5">{isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}<span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span></span>, href: '#fullscreen', onClick: toggleFullscreen, ariaLabel: isFullscreen ? 'Exit fullscreen' : 'Fullscreen' },
          ]}
          activeHref={isFullscreen ? '#fullscreen' : ''}
          baseColor="#ffffff"
          pillColor={isFullscreen ? '#2563eb' : '#ffffff'}
          pillTextColor={isFullscreen ? '#ffffff' : '#334155'}
          hoveredPillTextColor="#0f172a"
        />
      </div>



      {showSearchThisArea && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 backdrop-blur-md text-white text-xs font-bold px-4 py-2 rounded-full border border-blue-500/40 shadow-xl animate-fade-in flex items-center gap-2 pointer-events-auto">
          <Building2 className="w-3.5 h-3.5 text-blue-400" />
          <span>Map moved. Search parking in this area?</span>
          <button
            type="button"
            onClick={handleSearchThisAreaClick}
            className="px-2.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-[11px] font-extrabold transition-colors cursor-pointer"
          >
            Search This Area
          </button>
          <button
            type="button"
            onClick={() => setShowSearchThisArea(false)}
            className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full text-[11px] font-bold transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="absolute bottom-4 right-3 z-30 flex flex-col items-end gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={handleLocateMe}
          disabled={isLocating}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold shadow-lg border transition-all cursor-pointer"
          style={hasCustomLocation
            ? { backgroundColor: 'var(--color-accent)', color: 'white', borderColor: 'color-mix(in srgb, var(--color-accent) 80%, white)', boxShadow: '0 4px 12px color-mix(in srgb, var(--color-accent) 30%, transparent)' }
            : { backgroundColor: 'rgb(255 255 255 / 0.95)', color: 'rgb(30 41 59)', borderColor: 'rgb(226 232 240)' }
          }
          title="Center map on my GPS location"
        >
          {isLocating ? (
            <RefreshCw className="w-4 h-4 animate-spin" style={{ color: 'var(--color-accent)' }} />
          ) : (
            <Locate className="w-4 h-4" style={{ color: hasCustomLocation ? 'white' : 'var(--color-accent)' }} />
          )}
          <span className="hidden sm:inline">
            {isLocating ? 'Locating...' : hasCustomLocation ? 'GPS Active' : 'My Location'}
          </span>
        </button>

        {searchStatusLocal === 'searching' && (
          <div className="flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/90 backdrop-blur-md text-slate-700 dark:text-white text-[11px] font-semibold px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 shadow-lg">
            <RefreshCw className="w-3 h-3 animate-spin" style={{ color: 'var(--color-accent)' }} />
            <span>Finding destination...</span>
          </div>
        )}
        {searchStatusLocal === 'found' && searchResult && (
          <div className="flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/90 backdrop-blur-md text-[11px] font-semibold px-3 py-1.5 rounded-full border shadow-lg max-w-[260px]" style={{ color: 'var(--color-accent)', borderColor: 'color-mix(in srgb, var(--color-accent) 40%, transparent)' }}>
            <MapPin className="w-3 h-3 shrink-0" style={{ color: 'var(--color-accent)' }} />
            <span className="truncate text-slate-700 dark:text-slate-200">{searchQuery.trim()}</span>
          </div>
        )}
        {searchStatusLocal === 'empty' && (
          <div className="flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/90 backdrop-blur-md text-rose-600 dark:text-rose-300 text-[11px] font-semibold px-3 py-1.5 rounded-full border border-rose-300 dark:border-rose-500/40 shadow-lg">
            <SearchX className="w-3 h-3 shrink-0 text-rose-500" />
            <span>Location not found</span>
          </div>
        )}
      </div>

      {selectedLot && !showNavigation && (
        <div className="absolute top-14 left-3 right-3 z-30 p-3 rounded-2xl shadow-2xl animate-fade-in flex flex-wrap items-center justify-between gap-3 pointer-events-auto" style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent-dark, #1e293b) 20%, transparent)', backdropFilter: 'blur(16px) saturate(1.4)', WebkitBackdropFilter: 'blur(16px) saturate(1.4)', border: '1px solid color-mix(in srgb, var(--color-accent, #64748b) 30%, transparent)' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 30%, transparent)', borderColor: 'color-mix(in srgb, var(--color-accent) 40%, transparent)', borderWidth: '1px', color: 'var(--color-accent)' }}>
              <RouteIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black truncate" style={{ color: 'rgba(255,255,255,0.95)' }}>Directions to {selectedLot.name}</div>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Tap <span className="font-bold" style={{ color: 'var(--color-accent)' }}>Navigate</span> to calculate a live route on demand.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleLocateMe}
              disabled={isLocating}
              className="px-3 py-1.5 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1.5"
              style={hasCustomLocation
                ? { backgroundColor: 'color-mix(in srgb, var(--color-accent) 25%, transparent)', color: 'var(--color-accent)', border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)' }
                : { backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)' }
              }
              title="Use my real GPS geolocation"
            >
              {isLocating ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--color-accent)' }} />
              ) : (
                <Locate className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
              )}
              <span className="hidden sm:inline">
                {isLocating ? 'Locating...' : hasCustomLocation ? 'GPS Active' : 'My Location'}
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="w-full h-full">
        <APIProvider apiKey={API_KEY} version="weekly" libraries={['places', 'routes', 'marker']}>
          <GoogleMap
            className="glass-iw-host"
            defaultCenter={selectedLot ? { lat: selectedLot.lat, lng: selectedLot.lng } : defaultCenter}
            defaultZoom={zoomLevel}
            style={{ width: '100%', height: '100%' }}
            disableDefaultUI={true}
          >
            <MapTilerBaseLayer />
            <MapDragDetector onMapCenterChange={handleMapCenterChange} onMapDragged={handleMapDragged} />

            {mapCenter && <MapCenterController center={mapCenter} />}

            {(searchCenter || userLocation) && (
              <Circle
                center={searchCenter || userLocation!}
                radius={SEARCH_RADIUS_METERS}
                strokeColor="#2563EB"
                strokeOpacity={0.5}
                strokeWeight={1.5}
                fillColor="#2563EB"
                fillOpacity={0.08}
                clickable={false}
              />
            )}

            {searchResult && (
              <HtmlMarker
                position={searchResult}
                title="Searched destination"
                zIndex={45}
              >
                <div className="relative flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-rose-500/30 animate-ping absolute" />
                  <div className="w-5 h-5 rounded-full bg-rose-600 border-2 border-white shadow-lg flex items-center justify-center text-white">
                    <MapPin className="w-3 h-3 fill-white" />
                  </div>
                </div>
              </HtmlMarker>
            )}

            {userLocation && (
              <HtmlMarker
                position={userLocation}
                title="Your Current Geolocation"
                zIndex={40}
              >
                <div className="relative flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-blue-500/30 animate-ping absolute" />
                  <div className="w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center text-white">
                    <Navigation className="w-3 h-3 fill-white rotate-45" />
                  </div>
                </div>
              </HtmlMarker>
            )}

            {/* Nav route is drawn only after the user taps Navigate (NavigationRoute below) —
                never pre-fetch a route just because a lot was selected. */}
            {showNavigation && navDirectionsResult && (
              <NavigationRoute
                isNavigating={showNavigation}
                directionsResult={navDirectionsResult}
                trafficSegments={[]}
                showTraffic={true}
                selectedRouteIndex={navSelectedRouteIndex}
                travelMode={navTravelMode}
              />
            )}

            {showNavigation && (
              <NavigationCamera
                isNavigating={showNavigation}
                cameraMode={navCameraMode}
                userLocation={navUserLocation}
                destination={navDestination}
                heading={navHeading}
                routeBounds={navRouteBounds}
              />
            )}

            {showNavigation && (
              <NavigationMarker
                isNavigating={showNavigation}
                userLocation={navUserLocation}
                heading={navHeading}
                destination={navDestination}
                destinationName={navigationLot?.name}
              />
            )}

            {parkingLots.map((lot) => {
              const isSelected = selectedLot?.id === lot.id;
              return (
                <HtmlMarker
                  key={lot.id}
                  position={{ lat: lot.lat, lng: lot.lng }}
                  onClick={() => onSelectLot(lot)}
                  title={lot.name}
                >
                  <div className={`px-2.5 py-1 rounded-xl text-xs font-black shadow-lg border transition-all cursor-pointer flex items-center gap-1.5 ${isSelected
                    ? 'bg-blue-600 text-white border-white scale-110 z-20 shadow-blue-500/30'
                    : 'bg-slate-900/90 text-white border-slate-700 hover:border-blue-400'
                    }`}>
                    {lot.rating !== undefined ? (
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span>{lot.rating.toFixed(1)}</span>
                      </span>
                    ) : (
                      <span>P</span>
                    )}
                  </div>
                </HtmlMarker>
              );
            })}

            {selectedLot && (
              <InfoWindow
                position={{ lat: selectedLot.lat, lng: selectedLot.lng }}
                onCloseClick={() => onSelectLot(selectedLot)}
              >
                <div className="p-1 text-slate-900 dark:text-slate-100 text-xs max-w-[min(260px,calc(100vw-24px))] box-border">
                  <h4 className="font-bold text-sm text-slate-950 dark:text-white">{selectedLot.name}</h4>
                  <p className="text-slate-600 dark:text-slate-400 text-[11px] mb-1.5">{selectedLot.formattedAddress}</p>

                  {selectedLot.rating !== undefined && (
                    <div className="flex items-center gap-1 mb-1">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span className="font-bold text-slate-800 dark:text-slate-100">{selectedLot.rating}</span>
                      {selectedLot.userRatingCount !== undefined && (
                        <span className="text-slate-500 dark:text-slate-400">({selectedLot.userRatingCount} reviews)</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-600 dark:text-slate-300">
                    <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                    <span>{getLotHoursText(selectedLot)}</span>
                  </div>

                  {selectedLot.wheelchairAccessible !== undefined && (
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-600 dark:text-slate-300">
                      <Accessibility className="w-3 h-3 text-indigo-500 shrink-0" />
                      <span>{selectedLot.wheelchairAccessible ? 'Wheelchair accessible' : 'Not wheelchair accessible'}</span>
                    </div>
                  )}

                  {getEvText(selectedLot) && (
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-600 dark:text-slate-300">
                      <Zap className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span>{getEvText(selectedLot)}</span>
                    </div>
                  )}

                  {getPaymentText(selectedLot) && (
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-600 dark:text-slate-300">
                      <CreditCard className="w-3 h-3 text-blue-500 shrink-0" />
                      <span>{getPaymentText(selectedLot)}</span>
                    </div>
                  )}

                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1.5">
                    {getLotDistanceText(selectedLot) ? `${getLotDistanceText(selectedLot)} from search center` : ''}
                  </div>

                  {selectedLot.nationalPhoneNumber && (
                    <a
                      href={`tel:${selectedLot.nationalPhoneNumber}`}
                      className="flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100 mb-1"
                    >
                      <Phone className="w-3 h-3 shrink-0" /> {selectedLot.nationalPhoneNumber}
                    </a>
                  )}

                  {selectedLot.websiteUri && (
                    <a
                      href={selectedLot.websiteUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100 mb-1"
                    >
                      <Globe className="w-3 h-3 shrink-0" /> Visit website
                    </a>
                  )}

                  {selectedLot.googleMapsUri && (
                    <a
                      href={selectedLot.googleMapsUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-100 mb-1.5"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" /> Open in Google Maps
                    </a>
                  )}

                  <div className="flex gap-1.5 mt-1.5">
                    <button
                      onClick={() => onOpenLotDetails(selectedLot)}
                      className="flex-1 py-1.5 bg-blue-600/90 hover:bg-blue-700 text-white font-bold rounded-lg text-[11px] transition-colors cursor-pointer"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => {
                        setNavigationLot(selectedLot);
                        setShowNavigation(true);
                      }}
                      className="flex-1 py-1.5 bg-emerald-600/90 hover:bg-emerald-700 text-white font-bold rounded-lg text-[11px] transition-colors cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Navigation className="w-3 h-3" />
                      Navigate
                    </button>
                    <button
                      onClick={() => handleShare(selectedLot)}
                      className="px-2.5 py-1.5 bg-white/30 dark:bg-white/15 border border-white/35 dark:border-white/20 backdrop-blur-md hover:bg-white/40 dark:hover:bg-white/25 text-slate-700 dark:text-slate-100 rounded-lg text-[11px] transition-colors cursor-pointer"
                      title="Share"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </APIProvider>

        {/* Navigation UI Overlay */}
        {showNavigation && navigationLot && (
          <NavigationUI
            parkingLot={navigationLot}
            userLocation={userLocation}
            onClose={handleCloseNavigation}
            autoStart={true}
            onNavStateChange={handleNavStateChange}
          />
        )}
      </div>
    </div>
  );
};