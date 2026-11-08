import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Sparkles,
  Ticket,
  Building2,
  Car,
  Search,
  SlidersHorizontal,
  User,
  ShieldCheck,
  Lock,
  Palette,
} from 'lucide-react';
import { Booking, UserAccount } from '../types';
import PillNav from './PillNav';
import NotificationsBell from './NotificationsBell';

interface Props {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activePreset: string;
  setActivePreset: (preset: string) => void;
  mode: 'driver' | 'operator';
  setMode: (mode: 'driver' | 'operator') => void;
  activeBooking: Booking | null;
  onOpenActivePass: () => void;
  onOpenAiDrawer: () => void;
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  user: UserAccount | null;
  onOpenLoginModal: () => void;
  onOpenThemeCustomizer?: () => void;
}

export const PRESET_LOCATIONS: { name: string; query: string }[] = [];

export const Header: React.FC<Props> = ({
  searchQuery,
  setSearchQuery,
  activePreset,
  setActivePreset,
  mode,
  setMode,
  activeBooking,
  onOpenActivePass,
  onOpenAiDrawer,
  showFilters,
  setShowFilters,
  isDarkMode,
  onToggleDarkMode,
  user,
  onOpenLoginModal,
  onOpenThemeCustomizer,
}) => {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState(searchQuery);
  const navBg = isDarkMode ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.4)';
  const pillBg = isDarkMode ? 'rgba(234, 179, 8, 0.9)' : 'rgba(234, 179, 8, 0.85)';
  const pillText = '#ffffff';
  const pillHoverText = '#ffffff';

  const handleSearch = () => {
    setSearchQuery(inputValue);
    setActivePreset('');
  };

  const handleClear = () => {
    setInputValue('');
    setSearchQuery('');
    setActivePreset('');
  };

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/30 dark:bg-slate-900/30 border-b border-white/20 dark:border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.06)] transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        {/*
          `lg:flex-wrap` + `lg:flex-[1_1_24rem]` on the search group below: at
          1024-1099px the three groups (logo + search + right nav) sum to ~1043px
          against a 976px content box, so the right nav used to poke 32px past the
          viewport and get cropped. Wrapping lets the nav drop to a second line and
          gives the search field a usable 445px instead of 122px. From 1100px up the
          hypothetical sizes fit, so the single-row desktop header is unchanged.
        */}
        <div className="flex flex-col lg:flex-row lg:flex-wrap items-center justify-between gap-3">

          {/* Logo */}
          <div className="flex items-center gap-1.5 shrink-0">
            <img src="/assets/logo.svg" alt="ParkSmart" className="h-7 w-auto" />
            <div className="leading-tight">
              <div className="text-sm font-black text-slate-900 dark:text-white tracking-tight">
                Park<span className="text-yellow-600 dark:text-yellow-400">Smart</span>
              </div>
            </div>
          </div>

          {/* Search + Filters + AI */}
          {mode === 'driver' && (
            <div className="flex-1 lg:flex-[1_1_24rem] max-w-2xl w-full flex flex-col sm:flex-row items-center gap-2">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                  placeholder="Search destination, street address or landmark..."
                  className="w-full pl-10 pr-20 py-2 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-white/30 dark:border-white/10 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:bg-white/70 dark:focus:bg-slate-800/70 focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/50 transition-all font-medium"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {inputValue && (
                    <button
                      onClick={handleClear}
                      className="px-2 py-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-semibold cursor-pointer rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-all"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={handleSearch}
                    className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                    aria-label="Search"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Search</span>
                  </button>
                </div>
              </div>

              <PillNav
                hideLogo
                compact
                items={[
                  { label: <span className="flex items-center gap-1.5"><SlidersHorizontal className="w-3.5 h-3.5" />Filters</span>, href: '#filters', onClick: () => setShowFilters(!showFilters), ariaLabel: 'Toggle filters' },
                  { label: <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 fill-current" />AI Smart Finder</span>, href: '#ai', onClick: onOpenAiDrawer, ariaLabel: 'AI Smart Finder' },
                ]}
                activeHref={showFilters ? '#filters' : ''}
                baseColor={navBg}
                pillColor={pillBg}
                pillTextColor={pillText}
                hoveredPillTextColor={pillHoverText}
              />
            </div>
          )}

          {/* Right side nav */}
          <div className="hidden lg:flex items-center gap-2">
            <NotificationsBell />
            <PillNav
              hideLogo
              compact
              items={[
                { label: <span className="flex items-center gap-1.5"><Car className="w-3.5 h-3.5" />Driver</span>, href: '#driver', onClick: () => setMode('driver'), ariaLabel: 'Switch to Driver mode' },
                { label: <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />Garage Host</span>, href: '#operator', onClick: () => setMode('operator'), ariaLabel: 'Switch to Garage Host mode' },
              ]}
              activeHref={mode === 'driver' ? '#driver' : '#operator'}
              baseColor={navBg}
              pillColor={pillBg}
              pillTextColor={pillText}
              hoveredPillTextColor={pillHoverText}
            />

            <PillNav
              hideLogo
              compact
              items={[
                {
                  label: <span className="flex items-center gap-1.5"><Ticket className="w-3.5 h-3.5" />My Bookings</span>,
                  href: '/user/bookings',
                  onClick: () => navigate('/user/bookings'),
                  ariaLabel: 'Open my bookings'
                },
                ...(mode === 'operator' ? [{
                  label: <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />Verify Booking</span>,
                  href: '/owner/verify',
                  onClick: () => navigate('/owner/verify'),
                  ariaLabel: 'Verify a booking QR code'
                }] : []),
                {
                  label: user ? (
                    <span className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-lg bg-yellow-500 text-white font-extrabold text-[10px] flex items-center justify-center">{user.name.charAt(0).toUpperCase()}</div>
                      {user.name.split(' ')[0]}
                      <ShieldCheck className="w-3.5 h-3.5 text-yellow-300" />
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />Login</span>
                  ),
                  href: '#login',
                  onClick: onOpenLoginModal,
                  ariaLabel: user ? 'Open profile' : 'Login'
                },
                ...(onOpenThemeCustomizer ? [{
                  label: <span className="flex items-center gap-1.5"><Palette className="w-3.5 h-3.5" />Theme</span>,
                  href: '#theme',
                  onClick: onOpenThemeCustomizer,
                  ariaLabel: 'Customize theme'
                }] : []),
              ]}
              baseColor={navBg}
              pillColor={pillBg}
              pillTextColor={pillText}
              hoveredPillTextColor={pillHoverText}
            />

            {activeBooking && mode === 'driver' && (
              <button
                onClick={onOpenActivePass}
                className="px-3 py-1.5 bg-yellow-100/80 dark:bg-yellow-950/60 backdrop-blur-md border border-yellow-300/50 dark:border-yellow-800/50 hover:bg-yellow-200/80 dark:hover:bg-yellow-900/80 text-yellow-800 dark:text-yellow-300 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer"
              >
                <div className="w-2 h-2 rounded-full bg-yellow-500 animate-ping" />
                <Ticket className="w-4 h-4 text-yellow-700 dark:text-yellow-400" />
                <span>Pass #{activeBooking.id}</span>
              </button>
            )}
          </div>

          {/* Mobile buttons */}
          <div className="flex lg:hidden items-center gap-2">
            <NotificationsBell />
            <button
              onClick={onOpenLoginModal}
              className="p-2 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/30 dark:border-white/10 text-yellow-700 dark:text-yellow-300 rounded-lg text-xs font-medium cursor-pointer"
            >
              {user ? <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <User className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setMode(mode === 'driver' ? 'operator' : 'driver')}
              className="p-2 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/30 dark:border-white/10 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium cursor-pointer"
            >
              {mode === 'driver' ? <Building2 className="w-4 h-4" /> : <Car className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Hotspots */}
        {mode === 'driver' && PRESET_LOCATIONS.length > 0 && (
          <div className="flex items-center gap-2 mt-2.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0">
              <MapPin className="w-3 h-3 text-yellow-600 dark:text-yellow-400" /> Hotspots:
            </span>
            {PRESET_LOCATIONS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => {
                  if (activePreset === preset.name) { setActivePreset(''); setSearchQuery(''); }
                  else { setActivePreset(preset.name); setSearchQuery(preset.query); }
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${activePreset === preset.name
                    ? 'bg-yellow-500 text-white font-bold shadow-xs'
                    : 'bg-white/40 dark:bg-slate-800/40 backdrop-blur-md text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60 border border-white/30 dark:border-white/10'
                  }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
};
