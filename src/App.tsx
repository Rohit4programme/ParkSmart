import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { ParkingLot, ParkingStall, Booking, VehicleInfo, UserAccount, ThemeConfig } from './types';
import { PARKING_LOTS, RECENT_BOOKINGS } from './data/appData';
import { Header } from './components/Header';
import PillNav from './components/PillNav';
import { GoogleMapsKeyBanner } from './components/GoogleMapsKeyBanner';
import { MapView } from './components/MapView';
import { ParkingCard } from './components/ParkingCard';
import { ParkingDetailModal } from './components/ParkingDetailModal';
import { BookingModal } from './components/BookingModal';
import { ActivePassModal } from './components/ActivePassModal';
import { AiAssistantDrawer } from './components/AiAssistantDrawer';
import { OperatorDashboard } from './components/OperatorDashboard';
import { RecentBookings } from './components/RecentBookings';
import { UpcomingParkingCard } from './components/UpcomingParkingCard';
import { listMyBookings } from './services/verificationService';
import { LoginModal } from './components/LoginModal';
import { initializeAuth, signOutUser } from './lib/auth';
import { ThemeCustomizerModal } from './components/ThemeCustomizerModal';
import ScrollStack, { ScrollStackItem } from './components/ScrollStack';
import { ThemeToggle } from './components/ui/curtain-theme-toggle';
import { useCurrentLocation } from './hooks/useCurrentLocation';
import { useNearbyParking } from './hooks/useNearbyParking';
import { getApiKey } from './services/googlePlacesService';
import { syncParkingLots } from './services/lotSyncService';
import { formatINR } from './utils/currency';
import {
  Zap,
  Shield,
  SearchX,
  Compass,
  Heart,
  ArrowUpDown,
} from 'lucide-react';

export default function App() {
  const navigate = useNavigate();
  const [parkingLots, setParkingLots] = useState<ParkingLot[]>(PARKING_LOTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [activePreset, setActivePreset] = useState('');
  const [mode, setMode] = useState<'driver' | 'operator'>('driver');
  const [searchCenterOverride, setSearchCenterOverride] = useState<{ lat: number; lng: number } | null>(null);

  const { location: userLocation, accuracyMeters, isLoading: isLocationLoading, retry: retryLocation } = useCurrentLocation();
  const {
    lots: nearbyParkingLots,
    isLoading: isParkingLoading,
    error: parkingError,
    status: parkingStatus,
    isApiError,
  } = useNearbyParking(searchCenterOverride || userLocation, 5000, searchQuery);

  // When the user starts typing a new destination, discard any stale
  // "Search This Area" override so the next search targets the new query.
  useEffect(() => {
    if (searchQuery.trim()) {
      setSearchCenterOverride(null);
    }
  }, [searchQuery]);

  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>(() => {
    const saved = localStorage.getItem('parksmart_theme_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {

      }
    }
    const savedDark = localStorage.getItem('parksmart_theme');
    return {
      mode: savedDark === 'dark' ? 'dark' : savedDark === 'light' ? 'light' : 'system',
      accent: 'blue',
      mapStyle: 'standard',
      density: 'comfortable',
      highContrast: false,
      reduceMotion: false,
    };
  });

  const [systemDark, setSystemDark] = useState<boolean>(() => {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const isDarkMode = themeConfig.mode === 'dark' || (themeConfig.mode === 'system' && systemDark);

  useEffect(() => {
    const root = document.documentElement;

    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    ['theme-blue', 'theme-emerald', 'theme-violet', 'theme-amber', 'theme-rose', 'theme-slate'].forEach((cls) => {
      root.classList.remove(cls);
    });
    if (themeConfig.accent !== 'blue') {
      root.classList.add(`theme-${themeConfig.accent}`);
    }

    if (themeConfig.density === 'compact') {
      root.classList.add('density-compact');
    } else {
      root.classList.remove('density-compact');
    }

    if (themeConfig.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    localStorage.setItem('parksmart_theme_config', JSON.stringify(themeConfig));
    localStorage.setItem('parksmart_theme', isDarkMode ? 'dark' : 'light');
  }, [themeConfig, isDarkMode]);

  const [selectedLot, setSelectedLot] = useState<ParkingLot | null>(PARKING_LOTS[0] ?? null);
  const [detailModalLot, setDetailModalLot] = useState<ParkingLot | null>(null);
  /** Parking lot requested for INTERNAL navigation (opened via card/modal Navigate buttons). */
  const [navigationRequest, setNavigationRequest] = useState<ParkingLot | null>(null);
  const [bookingModalState, setBookingModalState] = useState<{
    lot: ParkingLot;
    stall: ParkingStall | null;
    initialDurationHours?: number;
    initialVehicle?: VehicleInfo;
    initialAddonIds?: string[];
  } | null>(null);

  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [recentBookings, setRecentBookings] = useState<Booking[]>(RECENT_BOOKINGS);
  const [favoriteLotIds, setFavoriteLotIds] = useState<string[]>([]);
  const [dashboardViewTab, setDashboardViewTab] = useState<'all' | 'favorites'>('all');
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [isActivePassOpen, setIsActivePassOpen] = useState(false);

  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem('parksmart_current_user');
    if (!saved) {
      return null;
    }

    try {
      const parsed = JSON.parse(saved) as UserAccount;
      const accountKey = `parksmart_user_${parsed.email.trim().toLowerCase()}`;
      if (!localStorage.getItem(accountKey)) {
        localStorage.removeItem('parksmart_current_user');
        return null;
      }
      return parsed;
    } catch {
      localStorage.removeItem('parksmart_current_user');
      return null;
    }
  });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Restore/refresh the Supabase session and keep user state in sync
  // (sign-in, sign-out, token refresh) via onAuthStateChange.
  useEffect(() => {
    return initializeAuth((user) => {
      setCurrentUser(user);
      if (!user) {
        localStorage.removeItem('parksmart_current_user');
      }
    });
  }, []);

  // Load the signed-in driver's bookings from the server so the dashboard,
  // "Upcoming parking" card and QR ticket survive a page reload. The server
  // owns the lifecycle state; local state is only a view of it.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    listMyBookings(controller.signal).then((res) => {
      if (cancelled || res.ok === false) return;
      const serverBookings = res.data;
      if (serverBookings.length === 0) return;

      setRecentBookings(() => serverBookings);

      const nextActive =
        serverBookings.find((b) => b.bookingStatus === 'CHECKED_IN') ||
        serverBookings.find((b) => b.bookingStatus === 'ACTIVE') ||
        serverBookings.find((b) => b.bookingStatus === 'CONFIRMED') ||
        null;
      if (nextActive) setActiveBooking(nextActive);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const [showFilters, setShowFilters] = useState(false);  const [maxPrice, setMaxPrice] = useState<number>(150);
  const [evOnly, setEvOnly] = useState(false);
  const [coveredOnly, setCoveredOnly] = useState(false);
  const [securityOnly, setSecurityOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'recommended' | 'price' | 'rating' | 'spots' | 'distance'>('recommended');

  useEffect(() => {
    setParkingLots(nearbyParkingLots);
  }, [nearbyParkingLots]);

  // Keep the server store in sync (debounced) so /api/parking/book can
  // reserve real stalls for Google-discovered lots.
  useEffect(() => {
    const timer = setTimeout(() => {
      syncParkingLots(parkingLots);
    }, 2000);
    return () => clearTimeout(timer);
  }, [parkingLots]);

  useEffect(() => {
    if (parkingLots.length === 0) {
      setSelectedLot(null);
      return;
    }

    setSelectedLot((current) => {
      if (current && parkingLots.some((lot) => lot.id === current.id)) {
        return current;
      }

      return [...parkingLots].sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? null;
    });
  }, [parkingLots]);

  const filteredLots = parkingLots.filter((lot) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      lot.name.toLowerCase().includes(query) ||
      lot.address.toLowerCase().includes(query) ||
      lot.city.toLowerCase().includes(query);

    const matchesPrice = lot.pricePerHour === undefined || lot.pricePerHour <= maxPrice;
    const matchesEv = !evOnly || (lot.evChargersCount !== undefined && lot.evChargersCount > 0);
    const matchesCovered = !coveredOnly || lot.isCovered === true;
    const matchesSecurity = !securityOnly || lot.hasSecurity === true;

    return matchesSearch && matchesPrice && matchesEv && matchesCovered && matchesSecurity;
  });

  const handleToggleFavorite = (lotId: string) => {
    setFavoriteLotIds((prev) =>
      prev.includes(lotId) ? prev.filter((id) => id !== lotId) : [...prev, lotId]
    );
  };

  const favoriteLots = filteredLots.filter((lot) => favoriteLotIds.includes(lot.id));

  const sortedLots = [...filteredLots].sort((a, b) => {
    if (sortBy === 'recommended') {
      return (
        a.distanceKm - b.distanceKm ||
        (b.availableSpots ?? 0) - (a.availableSpots ?? 0) ||
        (a.pricePerHour ?? 0) - (b.pricePerHour ?? 0)
      );
    }
    if (sortBy === 'price') return (a.pricePerHour ?? 0) - (b.pricePerHour ?? 0);
    if (sortBy === 'rating') return (b.rating ?? 0) - (a.rating ?? 0);
    if (sortBy === 'spots') return (b.availableSpots ?? 0) - (a.availableSpots ?? 0);
    if (sortBy === 'distance') return a.distanceKm - b.distanceKm;
    return 0;
  });

  const displayedLots =
    dashboardViewTab === 'favorites'
      ? sortedLots.filter((lot) => favoriteLotIds.includes(lot.id))
      : sortedLots;

  const API_KEY = getApiKey();
  const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY' && API_KEY !== 'MY_GOOGLE_MAPS_KEY';

  const handleBookingSuccess = (booking: Booking) => {
    // Mark the booked stall as occupied in local state so the UI reflects it
    // immediately (the server does the same in /api/parking/book).
    setParkingLots((prev) =>
      prev.map((lot) => {
        if (lot.id !== booking.lotId || !lot.floors) return lot;
        const floors = lot.floors.map((floor) => {
          const stalls = floor.stalls.map((s) =>
            s.code === booking.stallCode && s.status === 'available'
              ? { ...s, status: 'occupied' as const }
              : s
          );
          const availableStalls = stalls.filter((s) => s.status === 'available').length;
          return { ...floor, stalls, availableStalls };
        });
        const availableSpots = floors.reduce((sum, f) => sum + f.availableStalls, 0);
        return { ...lot, floors, availableSpots };
      })
    );
    setActiveBooking(booking);
    setRecentBookings((prev) => [booking, ...prev]);
    setBookingModalState(null);
    setDetailModalLot(null);
    setIsActivePassOpen(true);
  };

  const handleRebook = (historicalBooking: Booking) => {
    if (parkingLots.length === 0) return;

    const lot =
      parkingLots.find((l) => l.id === historicalBooking.lotId) ||
      parkingLots.find((l) => l.name.toLowerCase().includes(historicalBooking.lotName.toLowerCase())) ||
      parkingLots[0];

    setSelectedLot(lot);

    let targetStall: ParkingStall | null = null;
    if (lot && lot.floors) {
      for (const floor of lot.floors) {
        const stall = floor.stalls.find(
          (s) => s.code === historicalBooking.stallCode || s.id === historicalBooking.stallCode
        );
        if (stall) {
          targetStall = stall;
          break;
        }
      }
      if (!targetStall && lot.floors?.[0]?.stalls) {
        targetStall =
          lot.floors[0].stalls.find((s) => s.status === 'available') || lot.floors[0].stalls[0];
      }
    }

    setBookingModalState({
      lot,
      stall: targetStall,
      initialDurationHours: historicalBooking.durationHours,
      initialVehicle: historicalBooking.vehicle,
      initialAddonIds: historicalBooking.addons?.map((a) => a.id) || [],
    });
  };

  const handleExtendBooking = (extraHours: number) => {
    if (!activeBooking) return;
    const currentEnd = new Date(activeBooking.endTime);
    const newEnd = new Date(currentEnd.getTime() + extraHours * 3600 * 1000);
    const newDuration = activeBooking.durationHours + extraHours;

    setActiveBooking({
      ...activeBooking,
      endTime: newEnd.toISOString(),
      durationHours: newDuration,
    });
  };

  const handleSelectAiRecommendedLot = (lotId: string, stallCode: string) => {
    const lot = parkingLots.find((l) => l.id === lotId);
    if (!lot) return;

    setSelectedLot(lot);
    let targetStall: ParkingStall | null = null;

    if (lot.floors) {
      for (const floor of lot.floors) {
        const stall = floor.stalls.find((s) => s.code === stallCode || s.id === stallCode);
        if (stall) {
          targetStall = stall;
          break;
        }
      }
    }

    setBookingModalState({
      lot,
      stall: targetStall || lot.floors?.[0]?.stalls[0] || null,
    });
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-800 dark:text-slate-100 font-sans antialiased flex flex-col transition-colors duration-200 relative">

      <GoogleMapsKeyBanner hasValidKey={hasValidKey} />

      <Header
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        activePreset={activePreset}
        setActivePreset={setActivePreset}
        mode={mode}
        setMode={setMode}
        activeBooking={activeBooking}
        onOpenActivePass={() => setIsActivePassOpen(true)}
        onOpenAiDrawer={() => setIsAiDrawerOpen(true)}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() =>
          setThemeConfig((prev) => ({
            ...prev,
            mode: isDarkMode ? 'light' : 'dark',
          }))
        }
        user={currentUser}
        onOpenLoginModal={() => (currentUser ? setIsLoginModalOpen(true) : navigate('/auth/signin'))}
        onOpenThemeCustomizer={() => setIsThemeModalOpen(true)}
      />

      {showFilters && mode === 'driver' && (
        <div className="bg-white/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 px-4 py-3.5 text-xs backdrop-blur-md shadow-xs animate-fade-in text-slate-800 dark:text-slate-200">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-5">

              <div className="flex items-center gap-2">
                <span className="text-slate-600 dark:text-slate-400 font-semibold">Max Rate:</span>
                <input
                  type="range"
                  min="30"
                  max="300"
                  step="5"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(parseFloat(e.target.value))}
                  className="w-24 accent-blue-600 cursor-pointer"
                />
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{formatINR(maxPrice)}/hr</span>
              </div>

              <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={evOnly}
                  onChange={(e) => setEvOnly(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-blue-600"
                />
                <span className="flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> EV Charger
                </span>
              </label>

              <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={coveredOnly}
                  onChange={(e) => setCoveredOnly(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-blue-600"
                />
                <span>Covered Parking</span>
              </label>

              <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={securityOnly}
                  onChange={(e) => setSecurityOnly(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-blue-600"
                />
                <span className="flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> 24/7 Security
                </span>
              </label>

              <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium cursor-pointer border-l border-slate-200 dark:border-slate-800 pl-4">
                <input
                  type="checkbox"
                  checked={dashboardViewTab === 'favorites'}
                  onChange={(e) => setDashboardViewTab(e.target.checked ? 'favorites' : 'all')}
                  className="w-3.5 h-3.5 rounded accent-rose-600"
                />
                <span className="flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-400">
                  <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" /> Favorites Only
                </span>
              </label>

              <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-4">
                <span className="text-slate-600 dark:text-slate-400 font-semibold flex items-center gap-1">
                  <ArrowUpDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Sort By:
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="recommended">Recommended</option>
                  <option value="price">Price: Low to High</option>
                  <option value="rating">Rating: High to Low</option>
                  <option value="spots">Spots: Most Free</option>
                  <option value="distance">Distance: Nearest</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => {
                setMaxPrice(10);
                setEvOnly(false);
                setCoveredOnly(false);
                setSecurityOnly(false);
                setSortBy('recommended');
                setDashboardViewTab('all');
              }}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 underline text-[11px] font-semibold self-end sm:self-auto cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 relative z-10">
        {mode === 'operator' ? (

          <OperatorDashboard
            parkingLots={parkingLots}
            onUpdateLot={(updated) => setParkingLots(updated)}
          />
        ) : (

          <>
            {activeBooking && (
              <UpcomingParkingCard
                booking={activeBooking}
                onOpenPass={() => setIsActivePassOpen(true)}
              />
            )}

            {recentBookings.length > 0 && (
              <div className="mb-4 sm:mb-5 lg:max-w-xl">
                <RecentBookings
                  bookings={recentBookings}
                  onRebook={handleRebook}
                  onViewPass={(booking) => {
                    setActiveBooking(booking);
                    setIsActivePassOpen(true);
                  }}
                />
              </div>
            )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:min-h-[700px]">

            <div className="lg:col-span-5 flex flex-col gap-4 min-w-0 lg:h-[750px]">

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <PillNav
                  hideLogo
                  compact
                  items={[
                    { label: <span className="flex items-center gap-1.5"><Compass className="w-3.5 h-3.5" />All Garages ({filteredLots.length})</span>, href: '#all', onClick: () => setDashboardViewTab('all'), ariaLabel: 'Show all garages' },
                    { label: <span className="flex items-center gap-1.5"><Heart className="w-3.5 h-3.5" />Favorites ({favoriteLots.length})</span>, href: '#favorites', onClick: () => setDashboardViewTab('favorites'), ariaLabel: 'Show favorites' },
                  ]}
                  activeHref={dashboardViewTab === 'all' ? '#all' : '#favorites'}
                  baseColor={isDarkMode ? '#1e293b' : '#e2e8f0'}
                  pillColor={isDarkMode ? '#0f172a' : '#ffffff'}
                  pillTextColor={isDarkMode ? '#94a3b8' : '#475569'}
                  hoveredPillTextColor={isDarkMode ? '#ffffff' : '#0f172a'}
                />

                <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <ArrowUpDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hidden sm:inline">
                    Sort:
                  </span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-transparent text-slate-800 dark:text-slate-200 text-xs font-bold focus:outline-none cursor-pointer pr-1"
                    title="Sort parking results"
                  >
                    <option value="recommended" className="bg-white dark:bg-slate-900">Recommended</option>
                    <option value="price" className="bg-white dark:bg-slate-900">Lowest Price</option>
                    <option value="rating" className="bg-white dark:bg-slate-900">Highest Rating</option>
                    <option value="spots" className="bg-white dark:bg-slate-900">Most Available</option>
                    <option value="distance" className="bg-white dark:bg-slate-900">Nearest Distance</option>
                  </select>
                </div>
              </div>

              {displayedLots.length === 0 ? (
                isParkingLoading || isLocationLoading ? (
                  <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-8 text-center space-y-3 my-auto">
                    <div className="mx-auto w-10 h-10 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
                    <h3 className="text-base font-bold text-slate-900">Searching nearby parking...</h3>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      Getting location, searching up to 20 km, and filtering by live parking inventory.
                    </p>
                  </div>
                ) : parkingLots.length === 0 && isApiError ? (
                  <div className="bg-white border border-rose-200 dark:border-rose-800/40 shadow-sm rounded-3xl p-8 text-center space-y-3 my-auto">
                    <div className="mx-auto w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-500 flex items-center justify-center">
                      <SearchX className="w-5 h-5" />
                    </div>
                    <h3 className="text-base font-bold text-rose-700 dark:text-rose-400">Google Places request failed</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                      Reason: <span className="font-mono font-bold">{parkingStatus || 'ERROR'}</span>
                    </p>
                    {parkingError && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto break-words">
                        {parkingError}
                      </p>
                    )}
                    <div className="text-left text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 max-w-xs mx-auto">
                      <p className="font-bold mb-1">Possible causes:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        <li>Invalid location or radius</li>
                        <li>Places API not enabled for this key</li>
                        <li>API key/HTTP referrer restrictions</li>
                        <li>Billing or quota exceeded</li>
                        <li>Malformed Google request parameter</li>
                      </ul>
                    </div>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                    >
                      Retry Search
                    </button>
                  </div>
                ) : parkingLots.length === 0 ? (
                  <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-8 text-center space-y-3 my-auto">
                    <SearchX className="w-10 h-10 text-slate-400 mx-auto" />
                    <h3 className="text-base font-bold text-slate-900">No parking found nearby.</h3>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      {parkingError || "No parking locations are currently available in Google's database for this area."}
                    </p>
                  </div>
                ) : dashboardViewTab === 'favorites' ? (
                  <div className="bg-white border border-slate-200 shadow-2xs rounded-3xl p-8 text-center space-y-3 my-auto">
                    <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-500 flex items-center justify-center mx-auto">
                      <Heart className="w-6 h-6 stroke-[2]" />
                    </div>
                    <h3 className="text-base font-extrabold text-slate-900">No favorite garages saved yet</h3>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto font-medium">
                      Click the heart icon on any parking garage card to save your most used spots for 1-click access.
                    </p>
                    <button
                      onClick={() => setDashboardViewTab('all')}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>Browse All Garages</span>
                    </button>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-8 text-center space-y-3 my-auto">
                    <SearchX className="w-10 h-10 text-slate-400 mx-auto" />
                    <h3 className="text-base font-bold text-slate-900">No parking spots match your filters</h3>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      Try adjusting your maximum hourly rate or clearing specific amenities.
                    </p>
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setMaxPrice(10);
                        setEvOnly(false);
                        setCoveredOnly(false);
                        setSecurityOnly(false);
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                    >
                      Clear All Filters
                    </button>
                  </div>
                )
              ) : (
                /* Pin offset is a fixed 40px, not "5%": this scroller's height is
                   content-driven, so a percentage scaled with list length and pushed
                   card 0 down ~105px on phones - sliding it under card 1 and burying
                   the blue "Book Now" CTA. 40px matches the offset desktop already
                   had (5% of the 750px panel = 37.5px), so the deck is unchanged there. */
                <ScrollStack
                  className="flex-1 min-h-0"
                  itemDistance={20}
                  itemStackDistance={10}
                  stackPosition="40px"
                  scaleEndPosition="0%"
                  baseScale={0.95}
                  itemScale={0.02}
                >
                  <AnimatePresence mode="popLayout">
                    {displayedLots.map((lot) => (
                      <ScrollStackItem key={lot.id} itemClassName="!h-auto !rounded-2xl !p-0">
                        <ParkingCard
                          lot={lot}
                          isSelected={selectedLot?.id === lot.id}
                          isFavorite={favoriteLotIds.includes(lot.id)}
                          onToggleFavorite={handleToggleFavorite}
                          onSelectLot={(l) => {
                            setSelectedLot(l);
                            setDetailModalLot(l);
                          }}
                          onQuickBook={(l) => {
                            setSelectedLot(l);
                            const freeStall = l.floors?.[0]?.stalls.find((s) => s.status === 'available') || null;
                            setBookingModalState({ lot: l, stall: freeStall });
                          }}
                          onNavigate={(l) => {
                            setSelectedLot(l);
                            setNavigationRequest(l);
                          }}
                        />
                      </ScrollStackItem>
                    ))}
                  </AnimatePresence>
                </ScrollStack>
              )}
            </div>

            <div className="lg:col-span-7 h-[320px] sm:h-[450px] lg:h-[750px] lg:sticky lg:top-20 min-w-0">
              <MapView
                parkingLots={displayedLots}
                selectedLot={selectedLot}
                onSelectLot={(lot) => setSelectedLot(lot)}
                onOpenLotDetails={(lot) => setDetailModalLot(lot)}
                searchQuery={searchQuery}
                searchCenter={searchCenterOverride}
                onSearchThisArea={setSearchCenterOverride}
                searchStatus={parkingStatus}
                isSearching={isParkingLoading}
                markersRendered={displayedLots.length}
                errorMessage={isApiError ? parkingError : null}
                liveUserLocation={userLocation}
                liveAccuracyMeters={accuracyMeters}
                onRetryLocation={retryLocation}
                navigationRequest={navigationRequest}
                onNavigationRequestHandled={() => setNavigationRequest(null)}
              />
            </div>
          </div>
          </>
        )}
      </main>

      <ParkingDetailModal
        lot={detailModalLot}
        onClose={() => setDetailModalLot(null)}
        onBookStall={(lot, stall) => {
          setDetailModalLot(null);
          setBookingModalState({ lot, stall });
        }}
        onNavigateToLot={(lot) => {
          setSelectedLot(lot);
          setNavigationRequest(lot);
        }}
      />

      {bookingModalState && (
        <BookingModal
          lot={bookingModalState.lot}
          stall={bookingModalState.stall}
          currentUser={currentUser}
          initialDurationHours={bookingModalState.initialDurationHours}
          initialVehicle={bookingModalState.initialVehicle}
          initialAddonIds={bookingModalState.initialAddonIds}
          onClose={() => setBookingModalState(null)}
          onBookingSuccess={handleBookingSuccess}
        />
      )}

      {isActivePassOpen && (
        <ActivePassModal
          booking={activeBooking}
          onClose={() => setIsActivePassOpen(false)}
          onExtendBooking={handleExtendBooking}
          onStartInternalNavigation={(booking) => {
            setIsActivePassOpen(false);
            const navLot: ParkingLot = {
              id: booking.lotId,
              placeId: booking.lotId,
              name: booking.lotName,
              displayName: booking.lotName,
              formattedAddress: booking.lotAddress,
              address: booking.lotAddress,
              city: '',
              lat: booking.lotLat,
              lng: booking.lotLng,
              dataSource: 'backend',
              isBookable: true,
              distanceKm: 0,
            };
            setSelectedLot(navLot);
            setNavigationRequest(navLot);
          }}
        />
      )}

      <AiAssistantDrawer
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
        parkingLots={parkingLots}
        onSelectRecommendedLot={handleSelectAiRecommendedLot}
      />

      <ThemeCustomizerModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
        themeConfig={themeConfig}
        onChangeThemeConfig={(newConfig) => setThemeConfig(newConfig)}
        onResetTheme={() =>
          setThemeConfig({
            mode: 'system',
            accent: 'blue',
            mapStyle: 'standard',
            density: 'comfortable',
            highContrast: false,
            reduceMotion: false,
          })
        }
      />

      <LoginModal
        isOpen={isLoginModalOpen}
        user={currentUser}
        canClose={Boolean(currentUser)}
        onLoginSuccess={(account) => {
          setCurrentUser(account);
          setIsLoginModalOpen(false);
        }}
        onLogout={() => {
          signOutUser().then(() => {
            localStorage.removeItem('parksmart_current_user');
            setCurrentUser(null);
            setIsLoginModalOpen(true);
          });
        }}
        onClose={() => {
          if (currentUser) {
            setIsLoginModalOpen(false);
          }
        }}
      />

      <div className="fixed bottom-5 right-5 z-40">
        <ThemeToggle
          variant="icon"
          defaultTheme={isDarkMode ? 'dark' : 'light'}
          duration={600}
          onThemeChange={(nextTheme) =>
            setThemeConfig((prev) => ({
              ...prev,
              mode: nextTheme,
            }))
          }
        />
      </div>
    </div>
  );
}
