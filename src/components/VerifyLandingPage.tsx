import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QrCode, ShieldCheck } from 'lucide-react';
import PageShell from './PageShell';

/**
 * `/verify/booking/:token` — what a driver sees if they open their own QR
 * image instead of an operator scanning it.
 *
 * Deliberately performs NO server lookup: asking the backend whether a token
 * is valid would let anyone probe tokens, and this page is not an
 * authorization decision point. Validation only ever happens on the gate.
 */
export const VerifyLandingPage: React.FC = () => {
  const { token = '' } = useParams();
  const bookingId = useMemo(() => {
    try {
      const raw = localStorage.getItem('parksmart_qr_tokens');
      if (!raw) return null;
      const map = JSON.parse(raw) as Record<string, { token?: string }>;
      const match = Object.entries(map).find(([, value]) => value?.token === token);
      return match ? match[0] : null;
    } catch {
      return null;
    }
  }, [token]);

  return (
    <PageShell title="Parking pass" backTo="/" backLabel="Back to ParkSmart">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-2xs">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-blue-600 flex items-center justify-center mx-auto">
          <QrCode className="w-7 h-7" aria-hidden="true" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">Show this pass to the gate operator</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
            Your pass is a private, single-use code. It is scanned by the parking operator's device and validated
            by the ParkSmart server — it cannot be opened as a web page.
          </p>
        </div>

        <div className="flex items-start gap-2.5 text-left bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
            Only the opaque code is stored in the QR image — never your booking details, vehicle or payment data.
            The operator's scan re-checks booking status, payment, time window and parking ownership on every use.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
          {bookingId && (
            <Link
              to={`/user/bookings/${bookingId}/qr`}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold"
            >
              Open my pass
            </Link>
          )}
          <Link
            to="/user/bookings"
            className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
          >
            My bookings
          </Link>
        </div>
      </div>
    </PageShell>
  );
};

export default VerifyLandingPage;
