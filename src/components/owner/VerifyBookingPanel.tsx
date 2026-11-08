import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Camera, Keyboard, Loader2, ScanLine } from 'lucide-react';
import QrScanner from '../QrScanner';
import {
  extractQrTokenFromScan,
  extractVerifyCodeFromInput,
  verifyBooking,
} from '../../services/verificationService';
import { VerificationResult } from '../../types';

type Mode = 'camera' | 'manual';

/**
 * Owner verification entry point: scan the driver's QR pass (or type the
 * 8-character fallback code) and hand the credential to the result screen.
 * No decision is made here — the server answers every verification request.
 */
export const VerifyBookingPanel: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('camera');
  const [manualValue, setManualValue] = useState('');
  const [scanError, setScanError] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const goToResult = useCallback(
    (payload: { token?: string; code?: string; result?: VerificationResult }) => {
      navigate('/owner/verification-result', { state: payload });
    },
    [navigate]
  );

  /** Format-check locally, then ask the server — every outcome is shown. */
  const submitCredential = useCallback(
    async (raw: string, fromCamera: boolean) => {
      setScanError('');
      const token = extractQrTokenFromScan(raw);
      const code = token ? null : extractVerifyCodeFromInput(raw);

      if (fromCamera && !token) {
        setScanError('That QR code is not a ParkSmart pass. Ask the driver to open their booking pass and try again.');
        setResetKey((k) => k + 1);
        return;
      }

      if (!token && !code) {
        setScanError('Enter the 8-character verification code shown on the driver\'s ticket (e.g. 8F72A91C).');
        return;
      }

      setIsChecking(true);
      const credential = token ? { token } : { code: code! };
      const outcome = await verifyBooking(credential);
      setIsChecking(false);

      if (outcome.ok === true) {
        goToResult({ ...credential, result: outcome.data });
        return;
      }
      if (outcome.error.result) {
        // A structured rejection (invalid QR, wrong owner, cancelled, …) is
        // exactly what the result screen is for.
        goToResult({ ...credential, result: outcome.error.result });
        return;
      }
      // Transport / throttling: the credential was never resolved.
      setScanError(outcome.error.message);
      setResetKey((k) => k + 1);
    },
    [goToResult]
  );

  const handleScan = useCallback(
    (payload: string) => {
      void submitCredential(payload, true);
    },
    [submitCredential]
  );

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualValue.trim() || isChecking) return;
    void submitCredential(manualValue, false);
  };

  return (
    <section aria-label="Verify a booking" className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ScanLine className="w-4 h-4 text-blue-600" aria-hidden="true" />
              Verify Booking
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              Scan the driver's QR pass, or type the manual code. Only your own parking locations can be verified.
            </p>
          </div>
        </div>

        <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-xs font-bold" role="tablist" aria-label="Verification method">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'camera'}
            onClick={() => setMode('camera')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              mode === 'camera' ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-2xs' : 'text-slate-500'
            }`}
          >
            <Camera className="w-3.5 h-3.5" aria-hidden="true" /> Camera scan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'manual'}
            onClick={() => setMode('manual')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              mode === 'manual' ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-2xs' : 'text-slate-500'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" aria-hidden="true" /> Manual code
          </button>
        </div>

        {mode === 'camera' ? (
          <div className="space-y-2">
            <QrScanner key={resetKey} onDetect={handleScan} resetKey={resetKey} />
            {isChecking && (
              <p role="status" aria-live="polite" className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Verifying pass with the server…
              </p>
            )}
            <p className="text-[11px] text-slate-500">
              Camera unavailable? Switch to <span className="font-bold">Manual code</span> and enter the code printed on the ticket.
            </p>
          </div>
        ) : (
          <form onSubmit={submitManual} className="space-y-2">
            <label htmlFor="manual-verify-code" className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block">
              Manual verification code
            </label>
            <div className="flex gap-2">
              <input
                id="manual-verify-code"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={16}
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value.toUpperCase())}
                placeholder="8F72A91C"
                className="flex-1 px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-black tracking-[0.25em] text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                aria-describedby="manual-code-help"
              />
              <button
                type="submit"
                disabled={isChecking || manualValue.trim().length < 4}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                {isChecking ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
                Verify
              </button>
            </div>
            <p id="manual-code-help" className="text-[11px] text-slate-500">
              The code is printed under the QR image on the driver's ticket. The server still runs the full
              verification (booking, owner, vehicle, payment, time and status).
            </p>
          </form>
        )}

        {scanError && (
          <div role="alert" className="flex items-start gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{scanError}</span>
          </div>
        )}
      </div>
    </section>
  );
};

export default VerifyBookingPanel;
