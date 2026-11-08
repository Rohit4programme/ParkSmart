import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2, ScanLine } from 'lucide-react';
import { VerificationResult } from '../../types';
import { verifyBooking } from '../../services/verificationService';
import VerificationOutcome from './VerificationOutcome';

interface ResultState {
  token?: string;
  code?: string;
  result?: VerificationResult;
}

type LoadState = 'ready' | 'checking' | 'error' | 'empty';

/**
 * Result screen for a single verification attempt. It renders the server's
 * structured outcome and hosts the gate actions; a refresh re-asks the server
 * so the view can never drift from the backend's state.
 */
export const VerificationResultPanel: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? null) as ResultState | null;

  const [result, setResult] = useState<VerificationResult | null>(state?.result ?? null);
  const [loadState, setLoadState] = useState<LoadState>(state?.result ? 'ready' : state?.token || state?.code ? 'checking' : 'empty');
  const [error, setError] = useState('');

  const credential = state?.token ? { token: state.token } : state?.code ? { code: state.code } : null;

  const runVerify = useCallback(async () => {
    if (!credential) return;
    setLoadState('checking');
    setError('');
    const outcome = await verifyBooking(credential);
    if (outcome.ok === true) {
      setResult(outcome.data);
      setLoadState('ready');
      return;
    }
    if (outcome.error.result) {
      setResult(outcome.error.result);
      setLoadState('ready');
      return;
    }
    setLoadState('error');
    setError(outcome.error.message);
  }, [credential?.token, credential?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state?.result && credential) {
      void runVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rescan = useCallback(() => navigate('/owner/verify'), [navigate]);

  if (loadState === 'empty') {
    return (
      <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-8 text-center space-y-3">
        <ScanLine className="w-7 h-7 text-slate-400 mx-auto" aria-hidden="true" />
        <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">No verification to display</h2>
        <p className="text-xs text-slate-500">Scan a QR pass or enter a manual code to verify a booking.</p>
        <button
          type="button"
          onClick={rescan}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer"
        >
          Go to scanner
        </button>
      </div>
    );
  }

  if (loadState === 'checking') {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3" role="status" aria-live="polite">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto" aria-hidden="true" />
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Verifying with the server…</p>
        <p className="text-[11px] text-slate-500">Checking booking, owner, vehicle, payment, time and status.</p>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="bg-white dark:bg-slate-900 border border-rose-200 rounded-2xl p-6 text-center space-y-3" role="alert">
        <AlertTriangle className="w-6 h-6 text-rose-600 mx-auto" aria-hidden="true" />
        <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Verification could not be completed</h2>
        <p className="text-xs text-slate-600 dark:text-slate-300">{error}</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button type="button" onClick={() => void runVerify()} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer">
            Retry
          </button>
          <button type="button" onClick={rescan} className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold cursor-pointer">
            Scan again
          </button>
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <>
      <VerificationOutcome result={result} onRefresh={() => void runVerify()} onRescan={rescan} />
      <p className="text-[11px] text-slate-500 mt-4 text-center">
        Every scan, approval, refusal and exit is written to the audit trail with your owner account and timestamp.
      </p>
    </>
  );
};

export default VerificationResultPanel;
