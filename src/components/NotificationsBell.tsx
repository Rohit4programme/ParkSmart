import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Inbox, Loader2 } from 'lucide-react';
import { ParkSmartNotification } from '../types';
import { listNotifications, markNotificationsRead } from '../services/verificationService';

const POLL_INTERVAL_MS = 45_000;

/**
 * Notification inbox for check-in / check-out and booking events.
 * Polls the server, exposes the unread count in the accessible name, and
 * marks everything read on demand.
 */
export const NotificationsBell: React.FC = () => {
  const [notifications, setNotifications] = useState<ParkSmartNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    const res = await listNotifications();
    if (res.ok === true) {
      setNotifications(res.data.notifications);
      setUnread(res.data.unread);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleMarkRead = async () => {
    setBusy(true);
    const res = await markNotificationsRead();
    setBusy(false);
    if (res.ok === true) setUnread(res.data.unread);
    else setUnread(0);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative p-2 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-white/30 dark:border-white/10 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800 transition-colors cursor-pointer"
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        {unread > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center border border-white dark:border-slate-900"
            aria-hidden="true"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" /> Notifications
            </span>
            <button
              type="button"
              onClick={() => void handleMarkRead()}
              disabled={busy || unread === 0}
              className="text-[11px] font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <CheckCheck className="w-3 h-3" aria-hidden="true" />}
              Mark all read
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center" role="status" aria-live="polite">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin mx-auto" aria-hidden="true" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-5 text-center space-y-1.5">
                <Inbox className="w-5 h-5 text-slate-400 mx-auto" aria-hidden="true" />
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">No notifications yet</p>
                <p className="text-[11px] text-slate-500">Check-in and check-out updates will appear here.</p>
              </div>
            ) : (
              <ul>
                {notifications.slice(0, 30).map((item) => (
                  <li
                    key={item.id}
                    className={`px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0 ${
                      item.read ? 'bg-white dark:bg-slate-900' : 'bg-blue-50/60 dark:bg-blue-950/30'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!item.read && (
                        <span className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" aria-label="Unread" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100">{item.title}</p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">{item.body}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(item.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsBell;
