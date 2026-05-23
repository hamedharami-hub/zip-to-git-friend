import { useEffect, useRef } from 'react';
import { addListeningSeconds } from '@/lib/db';

/**
 * Tracks how long the user actively listens/watches a media element and
 * persists the running total to today's listening session row.
 *
 * Counts only when the element is playing AND the page is visible. Flushes
 * on pause / unmount / page-hide.
 */
export function useListeningTracker(media: HTMLMediaElement | null) {
  const lastTickRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);

  useEffect(() => {
    if (!media) return;
    let raf = 0;

    const flush = () => {
      const seconds = accumulatedRef.current;
      accumulatedRef.current = 0;
      lastTickRef.current = null;
      if (seconds >= 1) {
        addListeningSeconds(seconds).catch(() => {});
      }
    };

    const tick = () => {
      const now = performance.now();
      if (
        !media.paused &&
        media.readyState >= 2 &&
        document.visibilityState === 'visible'
      ) {
        if (lastTickRef.current !== null) {
          const dt = (now - lastTickRef.current) / 1000;
          // Cap dt at 2s to avoid huge jumps (tab backgrounded etc.)
          if (dt > 0 && dt < 2) accumulatedRef.current += dt;
        }
        lastTickRef.current = now;
      } else {
        lastTickRef.current = null;
      }
      // Persist every ~10 accumulated seconds to avoid losing data on crash.
      if (accumulatedRef.current >= 10) flush();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onHide = () => flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      flush();
    };
  }, [media]);
}
