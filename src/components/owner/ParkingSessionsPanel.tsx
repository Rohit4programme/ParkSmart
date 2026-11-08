import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Car, Loader2, MapPin, LogOut, RefreshCw, Timer } from 'lucide-react';
import { ActiveParkingSession } from '../../types';
import { checkOutVehicle, getActiveParkingSessions } from '../../services/verificationService';
import { formatVehicleNumberForDisplay } from '../../utils/vehicleNumber';
import { formatDurationMinutes } from '../../utils/duration';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Active parking sessions for the owner's facilities: live duration plus a
 * server-side check-out (the same atomic action the gate performs).
 */
export const ParkingSessionsPanel: React.FC = () => {
  const [sessions, setSessions] = useState<ActiveParkingSession[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState(false);

  const load = useCallback(async () => {
    setLoadState('loading');
    const res = await getActiveParkingSessions();
    if (res.ok === true) {
      setSessions(res.data);
      setLoadState('ready');
    } else {
      setError(res.error.message);
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void getActiveParkingSessions().then((res) => {
        if (res.ok === true) setSessions(res.data);
      });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const handleCheckOut = async (session: ActiveParkingSession) => {
    setBusyId(session.bookingId);
    setActionError(false);
    setActionMessage('');
    const res = await checkOutVehicle(session.bookingId);
    setBusyId(null);
    if (res.ok === true) {
      setActionMessage(`Checked out ${session.vehicleNumber}. Spot ${session.parkingSpot} is free.`);
      await load();
    } else {
      setActionError(true);
      setActionMessage(res.error.message);
      await load();
    }
  };

  if (loadState === 'loading') {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3" role="status" aria-live="polite">
        <Loader2 className="w-5 h-5 text-blue-600 animate-spin mx-auto" aria-hidden="true" />
        <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Loading active sessions…</p>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="bg-white dark:bg-slate-900 border border-rose-200 rounded-2xl p-6 text-center space-y-3" role="alert">
        <AlertTriangle className="w-5 h-5 text-rose-600 mx-auto" aria-hidden="true" />
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Could not load parking sessions</p>
        <p className="text-xs text-slate-500">{error}</p>
        <button type="button" onClick={() => void load()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer">
          Retry
        </button>
      </div>
    );
  }

  return (
    <section aria-label="Active parking sessions" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Car className="w-4 h-4 text-blue-600" aria-hidden="true" /> Active Parking Sessions
          </h2>
          <p className="text-[11px] text-slate-500 font-medium">Vehicles currently checked in at your facilities.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
          aria-label="Refresh sessions"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {actionMessage && (
        <p
          role="status"
          aria-live="polite"
          className={`text-xs font-bold flex items-center gap-1.5 ${actionError ? 'text-rose-700' : 'text-emerald-700'}`}
        >
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
          {actionMessage}
        </p>
      )}

      {sessions.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center space-y-2">
          <Car className="w-6 h-6 text-slate-400 mx-auto" aria-hidden="true" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No vehicles are checked in right now.</p>
          <p className="text-xs text-slate-500">Sessions appear here the moment you approve a check-in.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sessions.map((session) => (
            <li
              key={session.bookingId}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 shadow-2xs"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-black text-base tracking-wider text-slate-900 dark:text-slate-100">
                    {formatVehicleNumberForDisplay(session.vehicleNumber) || '—'}
                  </span>
                  <span className="text-[11px] text-slate-500 font-semibold">{session.vehicleModel}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                    Checked in
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5 truncate">
                  <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" aria-hidden="true" />
                  {session.parkingName} · Stall {session.parkingSpot}
                  {session.floorName ? ` · ${session.floorName}` : ''}
                </p>
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  In at {new Date(session.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·{' '}
                  {formatDurationMinutes(session.durationMinutes)} elapsed
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleCheckOut(session)}
                disabled={busyId === session.bookingId}
                className="shrink-0 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                {busyId === session.bookingId ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                Check out
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ParkingSessionsPanel;
