import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import { ParkingLot } from '../types';
import { getFallbackDrivingEstimate, DrivingEstimate } from '../utils/distanceMatrix';
import { calculateHaversineKm, formatDistanceKm } from '../utils/distance';
import { getCurrentLocationOrFallback, LocationCoords } from '../services/locationService';
import { formatINRPerHour, formatINRPerDay } from '../utils/currency';
import { useMagicEffects } from '../hooks/useMagicEffects';
import {
  MapPin,
  Star,
  Zap,
  Shield,
  Navigation,
  ChevronRight,
  Heart,
  Car,
  Building2,
  Accessibility,
} from 'lucide-react';

interface Props {
  lot: ParkingLot;
  onSelectLot: (lot: ParkingLot) => void;
  onQuickBook: (lot: ParkingLot) => void;
  /** Opens the app's INTERNAL navigation mode for this lot (never external Google Maps). */
  onNavigate?: (lot: ParkingLot) => void;
  isSelected: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (lotId: string) => void;
}

const GENERIC_PARKING_IMAGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
      <rect width="400" height="300" fill="#e2e8f0"/>
      <rect x="50" y="60" width="300" height="180" rx="12" fill="#94a3b8"/>
      <rect x="80" y="90" width="80" height="120" rx="6" fill="#cbd5e1"/>
      <rect x="180" y="90" width="80" height="120" rx="6" fill="#cbd5e1"/>
      <rect x="280" y="90" width="40" height="120" rx="6" fill="#cbd5e1"/>
      <text x="200" y="45" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="bold" fill="#475569">P</text>
    </svg>`
  );

function Badge({ children, className = '', key: badgeKey }: { children: React.ReactNode; className?: string; key?: React.Key }) {
  return (
    <span key={badgeKey} className={`inline-flex items-center gap-1 max-w-full min-w-0 overflow-hidden box-border px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/60 border border-slate-200 dark:border-white/[0.08] ${className}`}>
      {children}
    </span>
  );
}

export const ParkingCard: React.FC<Props> = ({
  lot,
  onSelectLot,
  onQuickBook,
  onNavigate,
  isSelected,
  isFavorite = false,
  onToggleFavorite,
}) => {
  const [drivingEstimate, setDrivingEstimate] = useState<DrivingEstimate | null>(null);
  const [deviceDistanceKm, setDeviceDistanceKm] = useState<number | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const magicRef = useMagicEffects<HTMLDivElement>({
    enableParticles: true,
    enableTilt: true,
    enableMagnetism: true,
    enableClickRipple: true,
    enableGlow: true,
    particleCount: 6,
    glowColor: '37, 99, 235',
  });
  const cardRef = useRef<HTMLDivElement>(null);

  const mergedRef = useCallback((node: HTMLDivElement | null) => {
    cardRef.current = node;
    (magicRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [magicRef]);

  useEffect(() => {
    let isMounted = true;
    getCurrentLocationOrFallback().then((origin) => {
      if (!isMounted) return;
      const dist = calculateHaversineKm(origin.lat, origin.lng, lot.lat, lot.lng);
      if (isMounted) setDeviceDistanceKm(dist);
      // Local straight-line estimate only — no Google routing here (quota-safe).
      const est = getFallbackDrivingEstimate(origin, { lat: lot.lat, lng: lot.lng });
      if (isMounted) setDrivingEstimate(est);
    });
    return () => { isMounted = false; };
  }, [lot.id, lot.lat, lot.lng]);

  const hasPrice = lot.pricePerHour !== undefined;
  const hasAvailability = lot.availableSpots !== undefined;
  const hasRating = lot.rating !== undefined;
  const hasReviewCount = lot.userRatingCount !== undefined;
  const hasImage = lot.imageUrl !== undefined && lot.imageUrl !== '';
  const isOpen = lot.currentOpeningHours?.openNow === true;

  const badges = useMemo(() => {
    const b: { key: string; icon?: React.ReactNode; label: string; className?: string }[] = [];

    if (lot.evChargersCount !== undefined && lot.evChargersCount > 0) {
      b.push({ key: 'ev', icon: <Zap className="w-3 h-3" />, label: `${lot.evChargersCount} EV`, className: '!bg-emerald-50 dark:!bg-emerald-500/10 !text-emerald-700 dark:!text-emerald-400 !border-emerald-200 dark:!border-emerald-500/30' });
    }
    if (lot.isCovered) {
      b.push({ key: 'covered', label: 'Covered' });
    }
    if (lot.hasSecurity) {
      b.push({ key: 'security', icon: <Shield className="w-3 h-3" />, label: 'Security', className: '!bg-blue-50 dark:!bg-blue-500/10 !text-blue-700 dark:!text-blue-400 !border-blue-200 dark:!border-blue-500/30' });
    }
    if (lot.hasValet) {
      b.push({ key: 'valet', label: 'Valet' });
    }
    if (lot.wheelchairAccessible) {
      b.push({ key: 'access', icon: <Accessibility className="w-3 h-3" />, label: 'Accessible', className: '!bg-indigo-50 dark:!bg-indigo-500/10 !text-indigo-700 dark:!text-indigo-400 !border-indigo-200 dark:!border-indigo-500/30' });
    }
    if (lot.operator) {
      b.push({ key: 'operator', icon: <Building2 className="w-3 h-3" />, label: lot.operator });
    }
    if (isOpen) {
      b.push({ key: 'open', label: 'Open now', className: '!bg-emerald-50 dark:!bg-emerald-500/10 !text-emerald-700 dark:!text-emerald-400 !border-emerald-200 dark:!border-emerald-500/30' });
    }
    return b;
  }, [lot]);

  return (
    <motion.div
      ref={mergedRef}
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ layout: { type: 'spring', damping: 28, stiffness: 280 }, opacity: { duration: 0.2 }, scale: { duration: 0.2 } }}
      onClick={() => onSelectLot(lot)}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${lot.name}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectLot(lot); } }}
      style={{ '--glow-x': '50%', '--glow-y': '50%', '--glow-intensity': '0', '--glow-radius': '250px' } as React.CSSProperties}
      className={`magic-card group relative flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-4 sm:gap-5 w-full max-w-full min-w-0 box-border min-h-[220px] rounded-[20px] p-5 cursor-pointer transition-shadow duration-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
        isSelected
          ? 'bg-blue-50 dark:bg-[color-mix(in_srgb,var(--color-accent,#2563eb)_10%,#0f172a)] border border-blue-300 dark:border-[color-mix(in_srgb,var(--color-accent,#2563eb)_35%,transparent)] shadow-lg dark:shadow-[0_4px_24px_color-mix(in_srgb,var(--color-accent,#2563eb)_12%,transparent)]'
          : 'bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] hover:shadow-md dark:hover:shadow-lg'
      }`}
    >
      {/* Bookmark button - top right */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(lot.id); }}
        className={`absolute top-3 right-3 z-10 p-2 rounded-full transition-all cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center backdrop-blur-md ${
          isFavorite
            ? 'bg-rose-50 dark:bg-rose-500/20 border border-rose-200 dark:border-rose-500/40'
            : 'bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-white/[0.1]'
        }`}
        title={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
        aria-label={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
      >
        <Heart className={`w-4 h-4 ${isFavorite ? 'fill-rose-500 text-rose-500' : 'text-slate-400 dark:text-slate-500'}`} />
      </button>

      {/* Image section */}
      <div className="relative w-full max-w-full min-w-0 box-border sm:w-[220px] lg:w-full xl:w-[220px] h-[160px] sm:h-auto lg:h-[160px] xl:h-auto rounded-2xl overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800">
        {hasImage && !imgFailed ? (
          <img
            src={lot.imageUrl!}
            alt={lot.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              console.warn(`[ParkingCard] Image load failed for "${lot.name}":`, lot.imageUrl);
              setImgFailed(true);
            }}
          />
        ) : (
          <img
            src={GENERIC_PARKING_IMAGE}
            alt={`${lot.name} parking`}
            className="w-full h-full object-cover"
          />
        )}

        {/* Rating badge on image */}
        {hasRating && (
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-white/90 dark:bg-slate-900/85 backdrop-blur-md border border-white/60 dark:border-white/10 text-slate-800 dark:text-slate-50">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>{lot.rating}</span>
            {hasReviewCount && <span className="text-slate-400 dark:text-slate-500 text-[10px]">({lot.userRatingCount})</span>}
          </div>
        )}

        {/* Driving time badge on image */}
        <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold bg-white/90 dark:bg-slate-900/85 backdrop-blur-md border border-white/60 dark:border-white/10">
          <Car className="w-3 h-3 text-blue-600 dark:text-blue-400" />
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
            {drivingEstimate ? `~${drivingEstimate.durationText} (straight-line)` : '...'}
          </span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span className="text-slate-600 dark:text-slate-300">{deviceDistanceKm !== null ? `${deviceDistanceKm.toFixed(1)} km` : '...'}</span>
        </div>
      </div>

      {/* Content section */}
      <div className="flex-1 min-w-0 w-full max-w-full box-border flex flex-col gap-3">
        {/* Name + Price row */}
        <div className="flex items-start justify-between gap-3 min-w-0 sm:pr-8 lg:pr-0 xl:pr-8">
          <div className="min-w-0 flex-1">
            <h3
              className="text-[15px] font-bold text-slate-900 dark:text-white leading-snug transition-colors group-hover:text-blue-600 dark:group-hover:text-blue-400 [overflow-wrap:anywhere]"
              style={{
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {lot.name}
            </h3>
            <p
              className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 mt-1 [overflow-wrap:anywhere]"
              style={{
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              <MapPin className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
              <span>{lot.address}</span>
            </p>
          </div>

          {hasPrice && (
            <div className="text-right shrink-0">
              <div className="text-base font-extrabold text-blue-600 dark:text-blue-400 whitespace-nowrap leading-tight">
                {formatINRPerHour(lot.pricePerHour)}
              </div>
              {lot.dailyMaxPrice !== undefined && (
                <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap">
                  {formatINRPerDay(lot.dailyMaxPrice)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Availability */}
        {hasAvailability && (
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${lot.availableSpots! <= 5 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
            <span className="text-xs font-semibold">
              <span className={lot.availableSpots! <= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                {lot.availableSpots}
              </span>
              <span className="text-slate-500 dark:text-slate-400"> spots available</span>
            </span>
          </div>
        )}

        {/* Badges */}
        {badges.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 min-w-0 w-full max-w-full">
            {badges.map((b) => (
              <Badge key={b.key} className={b.className || ''}>
                {b.icon}
                <span className="truncate min-w-0 max-w-full">{b.label}</span>
              </Badge>
            ))}
          </div>
        )}

        {/* Spacer to push buttons to bottom */}
        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full min-w-0 max-w-full pt-2 border-t border-slate-100 dark:border-white/[0.06]">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelectLot(lot); }}
            className="flex-none max-w-full box-border flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer min-h-[36px] bg-slate-100 dark:bg-white/[0.08] text-slate-700 dark:text-white/80 border border-slate-200 dark:border-white/[0.1] hover:bg-slate-200 dark:hover:bg-white/[0.12]"
            aria-label={`View details for ${lot.name}`}
          >
            Details
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate?.(lot);
            }}
            className="flex-none max-w-full box-border flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer min-h-[36px] bg-slate-100 dark:bg-white/[0.08] text-slate-700 dark:text-white/80 border border-slate-200 dark:border-white/[0.1] hover:bg-slate-200 dark:hover:bg-white/[0.12]"
            aria-label={`Navigate to ${lot.name}`}
          >
            <Navigation className="w-3.5 h-3.5" />
            Navigate
          </button>

          {lot.isBookable && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onQuickBook(lot); }}
              className="flex-none max-w-full box-border ml-auto px-4 py-2 rounded-xl text-xs font-bold text-white transition-all cursor-pointer min-h-[36px] bg-[var(--color-accent,#2563eb)] hover:opacity-90"
              aria-label={`Book ${lot.name}`}
            >
              Book Now
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
