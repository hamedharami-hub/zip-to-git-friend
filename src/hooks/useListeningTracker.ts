import { useEffect, useRef } from "react";
import { addListeningSeconds } from "@/lib/db";

/**
 * Tracks how long the user actively listens/watches a media element and
 * persists the running total to today's listening session row.
 *
 * Counts only when the element is playing AND the page is visible. Flushes
 * on pause / unmount / page-hide.
 */
export function useListeningTracker(media: HTMLMediaElement | null) {
  const accumulatedRef = useRef(0);

  useEffect(() => {
    if (!media) return;

    const flush = () => {
      const seconds = accumulatedRef.current;
      accumulatedRef.current = 0;
      if (seconds >= 1) {
        addListeningSeconds(seconds).catch(() => undefined);
      }
    };

    let interval: ReturnType<typeof setInterval> | null = null;
    let lastTick: number | null = null;

    const tick = () => {
      if (!media.paused && media.readyState >= 2 && document.visibilityState === "visible") {
        const now = performance.now();
        if (lastTick !== null) {
          const dt = (now - lastTick) / 1000;
          if (dt > 0 && dt < 2) accumulatedRef.current += dt;
        }
        lastTick = now;
        if (accumulatedRef.current >= 10) flush();
      } else {
        lastTick = null;
      }
    };

    const onPlay = () => {
      lastTick = performance.now();
      if (!interval) interval = setInterval(tick, 1000);
    };

    const onPause = () => {
      tick();
      flush();
      lastTick = null;
    };

    const onHide = () => {
      tick();
      flush();
      lastTick = null;
    };

    media.addEventListener("play", onPlay);
    media.addEventListener("playing", onPlay);
    media.addEventListener("pause", onPause);
    media.addEventListener("ended", onPause);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);

    // If the media is already playing when the hook mounts, start ticking.
    if (!media.paused) {
      onPlay();
    }

    return () => {
      if (interval) clearInterval(interval);
      media.removeEventListener("play", onPlay);
      media.removeEventListener("playing", onPlay);
      media.removeEventListener("pause", onPause);
      media.removeEventListener("ended", onPause);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [media]);
}
