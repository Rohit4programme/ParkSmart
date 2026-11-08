import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Car, Clock, History, Loader2, MapPin, QrCode, RefreshCw } from 'lucide-react';
import { Booking } from '../../types';
import { listMyBookings } from '../../services/verificationService';
import PageShell from '../PageShell';
import { QrStatusBadge } from '../QrTicket';
import { formatVehicleNumberForDisplay } from '../../utils/vehicleNumber';
import { formatDurationMinutes, minutesBetween } from '../../utils/duration';

type LoadState = 'loading' | 'ready' | 'error';
type Filter = 'all' | 'active' | 'past';

const ACTIVE_STATUSES = new Set(['PENDING_PAYMENT', 'CONFIRMED', 'ACTIVE', 'CHECKED_IN']);

function startsInMinutes(booking: Booking): number {
  return Math.round((new Date(booking.startTime).getTime() - Date.now()) / 60_000);
}

function endLabel(booking: Booking): string {
  if (booking.bookingStatus === 'CHECKED_IN' && booking.checkInTime) {
    const driven = minutesBetween(booking.checkInTime, new Date().toISOString());
    return `Parked for ${formatDurationMinutes(driven)}`;
  }
  if (booking.bookingStatus === 'COMPLETED' || booking.bookingStatus === 'CHECKED_OUT') {
    const done = minutesBetween(booking.startTime, booking.checkOutTime ?? booking.endTime);
    return `Total ${formatDurationMinutes(done)}`;
  }
  const remaining = Math.round((new Date(booking.endTime).getTime() - Date.now()) / 60_000);
  if (remaining > 0) return `Ends in ${formatDurationMinutes(remaining)}`;
  return 'Window ended';
}

/** `/user/bookings` — booking history with lifecycle status and durations. */
export const BookingHistoryPage: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setLoadState('loading');
    setError('');
    const res = await listMyBookings();
    if (res.ok === true) {
      setBookings(res.data);
      setLoadState('ready');
    } else {
      setError(res.error.message);
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const sorted = [...bookings].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (filter === 'all') return sorted;
    if (filter === 'active') return sorted.filter((b) => ACTIVE_STATUSES.has(b.bookingStatus ?? ''));
    return sorted.filter((b) => !ACTIVE_STATUSES.has(b.bookingStatus ?? ''));
  }, [bookings, filter]);

  const counts = useMemo(() => {
    const active = bookings.filter((b) => ACTIVE_STATUSES.has(b.bookingStatus ?? '')).length;
    return { all: bookings.length, active, past: bookings.length - active };
  }, [bookings]);

  return (
    <PageShell
      title="My bookings"
      subtitle="Every reservation, its status and how long it ran"
      backTo="/"
      actions={
        <button
          type="button"
          onClick={() => void load()}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
          aria-label="Refresh bookings"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-xs font-bold" role="tablist" aria-label="Filter bookings">
          {([
            { key: 'all' as Filter, label: `All (${counts.all})` },
            { key: 'active' as Filter, label: `Upcoming / active (${counts.active})` },
            { key: 'past' as Filter, label: `Past (${counts.past})` },
          ]).map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={filter === tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex-1 py-2 rounded-lg transition-colors cursor-pointer ${
                filter === tab.key
                  ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-2xs'
                  : 'text-slate-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loadState === 'loading' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3" role="status" aria-live="polite">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin mx-auto" aria-hidden="true" />
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Loading your bookings…</p>
          </div>
        )}

        {loadState === 'error' && (
          <div className="bg-white dark:bg-slate-900 border border-rose-200 rounded-2xl p-6 text-center space-y-3" role="alert">
            <AlertTriangle className="w-5 h-5 text-rose-600 mx-auto" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Could not load your bookings</p>
            <p className="text-xs text-slate-500">{error}</p>
            <button type="button" onClick={() => void load()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer">
              Retry
            </button>
          </div>
        )}

        {loadState === 'ready' && visible.length === 0 && (
          <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-8 text-center space-y-3">
            <History className="w-6 h-6 text-slate-400 mx-auto" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No bookings here yet.</p>
            <Link to="/" className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold">
              Find parking
            </Link>
          </div>
        )}

        {loadState === 'ready' && visible.length > 0 && (
          <ul className="space-y-3">
            {visible.map((booking) => {
              const plate = formatVehicleNumberForDisplay(booking.vehicleNumber || booking.vehicle.plateNumber);
              const upcoming = startsInMinutes(booking);
              return (
                <li
                  key={booking.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate">{booking.lotName}</p>
                      <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                        <MapPin className="w-3 h-3 text-blue-500" aria-hidden="true" />
                        {booking.lotAddress}
                      </p>
                    </div>
                    <QrStatusBadge status={booking.qrStatus ?? 'ACTIVE'} />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2">
                      <span className="text-slate-500 font-semibold block">Vehicle</span>
                      <span className="font-mono font-black text-slate-900 dark:text-slate-100 text-xs">{plate || '—'}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2">
                      <span className="text-slate-500 font-semibold block">Stall</span>
                      <span className="font-mono font-bold text-blue-700 dark:text-blue-300 text-xs">{booking.stallCode}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2">
                      <span className="text-slate-500 font-semibold block flex items-center gap-1">
                        <Clock className="w-3 h-3" aria-hidden="true" /> Window
                      </span>
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                        {new Date(booking.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} →{' '}
                        {new Date(booking.endTime).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2">
                      <span className="text-slate-500 font-semibold block flex items-center gap-1">
                        <Car className="w-3 h-3" aria-hidden="true" /> Duration
                      </span>
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                        {formatDurationMinutes(minutesBetween(booking.startTime, booking.endTime))}
                        {endLabel(booking) ? ` · ${endLabel(booking)}` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] text-slate-500 font-semibold">
                      {booking.bookingStatus}
                      {upcoming > 0 && ACTIVE_STATUSES.has(booking.bookingStatus ?? '')
                        ? ` · starts in ${formatDurationMinutes(upcoming)}`
                        : ''}
                    </span>
                    <div className="flex gap-2">
                      <Link
                        to={`/user/bookings/${booking.id}`}
                        className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-bold"
                      >
                        Details
                      </Link>
                      <Link
                        to={`/user/bookings/${booking.id}/qr`}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-extrabold flex items-center gap-1.5"
                      >
                        <QrCode className="w-3 h-3" aria-hidden="true" /> QR pass
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageShell>
  );
};

export default BookingHistoryPage;
