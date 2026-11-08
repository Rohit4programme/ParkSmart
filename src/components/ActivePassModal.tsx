import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Booking } from '../types';
import { getCurrentLocationOrFallback, KOLKATA_FALLBACK } from '../services/locationService';
import { QrTicket } from './QrTicket';
import {
  X,
  QrCode,
  Clock,
  MapPin,
  Car,
  Navigation,
  Plus,
  Compass,
  CheckCircle2,
  AlertCircle,
  Camera,
  FileText,
  LocateFixed,
  ExternalLink,
  Footprints,
} from 'lucide-react';

interface Props {
  booking: Booking | null;
  onClose: () => void;
  onExtendBooking: (hours: number) => void;
  /** Starts the app's INTERNAL navigation mode to the booked lot (never external maps). */
  onStartInternalNavigation?: (booking: Booking) => void;
}

export const ActivePassModal: React.FC<Props> = (props) => {
  return (
    <AnimatePresence>
      {props.booking && (
        <ActivePassModalContent
          key={props.booking.id}
          {...props}
          booking={props.booking}
        />
      )}
    </AnimatePresence>
  );
};

const ActivePassModalContent: React.FC<Omit<Props, 'booking'> & { booking: Booking }> = ({
  booking,
  onClose,
  onExtendBooking,
  onStartInternalNavigation,
}) => {

  const [activeTab, setActiveTab] = useState<'qr_pass' | 'find_car'>('qr_pass');
  const [carNote, setCarNote] = useState<string>('Parked near Pillar A-12 close to North Elevator');

  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [travelMode, setTravelMode] = useState<'driving' | 'walking'>('driving');
  const [etaResult, setEtaResult] = useState<{
    distanceMiles: number;
    durationMins: number;
    arrivalTime: string;
    userLat?: number;
    userLng?: number;
    isUsingFallbackLocation?: boolean;
  } | null>(null);

  const handleGetDirections = () => {
    setIsLocating(true);

    const calculateEtaForCoords = (userLat: number, userLng: number, isFallback = false) => {
      const destinationLat = booking.lotLat || KOLKATA_FALLBACK.lat;
      const destinationLng = booking.lotLng || KOLKATA_FALLBACK.lng;

      const R = 3958.8;
      const dLat = ((destinationLat - userLat) * Math.PI) / 180;
      const dLng = ((destinationLng - userLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((userLat * Math.PI) / 180) *
          Math.cos((destinationLat * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      let distMiles = R * c;

      if (isNaN(distMiles) || distMiles < 0.1) {
        distMiles = 1.2;
      }

      const speedMph = travelMode === 'driving' ? 24 : 3.1;
      const baseMins = (distMiles / speedMph) * 60;
      const totalMins = travelMode === 'driving' ? Math.max(3, Math.round(baseMins + 2)) : Math.max(2, Math.round(baseMins));

      const arrival = new Date(Date.now() + totalMins * 60 * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      setEtaResult({
        distanceMiles: parseFloat(distMiles.toFixed(1)),
        durationMins: totalMins,
        arrivalTime: arrival,
        userLat,
        userLng,
        isUsingFallbackLocation: isFallback,
      });
      setIsLocating(false);
    };

    getCurrentLocationOrFallback()
      .then((location) => {
        calculateEtaForCoords(location.lat, location.lng, false);
      })
      .catch(() => {
        calculateEtaForCoords(KOLKATA_FALLBACK.lat, KOLKATA_FALLBACK.lng, true);
      });
  };

  useEffect(() => {
    if (etaResult) {
      const userLat = etaResult.userLat || KOLKATA_FALLBACK.lat;
      const userLng = etaResult.userLng || KOLKATA_FALLBACK.lng;
      const destinationLat = booking.lotLat || KOLKATA_FALLBACK.lat;
      const destinationLng = booking.lotLng || KOLKATA_FALLBACK.lng;

      const R = 3958.8;
      const dLat = ((destinationLat - userLat) * Math.PI) / 180;
      const dLng = ((destinationLng - userLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((userLat * Math.PI) / 180) *
          Math.cos((destinationLat * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      let distMiles = R * c;
      if (isNaN(distMiles) || distMiles < 0.1) distMiles = 1.2;

      const speedMph = travelMode === 'driving' ? 24 : 3.1;
      const baseMins = (distMiles / speedMph) * 60;
      const totalMins = travelMode === 'driving' ? Math.max(3, Math.round(baseMins + 2)) : Math.max(2, Math.round(baseMins));

      const arrival = new Date(Date.now() + totalMins * 60 * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      setEtaResult((prev) =>
        prev
          ? {
              ...prev,
              distanceMiles: parseFloat(distMiles.toFixed(1)),
              durationMins: totalMins,
              arrivalTime: arrival,
            }
          : null
      );
    }
  }, [travelMode]);

  const handleOpenInternalNavigation = () => {
    if (onStartInternalNavigation) {
      onStartInternalNavigation(booking);
      return;
    }
    // Last-resort fallback: compute a quick ETA locally, never open external maps.
  };

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
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        
        <div className="p-4 bg-blue-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/20 rounded-xl">
              <QrCode className="w-5 h-5 text-white stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-wider text-white">Gate Digital Pass</h2>
              <p className="text-[11px] font-medium opacity-90 text-blue-100">Scan at Scanner Pillar upon entry & exit</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-2 gap-2">
          <button
            onClick={() => setActiveTab('qr_pass')}
            className={`flex-1 py-2 text-xs font-extrabold border-b-2 transition-all cursor-pointer ${
              activeTab === 'qr_pass'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Gate Ticket Pass
          </button>
          <button
            onClick={() => setActiveTab('find_car')}
            className={`flex-1 py-2 text-xs font-extrabold border-b-2 transition-all cursor-pointer ${
              activeTab === 'find_car'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
Find My Vehicle
          </button>
        </div>

        {activeTab === 'qr_pass' ? (
          <div className="p-4 sm:p-6 flex flex-col items-center space-y-5 bg-slate-50/50">

            {/* Server-validated QR pass: opaque token, live status, manual code,
                download/share and regeneration (revokes the old code). */}
            <QrTicket booking={booking} />

            <div className="w-full bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white p-3.5 rounded-2xl shadow-lg border border-blue-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative overflow-hidden group">
              <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl group-hover:scale-125 transition-transform pointer-events-none" />
              <div className="flex items-center gap-2.5 z-10">
                <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 shadow-xs">
                  <Navigation className="w-5 h-5 text-white animate-bounce" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-black tracking-wide uppercase text-white">Live Navigation</h4>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <p className="text-[10px] text-blue-100 font-medium truncate max-w-[190px]">
                    Direct turn-by-turn to {booking.lotName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 z-10 shrink-0">
                <button
                  onClick={handleOpenInternalNavigation}
                  className="px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 font-black rounded-xl text-xs transition-all shadow-md active:scale-95 flex items-center gap-1 cursor-pointer"
                  title="Start internal navigation"
                >
                  <Navigation className="w-3.5 h-3.5 fill-blue-600" />
                  <span>Start Live Nav</span>
                </button>
              </div>
            </div>

            <div className="w-full bg-gradient-to-br from-blue-50/80 to-slate-50 p-4 rounded-2xl border border-blue-200/90 space-y-3 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-600 text-white rounded-lg shadow-2xs">
                      <Navigation className="w-4 h-4 stroke-[2.5]" />
                    </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-xs">Garage Directions & ETA</h4>
                    <p className="text-[10px] text-slate-500 font-medium">Calculates route from current geolocation</p>
                  </div>
                </div>

                {!etaResult && (
                  <button
                    onClick={handleGetDirections}
                    disabled={isLocating}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-extrabold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <LocateFixed className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                    <span>{isLocating ? 'Locating...' : 'Get Directions'}</span>
                  </button>
                )}
              </div>

              {etaResult && (
                <div className="space-y-2.5 pt-1 border-t border-blue-200/60">
<div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-blue-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-200 shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-slate-900 font-mono">
                          ~{etaResult.durationMins} min ({etaResult.distanceMiles} mi)
                        </div>
                        <div className="text-[10px] text-emerald-700 font-bold">
                          Estimated Arrival: {etaResult.arrivalTime}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold">
                      <button
                        onClick={() => setTravelMode('driving')}
                        className={`px-2 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                          travelMode === 'driving' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Car className="w-3 h-3" />
                        <span>Drive</span>
                      </button>
                      <button
                        onClick={() => setTravelMode('walking')}
                        className={`px-2 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                          travelMode === 'walking' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Footprints className="w-3 h-3" />
                        <span>Walk</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                    <button
                      onClick={handleOpenInternalNavigation}
                      className="w-full sm:flex-1 py-2 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs font-extrabold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Navigation className="w-3.5 h-3.5 fill-current" />
                      <span>Start Live Navigation</span>
                    </button>

                    <button
                      onClick={handleGetDirections}
                      disabled={isLocating}
                      className="p-2 text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer w-fit self-center sm:self-auto"
                      title="Recalculate ETA"
                    >
                      <LocateFixed className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {etaResult.isUsingFallbackLocation && (
                    <p className="text-[10px] text-slate-500 italic text-center">
                      *Calculated from city center position
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="w-full space-y-2">
              <span className="text-[11px] text-slate-500 font-semibold block">Need extra time? Extend session:</span>
              <div className="flex gap-2">
                <button
                  onClick={() => onExtendBooking(1)}
                  className="flex-1 py-2 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 border border-slate-200 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-600" /> +1 Hour
                </button>
                <button
                  onClick={() => onExtendBooking(2)}
                  className="flex-1 py-2 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 border border-slate-200 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-600" /> +2 Hours
                </button>
              </div>
            </div>
          </div>
        ) : (
          
          <div className="p-6 space-y-4 text-xs bg-slate-50/50">
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-start gap-3">
              <Compass className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-extrabold text-blue-900 text-sm">Vehicle Pin Location</h4>
                <p className="text-slate-600 mt-1 font-medium">
                  Your car is parked in <strong className="text-blue-700 font-mono">{booking.stallCode}</strong> on <strong className="text-slate-900">{booking.floorName}</strong> at {booking.lotName}.
                </p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 shadow-2xs">
              <h5 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                <Navigation className="w-4 h-4 text-blue-600" />
                Pedestrian Guidance Back to Vehicle
              </h5>

              <ol className="space-y-2 text-slate-600 font-medium pl-4 list-decimal marker:text-blue-600">
                <li>Enter via Main Pedestrian Entrance on {booking.lotAddress}.</li>
                <li>Take Elevator B or Stairs down to {booking.floorName}.</li>
                <li>Follow green floor markings towards Section A, Stall <span className="font-mono text-blue-600 font-bold">{booking.stallCode}</span>.</li>
              </ol>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-700 font-extrabold flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-amber-500" /> Custom Parking Location Note
              </label>
              <textarea
                value={carNote}
                onChange={(e) => setCarNote(e.target.value)}
                rows={2}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>
        )}

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-semibold">Status: <strong className="text-emerald-600 uppercase">ACTIVE SESSION</strong></span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-all"
          >
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
