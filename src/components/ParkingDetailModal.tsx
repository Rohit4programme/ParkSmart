import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ParkingLot, ParkingStall } from '../types';
import { getFallbackDrivingEstimate, DrivingEstimate } from '../utils/distanceMatrix';
import { getCurrentLocationOrFallback } from '../services/locationService';
import { formatINRPerHour, formatINRPerDay } from '../utils/currency';
import { ReviewSection } from './ReviewSection';
import {
  X,
  Star,
  MapPin,
  Shield,
  Zap,
  Car,
  Clock,
  Ruler,
  Navigation,
  Building2,
  Accessibility,
  Info,
  CheckCircle2,
  DollarSign,
  Users,
} from 'lucide-react';

interface Props {
  lot: ParkingLot | null;
  onClose: () => void;
  onBookStall: (lot: ParkingLot, stall: ParkingStall) => void;
  /** Starts the app's INTERNAL navigation mode. Required — no external Maps fallback exists. */
  onNavigateToLot: (lot: ParkingLot) => void;
}

const GENERIC_PARKING_IMAGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
      <rect width="800" height="400" fill="#e2e8f0"/>
      <rect x="100" y="80" width="600" height="240" rx="16" fill="#94a3b8"/>
      <rect x="150" y="120" width="150" height="160" rx="8" fill="#cbd5e1"/>
      <rect x="330" y="120" width="150" height="160" rx="8" fill="#cbd5e1"/>
      <rect x="510" y="120" width="90" height="160" rx="8" fill="#cbd5e1"/>
      <text x="400" y="60" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#475569">P</text>
      <text x="400" y="360" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#64748b">No image available</text>
    </svg>`
  );

export const ParkingDetailModal: React.FC<Props> = ({
  lot,
  onClose,
  onBookStall,
  onNavigateToLot,
}) => {
  return (
    <AnimatePresence>
      {lot && (
        <ParkingDetailModalContent
          key={lot.id}
          lot={lot}
          onClose={onClose}
          onBookStall={onBookStall}
          onNavigateToLot={onNavigateToLot}
        />
      )}
    </AnimatePresence>
  );
};

const ParkingDetailModalContent: React.FC<{
  lot: ParkingLot;
  onClose: () => void;
  onBookStall: (lot: ParkingLot, stall: ParkingStall) => void;
  onNavigateToLot?: (lot: ParkingLot) => void;
}> = ({ lot, onClose, onBookStall, onNavigateToLot }) => {
  const [drivingEstimate, setDrivingEstimate] = useState<DrivingEstimate | null>(null);
  const [activeFloorIndex, setActiveFloorIndex] = useState(0);

  useEffect(() => {
    let isMounted = true;
    getCurrentLocationOrFallback().then((origin) => {
      if (!isMounted) return;
      // Local straight-line estimate only — no Google routing here (quota-safe).
      const est = getFallbackDrivingEstimate(origin, { lat: lot.lat, lng: lot.lng });
      if (isMounted) setDrivingEstimate(est);
    });

    return () => {
      isMounted = false;
    };
  }, [lot.id, lot.lat, lot.lng]);

  const handleNavigateToLot = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Always use the app's internal navigation — never open external Google Maps.
    if (onNavigateToLot) {
      onNavigateToLot(lot);
      onClose();
    }
  };

  const hasImage = lot.imageUrl !== undefined && lot.imageUrl !== '';
  const hasPrice = lot.pricePerHour !== undefined;
  const hasAvailability = lot.availableSpots !== undefined;
  const hasRating = lot.rating !== undefined;
  const hasReviewCount = lot.reviewCount !== undefined;
  const hasCapacity = lot.capacity !== undefined;
  const hasOpeningHours = lot.openingHours !== undefined;
  const hasWheelchair = lot.wheelchairAccessible !== undefined;
  const hasOperator = lot.operator !== undefined;
  const hasFee = lot.fee !== undefined;
  const hasEvChargers = lot.evChargersCount !== undefined;
  const hasDisabledSpots = lot.disabledSpotsCount !== undefined;
  const hasCovered = lot.isCovered !== undefined;
  const has24x7 = lot.is24x7 !== undefined;
  const hasSecurity = lot.hasSecurity !== undefined;
  const hasValet = lot.hasValet !== undefined;
  const hasSurface = lot.surface !== undefined;
  const hasAccess = lot.access !== undefined;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >

        <div className="relative h-48 sm:h-56 shrink-0 bg-slate-100">
          <img src={hasImage ? lot.imageUrl! : GENERIC_PARKING_IMAGE} alt={lot.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/30 to-transparent" />

          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-white/90 hover:bg-white text-slate-700 rounded-full backdrop-blur-md border border-slate-200 shadow-sm transition-all cursor-pointer z-10"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="absolute bottom-4 left-4 sm:left-6 right-4 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {hasAvailability && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500 text-white shadow-xs">
                    {lot.availableSpots} Spots Free
                  </span>
                )}
                {hasRating && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/90 text-slate-800 flex items-center gap-1 shadow-xs border border-white/50">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {lot.rating}
                    {hasReviewCount && <span className="text-slate-500">({lot.reviewCount} reviews)</span>}
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-600/90 text-white flex items-center gap-1 shadow-xs border border-blue-400/50 backdrop-blur-md">
                  <Car className="w-3 h-3 text-blue-200" />
                  <span>
                    {drivingEstimate ? `~${drivingEstimate.durationText} (straight-line)` : 'Calculating estimate...'}
                  </span>
                </span>
                <button
                  onClick={handleNavigateToLot}
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-600/90 hover:bg-emerald-500 text-white flex items-center gap-1 shadow-xs border border-emerald-400/50 backdrop-blur-md transition-all cursor-pointer"
                  title="Open turn-by-turn directions in native Maps application"
                >
                  <Navigation className="w-3 h-3 text-emerald-100" />
                  <span>Navigate to Lot</span>
                </button>
              </div>
              <h2 className="text-2xl font-black text-white drop-shadow-xs">{lot.name}</h2>
              <p className="text-xs text-slate-200 font-medium flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-blue-400" />
                <span>{lot.address}{lot.city ? `, ${lot.city}` : ''}</span>
              </p>
            </div>

            <div className="text-left sm:text-right">
              {hasPrice ? (
                <>
                  <div className="text-2xl font-black text-white">
                    {formatINRPerHour(lot.pricePerHour)}
                  </div>
                  {lot.dailyMaxPrice !== undefined && (
                    <div className="text-xs text-slate-300 font-medium">Daily Max: {formatINRPerDay(lot.dailyMaxPrice)}</div>
                  )}
                </>
              ) : (
                <div className="text-xs text-slate-300 font-medium max-w-[180px]">
                  Pricing not provided by operator.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50">

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
            <div className="bg-blue-50/80 p-3 rounded-xl border border-blue-200/80 shadow-2xs flex items-center gap-2.5">
              <div className="p-2 bg-blue-600 rounded-lg text-white shrink-0 shadow-2xs">
                <Car className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-blue-700 block text-[10px] font-bold uppercase tracking-wider">Driving ETA</span>
                <span className="font-extrabold text-blue-900 truncate block text-xs">
                  {drivingEstimate ? `~${drivingEstimate.durationText}` : 'Straight-line estimate'}
                </span>
              </div>
            </div>

            {hasCapacity && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-600 shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">Capacity</span>
                  <span className="font-bold text-slate-800">{lot.capacity} Spots</span>
                </div>
              </div>
            )}

            {hasEvChargers && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600 shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">EV Charging</span>
                  <span className="font-bold text-slate-800">{lot.evChargersCount} Ports</span>
                </div>
              </div>
            )}

            {hasSecurity && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">Security</span>
                  <span className="font-bold text-slate-800">Available</span>
                </div>
              </div>
            )}

            {hasOpeningHours && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
                <div className="p-2 bg-amber-50 rounded-lg text-amber-600 shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">Hours</span>
                  <span className="font-bold text-slate-800 text-[11px]">{lot.openingHours}</span>
                </div>
              </div>
            )}

            {hasWheelchair && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 shrink-0">
                  <Accessibility className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">Accessible</span>
                  <span className="font-bold text-slate-800">{lot.wheelchairAccessible ? 'Yes' : 'No'}</span>
                </div>
              </div>
            )}

            {hasOperator && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-lg text-slate-600 shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">Operator</span>
                  <span className="font-bold text-slate-800 text-[11px]">{lot.operator}</span>
                </div>
              </div>
            )}

            {hasFee && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600 shrink-0">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">Fee</span>
                  <span className="font-bold text-slate-800">{lot.fee === 'yes' ? 'Paid' : lot.fee === 'no' ? 'Free' : lot.fee}</span>
                </div>
              </div>
            )}

            {hasCovered && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-lg text-slate-600 shrink-0">
                  <Info className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">Covered</span>
                  <span className="font-bold text-slate-800">{lot.isCovered ? 'Yes' : 'No'}</span>
                </div>
              </div>
            )}

            {hasSurface && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-lg text-slate-600 shrink-0">
                  <Info className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">Surface</span>
                  <span className="font-bold text-slate-800 capitalize">{lot.surface}</span>
                </div>
              </div>
            )}

            {hasAccess && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-lg text-slate-600 shrink-0">
                  <Info className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">Access</span>
                  <span className="font-bold text-slate-800 capitalize">{lot.access}</span>
                </div>
              </div>
            )}
          </div>

          <ReviewSection lot={lot} />

          {lot.isBookable && lot.floors && lot.floors.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Car className="w-4 h-4 text-blue-600" /> Select Floor & Stall
                </h3>
              </div>

              <div className="flex items-center gap-2 border-b border-slate-200 pb-2 flex-wrap">
                {lot.floors.map((floor, index) => (
                  <button
                    key={floor.id}
                    onClick={() => setActiveFloorIndex(index)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${index === activeFloorIndex
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                  >
                    <span>{floor.name}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${index === activeFloorIndex ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {floor.availableStalls} free
                    </span>
                  </button>
                ))}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                  {lot.floors[activeFloorIndex]?.stalls.map((stall) => {
                    const isAvailable = stall.status === 'available';
                    const stallPrice = lot.pricePerHour !== undefined
                      ? Math.round(lot.pricePerHour * (1 + (stall.priceModifier ?? 0)))
                      : undefined;
                    return (
                      <button
                        key={stall.id}
                        disabled={!isAvailable}
                        onClick={() => onBookStall(lot, stall)}
                        className={`p-2 rounded-xl border flex flex-col items-center justify-between min-h-[76px] transition-all relative group ${isAvailable
                          ? 'bg-emerald-50/80 border-emerald-300 text-emerald-800 hover:border-emerald-500 cursor-pointer'
                          : 'bg-slate-100 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'
                          }`}
                      >
                        <span className={`font-mono font-bold text-xs ${isAvailable ? 'text-slate-700' : 'text-slate-400'}`}>
                          {stall.code}
                        </span>
                        <span className={`text-[10px] font-extrabold tracking-wider uppercase ${isAvailable ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {isAvailable ? 'Free' : stall.status}
                        </span>
                        {isAvailable && stallPrice !== undefined && (
                          <span className="text-[9px] font-mono text-slate-500">
                            {formatINRPerHour(stallPrice)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                <Info className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Floor plan not available for this lot.</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="text-xs text-slate-500 font-medium block">Parking Information:</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-900">
                {lot.name}
              </span>
              <span className="text-xs text-slate-500 font-semibold">
                ({lot.distanceKm} km away)
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={handleNavigateToLot}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer w-full sm:w-auto"
              title="Open turn-by-turn directions in native Maps application"
            >
              <Navigation className="w-3.5 h-3.5 text-emerald-400" />
              <span>Navigate to Lot</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer w-full sm:w-auto"
            >
              Close
            </button>

            {lot.isBookable && (
              <button
                onClick={() => {
                  const freeStall = lot.floors?.[activeFloorIndex]?.stalls.find((s) => s.status === 'available');
                  if (freeStall) {
                    onBookStall(lot, freeStall);
                  }
                }}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Book This Lot</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};