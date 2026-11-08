import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, Loader2, RefreshCw, ScanLine } from 'lucide-react';

interface Props {
  /** Called once per detected code with the raw payload string. */
  onDetect: (payload: string) => void;
  /** Pause decoding (e.g. while a result dialog is open). */
  active?: boolean;
  /** Bump to re-arm the scanner after a result. */
  resetKey?: string | number;
  className?: string;
}

type ScannerState = 'starting' | 'running' | 'denied' | 'unavailable' | 'error';

const ERROR_COPY: Record<Exclude<ScannerState, 'starting' | 'running'>, { title: string; body: string }> = {
  denied: {
    title: 'Camera permission denied',
    body: 'Allow camera access in your browser settings, then retry — or enter the 8-character verification code manually.',
  },
  unavailable: {
    title: 'No camera available',
    body: 'This device or browser exposes no camera. Enter the 8-character verification code manually instead.',
  },
  error: {
    title: 'Camera could not start',
    body: 'The camera failed to open (it may be in use by another app). Retry, or enter the verification code manually.',
  },
};

/**
 * Live QR scanner (jsQR). Decodes from the device camera and reports the raw
 * payload; all validation happens on the server. Camera failures are surfaced
 * as explicit states so the manual-code fallback is always reachable.
 */
export const QrScanner: React.FC<Props> = ({ onDetect, active = true, resetKey, className = '' }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number>(0);
  const detectedRef = useRef<boolean>(false);

  const [state, setState] = useState<ScannerState>('starting');
  const [attempt, setAttempt] = useState(0);

  const stopStream = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    detectedRef.current = false;
  }, [resetKey]);

  useEffect(() => {
    if (!active) {
      stopStream();
      return;
    }

    let cancelled = false;
    setState('starting');

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unavailable');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();
        if (cancelled) return;
        setState('running');

        const canvas = canvasRef.current ?? document.createElement('canvas');
        canvasRef.current = canvas;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const tick = () => {
          if (cancelled) return;
          frameRef.current = requestAnimationFrame(tick);
          if (detectedRef.current || !ctx) return;
          const current = videoRef.current;
          if (!current || current.readyState !== current.HAVE_ENOUGH_DATA) return;

          const width = current.videoWidth;
          const height = current.videoHeight;
          if (!width || !height) return;
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          ctx.drawImage(current, 0, 0, width, height);
          const image = ctx.getImageData(0, 0, width, height);
          const code = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' });
          if (code?.data) {
            detectedRef.current = true;
            onDetect(code.data);
          }
        };
        frameRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name ?? '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
          setState('denied');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
          setState('unavailable');
        } else {
          console.warn('[QrScanner] camera failed:', err);
          setState('error');
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [active, attempt, onDetect, resetKey, stopStream]);

  const retry = () => setAttempt((value) => value + 1);

  if (state !== 'running') {
    const copy = state === 'starting' ? null : ERROR_COPY[state];
    return (
      <div
        className={`w-full aspect-[4/3] rounded-2xl border border-dashed border-slate-300 bg-slate-950/5 flex flex-col items-center justify-center gap-3 p-6 text-center ${className}`}
        role="alert"
      >
        {state === 'starting' ? (
          <>
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" aria-hidden="true" />
            <p className="text-xs font-bold text-slate-600">Starting camera…</p>
          </>
        ) : (
          <>
            <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
              <CameraOff className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-extrabold text-slate-900">{copy?.title}</p>
              <p className="text-xs text-slate-500 max-w-sm">{copy?.body}</p>
            </div>
            <button
              type="button"
              onClick={retry}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Retry camera
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`relative w-full aspect-[4/3] rounded-2xl overflow-hidden border border-slate-300 bg-slate-950 ${className}`}>
      <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-44 h-44 sm:w-52 sm:h-52 border-4 border-blue-400/80 rounded-xl shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]" />
      </div>
      <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-blue-400 animate-pulse" aria-hidden="true" />
      <div className="absolute bottom-0 inset-x-0 bg-slate-950/70 text-white text-[11px] font-semibold px-3 py-2 flex items-center gap-2">
        <ScanLine className="w-3.5 h-3.5 text-blue-300" aria-hidden="true" />
        <span>Point the camera at the driver's QR pass.</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-blue-200">
          <Camera className="w-3 h-3" aria-hidden="true" /> Live
        </span>
      </div>
      <span className="sr-only" role="status" aria-live="polite">Camera scanner active. Waiting for a QR code.</span>
    </div>
  );
};

export default QrScanner;
