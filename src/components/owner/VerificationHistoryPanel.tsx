import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  History,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { VerificationAuditEntry } from '../../types';
import { getVerificationHistory } from '../../services/verificationService';

type LoadState = 'loading' | 'ready' | 'error';
type ResultFilter = 'all' | 'success' | 'failure';

export const ACTION_LABELS: Record<string, string> = {
  QR_SCANNED: 'QR scanned',
  BOOKING_VERIFIED: 'Booking verified',
  CHECK_IN_APPROVED: 'Check-in approved',
  CHECK_IN_REJECTED: 'Entry refused',
  CHECK_OUT: 'Check-out',
  INVALID_QR: 'Invalid QR',
  EXPIRED_QR: 'Expired QR',
  WRONG_OWNER: 'Wrong owner',
  QR_REGENERATED: 'QR regenerated',
  QR_REVOKED: 'QR revoked',
  BOOKING_CANCELLED: 'Booking cancelled',
  LOT_CLAIMED: 'Facility claimed',
};

function defaultFrom(): string {
  const date = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  return date.toISOString().slice(0, 10);
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Verification audit history with date + result filters (spec §24). */
export const VerificationHistoryPanel: React.FC = () => {
  const [entries, setEntries] = useState<VerificationAuditEntry[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');

  const load = useCallback(async () => {
    setLoadState('loading');
    setError('');
    const res = await getVerificationHistory({
      ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
      ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}),
      limit: 500,
    });
    if (res.ok === true) {
      setEntries(res.data);
      setLoadState('ready');
    } else {
      setError(res.error.message);
      setLoadState('error');
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (resultFilter === 'all') return entries;
    return entries.filter((entry) => entry.result === resultFilter);
  }, [entries, resultFilter]);

  const counts = useMemo(
    () => ({
      success: entries.filter((e) => e.result === 'success').length,
      failure: entries.filter((e) => e.result === 'failure').length,
    }),
    [entries]
  );

  return (
    <section aria-label="Verification history" className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600" aria-hidden="true" /> Verification History
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">Audit trail of every scan, approval, refusal and exit.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            aria-label="Refresh history"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label htmlFor="history-from" className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
              From
            </label>
            <input
              id="history-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="history-to" className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
              To
            </label>
            <input
              id="history-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          <div className="sm:w-56">
            <label htmlFor="history-result" className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1 flex items-center gap-1.5">
              <Filter className="w-3 h-3" aria-hidden="true" /> Result
            </label>
            <select
              id="history-result"
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value as ResultFilter)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
            >
              <option value="all">All results ({entries.length})</option>
              <option value="success">Successful ({counts.success})</option>
              <option value="failure">Refused / failed ({counts.failure})</option>
            </select>
          </div>
        </div>
      </div>

      {loadState === 'loading' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-2" role="status" aria-live="polite">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin mx-auto" aria-hidden="true" />
          <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Loading audit entries…</p>
        </div>
      )}

      {loadState === 'error' && (
        <div className="bg-white dark:bg-slate-900 border border-rose-200 rounded-2xl p-6 text-center space-y-3" role="alert">
          <AlertTriangle className="w-5 h-5 text-rose-600 mx-auto" aria-hidden="true" />
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Could not load the verification history</p>
          <p className="text-xs text-slate-500">{error}</p>
          <button type="button" onClick={() => void load()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {loadState === 'ready' && visible.length === 0 && (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center space-y-2">
          <History className="w-6 h-6 text-slate-400 mx-auto" aria-hidden="true" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No audit entries in this range.</p>
          <p className="text-xs text-slate-500">Adjust the dates or clear the result filter.</p>
        </div>
      )}

      {loadState === 'ready' && visible.length > 0 && (
        <ul className="space-y-2">
          {visible.map((entry) => {
            const success = entry.result === 'success';
            return (
              <li
                key={entry.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-start gap-3 shadow-2xs"
              >
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    success ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}
                  aria-hidden="true"
                >
                  {success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${
                        success ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      {success ? 'Success' : 'Refused'}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">{entry.reason}</span>
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500 font-medium mt-0.5">
                    <span>{new Date(entry.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    {entry.bookingId && <span className="font-mono">Booking {entry.bookingId}</span>}
                    {entry.parkingLocationId && <span className="truncate max-w-[220px]">{entry.parkingLocationId}</span>}
                    {entry.ip && <span className="font-mono">IP {entry.ip}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default VerificationHistoryPanel;
