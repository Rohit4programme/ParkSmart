import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Ban,
  Car,
  Clock,
  Loader2,
  MapPin,
  QrCode,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import { Booking } from '../../types';
import { cancelBooking, getBooking } from '../../services/verificationService';
import { getQrCredential } from '../../services/qrTokenCache';
import PageShell from '../PageShell';
import { QrStatusBadge, QrTicket } from '../QrTicket';
import { formatVehicleNumberForDisplay } from '../../utils/vehicleNumber';
import { formatDurationMinutes, minutesBetween } from '../../utils/duration';

type LoadState = 'loading' | 'ready' | 'error' | 'missing';

/** `/user/bookings/:id` — authoritative booking detail + QR section. */
export const BookingDetailsPage: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState(false);

  const load = useCallback(async () => {
    setLoadState('loading');
    const res = await getBooking(id);
    if (res.ok === true) {
      setBooking(res.data);
      setLoadState('ready');
    } else if (res.error.status === 404) {
      setLoadState('missing');
    } else if (res.error.status === 403) {
      setLoadState('missing');
      setError('This booking belongs to another account.');
    } else {
      setError(res.error.message);
      setLoadState('error');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCancel = async () => {
    if (!booking) return;
    if (!window.confirm('Cancel this booking? The QR pass is revoked immediately.')) return;
    setActionBusy(true);
    setActionMessage('');
    setActionError(false);
    const res = await cancelBooking(booking.id);
    setActionBusy(false);
    if (res.ok === true) {
      setBooking(res.data);
      setActionMessage('Booking cancelled — the QR pass is no longer valid.');
    } else {
      setActionError(true);
      setActionMessage(res.error.message);
    }
  };

  if (loadState === 'loading') {
    return (
      <PageShell title="Booking details" backTo="/">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3" role="status" aria-live="polite">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin mx-auto" aria-hidden="true" />
          <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Loading booking…</p>
        </div>
      </PageShell>
    );
  }

  if (loadState === 'missing') {
    return (
      <PageShell title="Booking details" backTo="/">
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-3">
          <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" aria-hidden="true" />
          <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Booking not available</h2>
          <p className="text-xs text-slate-500">{error || 'This booking does not exist or you do not have access to it.'}</p>
          <Link to="/user/bookings" className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold">
            View my bookings
          </Link>
        </div>
      </PageShell>
    );
  }

  if (loadState === 'error' || !booking) {
    return (
      <PageShell title="Booking details" backTo="/">
        <div className="bg-white dark:bg-slate-900 border border-rose-200 rounded-2xl p-8 text-center space-y-3" role="alert">
          <AlertTriangle className="w-6 h-6 text-rose-600 mx-auto" aria-hidden="true" />
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Could not load this booking</p>
          <p className="text-xs text-slate-500">{error}</p>
          <button type="button" onClick={() => void load()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer">
            Retry
          </button>
        </div>
      </PageShell>
    );
  }

  const status = booking.qrStatus ?? 'ACTIVE';
  const plate = formatVehicleNumberForDisplay(booking.vehicleNumber || booking.vehicle.plateNumber);
  const totalMinutes = minutesBetween(booking.startTime, booking.endTime);
  const canCancel = booking.bookingStatus === 'CONFIRMED' || booking.bookingStatus === 'ACTIVE';
  const credential = getQrCredential(booking.id);

  return (
    <PageShell
      title="Booking details"
      subtitle={`${booking.lotName} · Booking ${booking.id}`}
      backTo="/user/bookings"
      backLabel="All bookings"
      actions={
        <Link
          to={`/user/bookings/${booking.id}/qr`}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
        >
          <QrCode className="w-3.5 h-3.5" aria-hidden="true" /> Open QR pass
        </Link>
      }
    >
      <div className="space-y-4">
        {/* Status + vehicle */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <QrStatusBadge status={status} />
            <span className="text-[11px] font-bold text-slate-500">
              Created {new Date(booking.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div className="bg-slate-900 text-white rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Vehicle</span>
              <span className="font-mono font-black text-lg tracking-wider truncate block">{plate || '—'}</span>
            </div>
            <span className="text-[11px] text-slate-300 font-semibold shrink-0 flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5" aria-hidden="true" /> {booking.vehicle.makeModel}
            </span>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div className="flex justify-between gap-2 sm:col-span-2">
              <dt className="text-slate-500 font-semibold flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" /> Garage
              </dt>
              <dd className="font-bold text-slate-900 dark:text-slate-100 truncate text-right">{booking.lotName}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500 font-semibold">Stall</dt>
              <dd className="font-mono font-extrabold text-blue-700 dark:text-blue-300">
                {booking.stallCode} · {booking.floorName}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500 font-semibold">Booking status</dt>
              <dd className="font-bold text-slate-900 dark:text-slate-100">{booking.bookingStatus ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500 font-semibold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" /> Window
              </dt>
              <dd className="font-bold text-slate-900 dark:text-slate-100 text-right">
                {new Date(booking.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' → '}
                {new Date(booking.endTime).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500 font-semibold">Duration</dt>
              <dd className="font-bold text-slate-900 dark:text-slate-100">{formatDurationMinutes(totalMinutes)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500 font-semibold flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" /> Payment
              </dt>
              <dd className="font-bold text-slate-900 dark:text-slate-100">
                {booking.paymentStatus ?? '—'} · {booking.totalPrice} INR
              </dd>
            </div>
          </dl>
        </div>

        {/* QR section */}
        <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" /> Entry QR pass
            </h2>
            {!credential && (
              <span className="text-[11px] text-slate-500 font-semibold">Stored on the device that booked</span>
            )}
          </div>
          <QrTicket booking={booking} token={credential?.token ?? null} />
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Refresh status
          </button>
          {canCancel && (
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={actionBusy}
              className="flex-1 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {actionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Ban className="w-3.5 h-3.5" aria-hidden="true" />}
              Cancel booking
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/user/bookings')}
            className="flex-1 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-extrabold cursor-pointer"
          >
            View booking history
          </button>
        </div>

        {actionMessage && (
          <p
            role="status"
            aria-live="polite"
            className={`text-xs font-bold ${actionError ? 'text-rose-700' : 'text-emerald-700'}`}
          >
            {actionMessage}
          </p>
        )}
      </div>
    </PageShell>
  );
};

export default BookingDetailsPage;
