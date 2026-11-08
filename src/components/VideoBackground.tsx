import { useEffect, useRef, useState } from 'react';

/**
 * Page background — the supplied `public/parking-background.mp4` clip.
 *
 * Layering (see `index.css` for the geometry):
 *
 *     video (z-index: 0)  ->  scrim overlay  ->  application UI (z-index: 10)
 *
 * The layer is `position: fixed`, so it can never introduce scrollbars or
 * shift layout, and it is `pointer-events: none`, so every button, input,
 * card, nav and modal in the app stays fully interactive. The clip is purely
 * decorative: the wrapper is `aria-hidden` and the element is unfocusable.
 *
 * Render this **once**, at the app root, outside the router's route content.
 */

/** The supplied clip. Kept out of `public/videos/` to match the provided path. */
const DEFAULT_SRC = '/parking-background.mp4';

/**
 * A real still frame taken from the clip itself (not a placeholder). It is
 * reused three ways: as the `<video poster>`, as the CSS background of the
 * layer while the clip buffers, and as the static fallback when the video
 * cannot play — so a reduced-motion visitor or a failed load never sees a
 * blank or broken element.
 */
const DEFAULT_POSTER = '/parking-background-poster.jpg';

/**
 * Push the ~10 MB download past first paint so it never competes with the
 * app bundle. `timeout` guarantees the clip still mounts on a busy main
 * thread, and the `setTimeout` path covers browsers without the idle API.
 */
function whenIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, { timeout: 800 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(callback, 0);
  return () => window.clearTimeout(handle);
}

export interface VideoBackgroundProps {
  /** Clip to play as the page background. */
  src?: string;
  /** Still frame from the clip, used as poster and static fallback. */
  poster?: string;
}

export function VideoBackground({
  src = DEFAULT_SRC,
  poster = DEFAULT_POSTER,
}: VideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [motionAllowed, setMotionAllowed] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [deferred, setDeferred] = useState(false);

  // `prefers-reduced-motion: reduce` — never download or play the clip; the
  // static poster fallback stands in for it.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setMotionAllowed(!query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  // Defer the download to idle time. Gated on the reduced-motion preference so
  // the clip is never requested at all when motion is unwelcome.
  useEffect(() => {
    if (!motionAllowed || unavailable) return;
    return whenIdle(() => setDeferred(true));
  }, [motionAllowed, unavailable]);

  // Autoplay, and keep it running indefinitely.
  //
  // `loop` alone is not enough: the browser will stop decoding a background
  // video on its own (Chrome energy saver, iOS memory pressure, a throttled or
  // backgrounded tab, or a stall at the loop seam) and then fire *no* event at
  // all. The old code played once and gave up, so the background silently froze
  // on a single frame. This keeps the clip alive:
  //
  //   1. `loop`/`playsInline`/`muted` are set as DOM *properties*, not only
  //      attributes, so a re-render can never drop them.
  //   2. A failed `play()` (refused autoplay, e.g. after the page has been
  //      idle) is retried instead of being swallowed.
  //   3. A watchdog re-asserts playback if the element ends up paused/ended.
  //   4. The watchdog also detects a *frozen* frame — still "playing" but with
  //      a `currentTime` that no longer advances — and re-seeks to restart.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.volume = 0;
    video.loop = true;
    video.playsInline = true;

    let disposed = false;
    let lastTime = video.currentTime;
    let lastAdvanceAt = Date.now();

    const tryPlay = () => {
      // Never fight our own `pause()` below: a hidden tab must stay paused.
      if (disposed || document.hidden) return;
      if (video.paused || video.ended) {
        const attempt = video.play();
        if (attempt && typeof attempt.catch === 'function') {
          attempt.catch(() => {
            // Autoplay can be refused outright. Retry shortly rather than
            // leaving a frozen frame behind.
            window.setTimeout(() => {
              if (!disposed) tryPlay();
            }, 1500);
          });
        }
      }
    };

    tryPlay();

    const resume = () => tryPlay();
    const revive = () => tryPlay();
    video.addEventListener('ended', revive);
    video.addEventListener('stalled', revive);
    video.addEventListener('waiting', revive);
    video.addEventListener('suspend', revive);
    video.addEventListener('emptied', revive);
    video.addEventListener('canplay', resume);

    // Safety net for pauses we did not initiate (OS media controls, the
    // browser reclaiming the decoder, a React remount reusing this node).
    video.addEventListener('pause', revive);

    const watchdog = window.setInterval(() => {
      if (disposed) return;
      if (document.hidden) {
        lastTime = video.currentTime;
        lastAdvanceAt = Date.now();
        return;
      }
      if (video.paused || video.ended) {
        tryPlay();
        return;
      }
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        lastAdvanceAt = Date.now();
        return;
      }
      // "Playing" but frozen for several seconds: rewind and keep going.
      if (Date.now() - lastAdvanceAt > 4000) {
        lastAdvanceAt = Date.now();
        try {
          video.currentTime = 0;
        } catch {
          /* seeking can throw before metadata; the next tick retries */
        }
        tryPlay();
      }
    }, 1500);

    const onVisibilityChange = () => {
      if (document.hidden) {
        video.pause();
        lastTime = video.currentTime;
        lastAdvanceAt = Date.now();
      } else {
        tryPlay();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(watchdog);
      video.removeEventListener('ended', revive);
      video.removeEventListener('stalled', revive);
      video.removeEventListener('waiting', revive);
      video.removeEventListener('suspend', revive);
      video.removeEventListener('emptied', revive);
      video.removeEventListener('canplay', resume);
      video.removeEventListener('pause', revive);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [deferred, src]);

  const showVideo = motionAllowed && !unavailable && deferred;

  return (
    <div className="app-background" aria-hidden="true">
      {showVideo && (
        <video
          ref={videoRef}
          className="app-background__video"
          src={src}
          poster={poster}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          controls={false}
          disablePictureInPicture
          tabIndex={-1}
          onCanPlay={(event) => {
            const el = event.currentTarget;
            if (el.paused) void el.play().catch(() => undefined);
          }}
          /* Missing or undecodable clip: drop the element entirely so the
             static fallback shows instead of a broken video box. */
          onError={() => setUnavailable(true)}
        />
      )}
      <div className="app-background__scrim" />
    </div>
  );
}

export default VideoBackground;
