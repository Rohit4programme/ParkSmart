import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Download,
  KeyRound,
  Loader2,
  QrCode,
  RefreshCw,
  Share2,
  XCircle,
} from 'lucide-react';
import { Booking, QrPassStatus } from '../types';
import { buildQrPayload, getQrCredential, saveQrToken } from '../services/qrTokenCache';
import { getQrPass, regenerateQr } from '../services/verificationService';
import { formatVehicleNumberForDisplay } from '../utils/vehicleNumber';
import { formatDurationMinutes, minutesBetween } from '../utils/duration';

// ── Status presentation (icon + text — never colour alone) ───────────────────

interface StatusVisual {
  label: string;
  hint: string;
  icon: React.ReactNode;
  containerClass: string;
}

const STATUS_VISUALS: Record<QrPassStatus, StatusVisual> = {
  NOT_ACTIVE_YET: {
    label: 'Not active yet',
    hint: 'This pass activates shortly before your booking starts.',
    icon: <Clock className="w-4 h-4" aria-hidden="true" />,
    containerClass: 'bg-amber-50 border-amber-300 text-amber-900',
  },
  ACTIVE: {
    label: 'Active — ready to scan',
    hint: 'Show this QR at the entry gate.',
    icon: <CheckCircle2 className="w-4 h-4" aria-hidden="true" />,
    containerClass: 'bg-emerald-50 border-emerald-300 text-emerald-900',
  },
  CHECKED_IN: {
    label: 'Checked in',
    hint: 'Entry approved — this pass is already in use.',
    icon: <CheckCircle2 className="w-4 h-4" aria-hidden="true" />,
    containerClass: 'bg-blue-50 border-blue-300 text-blue-900',
  },
  COMPLETED: {
    label: 'Completed',
    hint: 'This parking session has ended.',
    icon: <CheckCircle2 className="w-4 h-4" aria-hidden="true" />,
    containerClass: 'bg-slate-100 border-slate-300 text-slate-700',
  },
  CANCELLED: {
    label: 'Cancelled — pass revoked',
    hint: 'This QR code is no longer valid at any gate.',
    icon: <Ban className="w-4 h-4" aria-hidden="true" />,
    containerClass: 'bg-rose-50 border-rose-300 text-rose-900',
  },
  EXPIRED: {
    label: 'Expired',
    hint: 'The booking window has ended. Book a new slot to park.',
    icon: <XCircle className="w-4 h-4" aria-hidden="true" />,
    containerClass: 'bg-rose-50 border-rose-300 text-rose-900',
  },
};

export const QrStatusBadge: React.FC<{ status: QrPassStatus; className?: string }> = ({ status, className = '' }) => {
  const visual = STATUS_VISUALS[status] ?? STATUS_VISUALS.ACTIVE;
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide ${visual.containerClass} ${className}`}
    >
      {visual.icon}
      <span>{visual.label}</span>
    </span>
  );
};

// ── Ticket ───────────────────────────────────────────────────────────────────

interface Props {
  booking: Booking;
  /** Raw token when the device already holds it (cache or creation response). */
  token?: string | null;
  /** Called after a successful regeneration so the parent can re-render. */
  onTokenChange?: (token: string, verifyUrl: string) => void;
  /** Hide the countdown row on compact surfaces. */
  showCountdown?: boolean;
}

type TicketState = 'idle' | 'working' | 'error';

export const QrTicket: React.FC<Props> = ({ booking, token, onTokenChange, showCountdown = true }) => {
  const cached = getQrCredential(booking.id);
  const [rawToken, setRawToken] = useState<string | null>(token ?? cached?.token ?? null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(token || cached ? (cached?.verifyUrl ?? buildQrPayload(token ?? '')) : null);
  const [qrImage, setQrImage] = useState<string>('');
  const [verifyCode, setVerifyCode] = useState<string>(booking.verifyCode ?? '');
  const [serverStatus, setServerStatus] = useState<QrPassStatus | null>(booking.qrStatus ?? null);
  const [canRegenerate, setCanRegenerate] = useState(true);
  const [state, setState] = useState<TicketState>('idle');
  const [feedback, setFeedback] = useState<string>('');
  const [countdown, setCountdown] = useState('—');

  const effectiveToken = token ?? rawToken;

  // Authoritative status + manual code from the server.
  useEffect(() => {
    const controller = new AbortController();
    getQrPass(booking.id, controller.signal).then((res) => {
      if (res.ok === false) return;
      setServerStatus(res.data.qrStatus);
      setVerifyCode(res.data.verifyCode || '');
      setCanRegenerate(res.data.canRegenerate);
    });
    return () => controller.abort();
  }, [booking.id, booking.bookingStatus, booking.updatedAt]);

  useEffect(() => {
    setRawToken(token ?? getQrCredential(booking.id)?.token ?? null);
  }, [token, booking.id]);

  // Render the QR image from the opaque token payload only (no booking data).
  useEffect(() => {
    if (!effectiveToken) {
      setQrImage('');
      setVerifyUrl(null);
      return;
    }
    const url = getQrCredential(booking.id)?.verifyUrl ?? buildQrPayload(effectiveToken);
    setVerifyUrl(url);
    QRCode.toDataURL(url, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((dataUrl) => setQrImage(dataUrl))
      .catch((err) => {
        console.error('QR generation error:', err);
        setQrImage('');
      });
  }, [effectiveToken, booking.id]);

  // Countdown to the end of the booking window.
  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, new Date(booking.endTime).getTime() - Date.now());
      setCountdown(formatDurationMinutes(Math.round(diff / 60_000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [booking.endTime]);

  const status: QrPassStatus = serverStatus ?? booking.qrStatus ?? 'ACTIVE';
  const visual = STATUS_VISUALS[status] ?? STATUS_VISUALS.ACTIVE;
  const plate = formatVehicleNumberForDisplay(booking.vehicleNumber || booking.vehicle.plateNumber);

  const handleRegenerate = useCallback(async () => {
    setState('working');
    setFeedback('');
    const res = await regenerateQr(booking.id);
    if (res.ok === false) {
      setState('error');
      setFeedback(res.error.message);
      return;
    }
    saveQrToken(booking.id, res.data.token, res.data.verifyUrl);
    setRawToken(res.data.token);
    setVerifyUrl(res.data.verifyUrl);
    setVerifyCode(res.data.verifyCode);
    if (res.data.booking?.qrStatus) setServerStatus(res.data.booking.qrStatus);
    setCanRegenerate(true);
    setState('idle');
    setFeedback('New QR generated — the previous code no longer works.');
    onTokenChange?.(res.data.token, res.data.verifyUrl);
  }, [booking.id, onTokenChange]);

  const handleDownload = useCallback(() => {
    if (!qrImage) return;
    const link = document.createElement('a');
    link.href = qrImage;
    link.download = `parksmart-pass-${booking.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setFeedback('QR image downloaded.');
  }, [qrImage, booking.id]);

  const handleShare = useCallback(async () => {
    const shareUrl = verifyUrl ?? '';
    const text = `ParkSmart pass ${booking.id} — ${booking.lotName}, stall ${booking.stallCode}, vehicle ${plate}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'ParkSmart parking pass', text, url: shareUrl });
        setFeedback('Pass shared.');
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
      setFeedback('Pass details copied to the clipboard.');
    } catch {
      setFeedback('Sharing is not available in this browser.');
    }
  }, [verifyUrl, booking.id, booking.lotName, booking.stallCode, plate]);

  const totalSessionMinutes = useMemo(
    () => minutesBetween(booking.startTime, booking.endTime),
    [booking.startTime, booking.endTime]
  );

  return (
    <section aria-label="Parking QR pass" className="w-full space-y-3">
      {/* Status */}
      <div className={`border rounded-2xl p-3 flex items-start gap-2.5 ${visual.containerClass}`} role="status" aria-live="polite">
        <span className="mt-0.5 shrink-0">{visual.icon}</span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide">{visual.label}</p>
          <p className="text-[11px] font-medium opacity-90">{visual.hint}</p>
        </div>
      </div>

      {/* QR image */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center shadow-2xs">
        {qrImage ? (
          <img src={qrImage} alt={`QR code for booking ${booking.id}`} className="w-56 h-56 sm:w-64 sm:h-64 object-contain" />
        ) : (
          <div className="w-56 h-56 sm:w-64 sm:h-64 rounded-xl bg-slate-100 border border-dashed border-slate-300 flex flex-col items-center justify-center gap-2 text-slate-500 p-4 text-center">
            <QrCode className="w-8 h-8 text-slate-400" aria-hidden="true" />
            {status === 'CANCELLED' || status === 'EXPIRED' || status === 'COMPLETED' ? (
              <p className="text-xs font-semibold">No active QR for this booking.</p>
            ) : (
              <p className="text-xs font-semibold">No QR is stored on this device for this booking.</p>
            )}
          </div>
        )}

        <div className="mt-3 w-full space-y-1.5 text-center">
          <p className="font-mono font-extrabold text-xs text-slate-900 tracking-wider">Booking {booking.id}</p>
          <p className="text-[11px] text-slate-500 font-medium">
            Scan at the entry gate — the server validates every scan.
          </p>
        </div>

        {verifyCode && (
          <div className="mt-3 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-center gap-2">
            <KeyRound className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span className="text-[11px] text-slate-500 font-semibold">Manual code</span>
            <span className="font-mono font-black text-sm tracking-[0.3em] text-slate-900 select-all">{verifyCode}</span>
          </div>
        )}
      </div>

      {/* Vehicle — shown prominently on every surface */}
      <div className="bg-slate-900 text-white rounded-2xl p-3.5 flex items-center justify-between gap-3 border border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Vehicle</span>
          <span className="font-mono font-black text-base sm:text-lg tracking-wider truncate">{plate || '—'}</span>
        </div>
        <span className="text-[11px] text-slate-300 font-semibold shrink-0">{booking.vehicle.makeModel}</span>
      </div>

      {/* Details */}
      <dl className="bg-white border border-slate-200 rounded-2xl p-4 text-xs space-y-2 shadow-2xs">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500 font-semibold">Garage</dt>
          <dd className="font-bold text-slate-900 truncate max-w-[60%] text-right">{booking.lotName}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500 font-semibold">Stall</dt>
          <dd className="font-mono font-extrabold text-blue-700">
            {booking.stallCode} · {booking.floorName}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500 font-semibold">Window</dt>
          <dd className="font-bold text-slate-900 text-right">
            {new Date(booking.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {' → '}
            {new Date(booking.endTime).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500 font-semibold">Paid</dt>
          <dd className="font-bold text-slate-900">
            {booking.paymentStatus ?? 'PAID'} · {booking.durationHours}h ({formatDurationMinutes(totalSessionMinutes)})
          </dd>
        </div>
        {showCountdown && (
          <div className="flex justify-between gap-3 pt-2 border-t border-slate-100">
            <dt className="text-slate-500 font-semibold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" /> Time left
            </dt>
            <dd className="font-mono font-black text-blue-600">{countdown}</dd>
          </div>
        )}
      </dl>

      {/* Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={!qrImage || state === 'working'}
          className="justify-center px-3 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" /> Download
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="justify-center px-3 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Share2 className="w-3.5 h-3.5" aria-hidden="true" /> Share
        </button>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={state === 'working' || !canRegenerate}
          title={canRegenerate ? 'Issue a new QR code (revokes the old one)' : 'A new QR cannot be issued for this booking'}
          className="justify-center px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state === 'working' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          Regenerate QR
        </button>
      </div>

      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className={`text-[11px] font-semibold flex items-center gap-1.5 ${state === 'error' ? 'text-rose-700' : 'text-slate-600'}`}
        >
          {state === 'error' ? <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> : null}
          {feedback}
        </p>
      )}
    </section>
  );
};
