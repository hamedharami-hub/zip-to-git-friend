import { RefObject, useEffect, useRef } from 'react';
import { useLoopStore } from '@/store/loopStore';
import { useSubtitleStore } from '@/store/subtitleStore';

/**
 * Smart looping driver. Watches video time and, when the active loop cue's
 * endMs is reached, pauses for `pauseBetweenMs`, seeks back to startMs and
 * advances iteration / visibility per spec section 11.
 *
 * When the cue's iterations are exhausted and `chainNext` is true, the loop
 * advances to the next cue in the primary track and continues with the same
 * iteration count and pattern.
 */
export function useLoop(videoRef: RefObject<HTMLVideoElement>) {
  const config = useLoopStore((s) => s.config);
  const cue = useLoopStore((s) => s.cue);
  const setIteration = useLoopStore((s) => s.setIteration);
  const setVisibility = useLoopStore((s) => s.setVisibility);
  const advanceTo = useLoopStore((s) => s.advanceTo);
  const stopLoop = useLoopStore((s) => s.stopLoop);

  const pausingRef = useRef(false);

  useEffect(() => {
    if (!config.enabled || !cue) return;
    const v = videoRef.current;
    if (!v) return;

    let raf = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const tMs = v.currentTime * 1000;
      if (!pausingRef.current && tMs >= cue.endMs) {
        pausingRef.current = true;
        const wasPaused = v.paused;
        v.pause();
        const nextIter = config.currentIteration + 1;

        if (nextIter > config.maxIterations) {
          // Iterations exhausted for this cue.
          // If chainNext is enabled, jump to the next cue and keep looping.
          if (config.chainNext) {
            const primary = useSubtitleStore.getState().primary;
            const cues = primary?.cues ?? [];
            const idx = cues.findIndex((c) => c.id === cue.id);
            const next = idx >= 0 ? cues[idx + 1] : undefined;
            if (next) {
              window.setTimeout(() => {
                if (cancelled) return;
                try {
                  v.currentTime = next.startMs / 1000;
                } catch {}
                advanceTo(next);
                pausingRef.current = false;
                v.play().catch(() => {});
              }, config.pauseBetweenMs);
              return;
            }
          }
          // No next cue (or chaining disabled) — stop and resume normal playback.
          stopLoop();
          if (!wasPaused) {
            v.play().catch(() => {});
          }
          pausingRef.current = false;
          return;
        }

        window.setTimeout(() => {
          if (cancelled) return;
          try {
            v.currentTime = cue.startMs / 1000;
          } catch {}
          setIteration(nextIter);
          const vis = config.visibilityPattern[nextIter - 1] ?? 'both';
          setVisibility(vis);
          pausingRef.current = false;
          v.play().catch(() => {});
        }, config.pauseBetweenMs);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      pausingRef.current = false;
    };
  }, [
    videoRef,
    config.enabled,
    config.chainNext,
    cue?.id,
    config.currentIteration,
    config.maxIterations,
    config.pauseBetweenMs,
    config.visibilityPattern,
    setIteration,
    setVisibility,
    advanceTo,
    stopLoop,
  ]);
}
