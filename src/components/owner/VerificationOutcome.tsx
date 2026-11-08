import React, { useCallback, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  CircleSlash,
  Clock,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { Booking, VerificationResult } from '../../types';
import {
  checkInVehicle,
  checkOutVehicle,
  rejectEntry,
} from '../../services/verificationService';
import { formatVehicleNumberForDisplay } from '../../utils/vehicleNumber';
import { formatDurationMinutes, minutesBetween } from '../../utils/duration';

/** Human labels for the structured failure reasons returned by the API. */
export const REASON_LABELS: Record<string, string> = {
  QR_INVALID: 'QR code not recognised',
  QR_EXPIRED: 'QR code expired',
  BOOKING_NOT_FOUND: 'Booking not found',
  BOOKING_CANCELLED: 'Booking was cancelled',
  BOOKING_EXPIRED: 'Booking window has passed',
  BOOKING_REJECTED: 'Entry was refused for this booking',
  PAYMENT_NOT_COMPLETED: 'Payment not completed',
  WRONG_PARKING_OWNER: 'Not your parking location',
  ALREADY_CHECKED_IN: 'Vehicle already checked in',
  ALREADY_COMPLETED: 'Session already completed',
  INVALID_TIME: 'Outside the booking window',
  TOKEN_REVOKED: 'QR code was revoked',
  UNAUTHENTICATED: 'Sign-in required',
  RATE_LIMITED: 'Too many attempts — slow down',
  NOT_FOUND: 'Not found',
  SERVER_ERROR: 'Server error',
  AUTH_UNAVAILABLE: 'Authentication service unavailable',
  OFFLINE: 'Offline — online verification required',
  CONFLICT: 'Action no longer valid',
  FORBIDDEN: 'Not permitted',
  REQUEST_FAILED: 'Request failed',
};

export function reasonLabel(code: string): string {
  return REASON_LABELS[code] ?? code.replace(/_/g, ' ').toLowerCase();
}

function statusVisual(status: VerificationResult['status']) {
  if (status === 'VALID') {
    return {
      label: 'Valid pass',
      icon: <CheckCircle2 className="w-5 h-5" aria-hidden="true" />,
      containerClass: 'bg-emerald-50 border-emerald-300 text-emerald-900',
      iconClass: 'bg-emerald-600 text-white',
    };
  }
  if (status === 'WARNING') {
    return {
      label: 'Warning',
      icon: <AlertTriangle className="w-5 h-5" aria-hidden="true" />,
      containerClass: 'bg-amber-50 border-amber-300 text-amber-950',
      iconClass: 'bg-amber-500 text-white',
    };
  }
  return {
    label: 'Invalid pass',
    icon: <XCircle className="w-5 h-5" aria-hidden="true" />,
    containerClass: 'bg-rose-50 border-rose-300 text-rose-950',
    iconClass: 'bg-rose-600 text-white',
  };
}

interface Props {
  result: VerificationResult;
  /** Re-runs verification after a gate action so the view reflects reality. */
  onRefresh?: () => void;
  /** "Scan another" handler provided by the surrounding page. */
  onRescan?: () => void;
}

type ActionState = 'idle' | 'working' | 'error';

/**
 * Verification result card: structured VALID / WARNING / INVALID state with
 * the booking facts the server returned, the vehicle the owner must confirm
 * visually, and the gate actions (check-in / check-out / refuse entry).
 */
export const VerificationOutcome: React.FC<Props> = ({ result, onRefresh, onRescan }) => {
  const [vehicleConfirmed, setVehicleConfirmed] = useState(false);
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState(false);
  const [lastBooking, setLastBooking] = useState<Booking | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const visual = statusVisual(result.status);
  const plate = formatVehicleNumberForDisplay(result.vehicleNumber ?? '');
  const bookingStatus = lastBooking?.bookingStatus ?? result.bookingStatus;
  const checkInTime = lastBooking?.checkInTime ?? (result.valid ? result.checkInTime : undefined);
  const checkOutTime = lastBooking?.checkOutTime ?? (result.valid ? result.checkOutTime : undefined);

  const runAction = useCallback(
    async (action: 'check-in' | 'check-out' | 'reject') => {
      if (!result.bookingId) return;
      setActionState('working');
      setActionError(false);
      setActionMessage(
        action === 'check-in'
          ? 'Approving entry…'
          : action === 'check-out'
            ? 'Recording exit…'
            : 'Refusing entry…'
      );

      const outcome =
        action === 'check-in'
          ? await checkInVehicle(result.bookingId)
          : action === 'check-out'
            ? await checkOutVehicle(result.bookingId)
            : await rejectEntry(result.bookingId, rejectReason.trim() || 'Refused by gate operator');

      if (outcome.ok === true) {
        setLastBooking(outcome.data);
        setActionState('idle');
        setActionMessage(
          action === 'check-in'
            ? `Entry approved for ${outcome.data.vehicleNumber ?? plate}.`
            : action === 'check-out'
              ? `Exit recorded for ${outcome.data.vehicleNumber ?? plate}.`
              : 'Entry refused — the QR pass is now revoked.'
        );
        setRejecting(false);
        setRejectReason('');
        setVehicleConfirmed(false);
        onRefresh?.();
      } else {
        setActionState('error');
        setActionError(true);
        setActionMessage(outcome.error.message);
      }
    },
    [result.bookingId, plate, rejectReason, onRefresh]
  );

  const canCheckIn =
    result.valid && result.canCheckIn && (bookingStatus === 'CONFIRMED' || bookingStatus === 'ACTIVE');
  const canCheckOut = bookingStatus === 'CHECKED_IN' && Boolean(result.bookingId);
  const canReject = result.valid && (bookingStatus === 'CONFIRMED' || bookingStatus === 'ACTIVE');

  return (
    <section aria-label="Verification result" className="space-y-4">
      {/* Status banner — colour is always paired with an icon and a label */}
      <div
        className={`rounded-2xl border-2 p-4 sm:p-5 flex items-start gap-3 ${visual.containerClass}`}
        role={result.valid ? 'status' : 'alert'}
        aria-live="assertive"
      >
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${visual.iconClass}`}>
          {visual.icon}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-black uppercase tracking-wide">{visual.label}</h2>
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/70 border border-current/30">
              {result.reason}
            </span>
          </div>
          <p className="text-xs font-semibold opacity-90 mt-0.5">{result.message}</p>
          <p className="text-[11px] font-medium opacity-75">{reasonLabel(result.reason)}</p>
        </div>
      </div>

      {/* Booking facts returned by the server */}
      {result.bookingId && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 shadow-2xs">
          <div className="bg-slate-900 text-white rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Vehicle to confirm</span>
              <span className="font-mono font-black text-lg sm:text-xl tracking-wider truncate block">{plate || '—'}</span>
            </div>
            <ShieldAlert className="w-5 h-5 text-blue-300 shrink-0" aria-hidden="true" />
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div className="flex justify-between gap-2 sm:col-span-2">
              <dt className="text-slate-500 font-semibold">Parking location</dt>
              <dd className="font-bold text-slate-900 dark:text-slate-100 truncate text-right">
                {result.parkingName ?? '—'}
                {result.parkingSpot ? ` · Stall ${result.parkingSpot}` : ''}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500 font-semibold">Booking</dt>
              <dd className="font-mono font-bold text-slate-900 dark:text-slate-100 truncate">{result.bookingId}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500 font-semibold">Status</dt>
              <dd className="font-bold text-slate-900 dark:text-slate-100">{bookingStatus ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500 font-semibold">Payment</dt>
              <dd
                className={`font-bold ${result.paymentStatus === 'PAID' ? 'text-emerald-700' : 'text-amber-700'}`}
              >
                {result.paymentStatus ?? '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500 font-semibold">Window</dt>
              <dd className="font-bold text-slate-900 dark:text-slate-100 text-right">
                {result.startTime
                  ? new Date(result.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : '—'}
                {' → '}
                {result.endTime
                  ? new Date(result.endTime).toLocaleString([], { hour: '2-digit', minute: '2-digit' })
                  : '—'}
              </dd>
            </div>
            {checkInTime && (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 font-semibold flex items-center gap-1.5">
                  <LogIn className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" /> Checked in
                </dt>
                <dd className="font-bold text-slate-900 dark:text-slate-100">
                  {new Date(checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </dd>
              </div>
            )}
            {checkOutTime && (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 font-semibold flex items-center gap-1.5">
                  <LogOut className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" /> Checked out
                </dt>
                <dd className="font-bold text-slate-900 dark:text-slate-100">
                  {new Date(checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {checkInTime ? ` · ${formatDurationMinutes(minutesBetween(checkInTime, checkOutTime))}` : ''}
                </dd>
              </div>
            )}
          </dl>

          {!result.valid && !canCheckOut && (
            <p className="text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2 flex items-center gap-1.5">
              <CircleSlash className="w-3.5 h-3.5" aria-hidden="true" />
              No gate action is available for this pass.
            </p>
          )}
        </div>
      )}

      {/* Gate actions */}
      {(canCheckIn || canCheckOut || canReject || rejecting) && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 shadow-2xs">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Gate actions
          </h3>

          {canCheckIn && (
            <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-semibold bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={vehicleConfirmed}
                onChange={(e) => setVehicleConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-blue-600"
                aria-describedby="vehicle-confirm-help"
              />
              <span>
                I have visually confirmed the vehicle at the gate matches{' '}
                <span className="font-mono font-black">{plate || 'this booking'}</span>.
                <span id="vehicle-confirm-help" className="block text-[11px] font-medium text-slate-500 mt-0.5">
                  Check-in stays disabled until you confirm the plate.
                </span>
              </span>
            </label>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            {canCheckIn && (
              <button
                type="button"
                onClick={() => runAction('check-in')}
                disabled={!vehicleConfirmed || actionState === 'working'}
                className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {actionState === 'working' ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                )}
                Approve check-in
              </button>
            )}

            {canCheckOut && (
              <button
                type="button"
                onClick={() => runAction('check-out')}
                disabled={actionState === 'working'}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {actionState === 'working' ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                )}
                Record check-out
              </button>
            )}

            {canReject && !rejecting && (
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={actionState === 'working'}
                className="px-4 py-3 bg-white dark:bg-slate-800 border border-rose-300 text-rose-700 dark:text-rose-300 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Ban className="w-4 h-4" aria-hidden="true" />
                Refuse entry
              </button>
            )}
          </div>

          {rejecting && (
            <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block" htmlFor="reject-reason">
                Reason for refusing entry
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="reject-reason"
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. vehicle number does not match"
                  maxLength={120}
                  className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => runAction('reject')}
                    disabled={actionState === 'working'}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold cursor-pointer disabled:opacity-50"
                  >
                    Confirm refusal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejecting(false);
                      setRejectReason('');
                    }}
                    className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {actionMessage && (
            <p
              role="status"
              aria-live="polite"
              className={`text-xs font-bold flex items-center gap-1.5 ${actionError ? 'text-rose-700' : 'text-emerald-700'}`}
            >
              {actionError ? (
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              ) : (
                <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              {actionMessage}
            </p>
          )}
        </div>
      )}

      {onRescan && (
        <button
          type="button"
          onClick={onRescan}
          className="w-full px-4 py-3 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 dark:text-slate-900 text-white rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer"
        >
          <MapPin className="w-4 h-4" aria-hidden="true" />
          Scan the next vehicle
        </button>
      )}
    </section>
  );
};

export default VerificationOutcome;
