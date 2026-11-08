import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  /** Destination of the back control (defaults to the app home). */
  backTo?: string;
  backLabel?: string;
  /** Right-hand controls (notifications bell, primary action, …). */
  actions?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}

/**
 * Chrome shared by every standalone route (booking details, QR ticket, owner
 * verification screens): applies the saved theme, provides a labelled back
 * control and a consistent, responsive, accessible layout.
 */
export const PageShell: React.FC<Props> = ({
  title,
  subtitle,
  backTo = '/',
  backLabel = 'Back to ParkSmart',
  actions,
  children,
  wide = false,
}) => {
  useEffect(() => {
    const saved = localStorage.getItem('parksmart_theme');
    const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const useDark = saved === 'dark' || (saved !== 'light' && prefersDark);
    document.documentElement.classList.toggle('dark', useDark);
  }, []);

  /* The route root is transparent so the page-wide video background
     (components/VideoBackground.tsx) shows through — the content below sits
     in opaque cards and a translucent glass header of its own. */
  return (
    <div className="min-h-screen bg-transparent text-slate-800 dark:text-slate-100 font-sans antialiased">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/70 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800">
        <div className={`${wide ? 'max-w-6xl' : 'max-w-3xl'} mx-auto px-4 sm:px-6 py-3 flex items-center gap-3`}>
          <Link
            to={backTo}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors"
            aria-label={backLabel}
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{backLabel}</span>
          </Link>

          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">{title}</h1>
            {subtitle && <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">{subtitle}</p>}
          </div>

          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      </header>

      <main className={`${wide ? 'max-w-6xl' : 'max-w-3xl'} mx-auto px-4 sm:px-6 py-5 sm:py-7`}>{children}</main>
    </div>
  );
};

export default PageShell;
