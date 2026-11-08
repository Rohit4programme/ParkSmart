import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, Loader2, QrCode } from 'lucide-react';
import { Booking } from '../../types';
import { getBooking } from '../../services/verificationService';
import { getQrCredential } from '../../services/qrTokenCache';
import PageShell from '../PageShell';
import { QrTicket } from '../QrTicket';

type LoadState = 'loading' | 'ready' | 'error' | 'missing';

/** `/user/bookings/:id/qr` — the full-screen ticket shown at the gate. */
export const BookingQrPage: React.FC = () => {
  const { id = '' } = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoadState('loading');
    const res = await getBooking(id);
    if (res.ok === true) {
      setBooking(res.data);
      setLoadState('ready');
    } else if (res.error.status === 404 || res.error.status === 403) {
      setLoadState('missing');
      setError(res.error.message);
    } else {
      setError(res.error.message);
      setLoadState('error');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadState === 'loading') {
    return (
      <PageShell title="QR parking pass" backTo={`/user/bookings/${id}`} backLabel="Booking details">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3" role="status" aria-live="polite">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin mx-auto" aria-hidden="true" />
          <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Loading your pass…</p>
        </div>
      </PageShell>
    );
  }

  if (loadState !== 'ready' || !booking) {
    return (
      <PageShell title="QR parking pass" backTo="/" backLabel="Back to ParkSmart">
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-3" role="alert">
          <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" aria-hidden="true" />
          <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Pass unavailable</h2>
          <p className="text-xs text-slate-500">{error || 'This pass could not be loaded.'}</p>
          <Link to="/user/bookings" className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold">
            My bookings
          </Link>
        </div>
      </PageShell>
    );
  }

  const credential = getQrCredential(booking.id);

  return (
    <PageShell
      title="QR parking pass"
      subtitle={`${booking.lotName} · Stall ${booking.stallCode}`}
      backTo={`/user/bookings/${booking.id}`}
      backLabel="Booking details"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <QrCode className="w-4 h-4 text-blue-600" aria-hidden="true" />
          <span>Present this code at the entry gate — the operator scans it and the server validates it.</span>
        </div>
        <QrTicket booking={booking} token={credential?.token ?? null} />
        <div className="flex gap-2">
          <Link
            to={`/user/bookings/${booking.id}`}
            className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-center"
          >
            Booking details
          </Link>
          <Link
            to="/user/bookings"
            className="flex-1 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-extrabold text-center"
          >
            All bookings
          </Link>
        </div>
      </div>
    </PageShell>
  );
};

export default BookingQrPage;
