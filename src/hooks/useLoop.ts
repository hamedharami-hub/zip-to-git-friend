import { useEffect, useRef } from "react";
import { useLoopStore } from "@/store/loopStore";
import { useSubtitleStore } from "@/store/subtitleStore";

/**
 * Smart looping driver. Watches video time and, when the active loop cue's
 * endMs is reached, pauses for `pauseBetweenMs`, seeks back to startMs and
 * advances iteration / visibility per spec section 11.
 *
 * When the cue's iterations are exhausted and `chainNext` is true, the loop
 * advances to the next cue in the primary track and continues with the same
 * iteration count and pattern.
 *
 * Implementation note: the effect intentionally only subscribes to `enabled`
 * and `cue?.id`. It reads the rest of the loop config (iterations, pattern,
 * timing) from the store inside the rAF tick so that `setIteration` and
 * `setVisibility` updates do **not** tear down and recreate the loop — that
 * used to cancel the pending `setTimeout` that resumes playback and left the
 * player stuck paused after the first iteration.
 */
export function useLoop(videoEl: HTMLVideoElement | null) {
  const configEnabled = useLoopStore((s) => s.config.enabled);
  const cueId = useLoopStore((s) => s.cue?.id);
  const pausingRef = useRef(false);

  useEffect(() => {
    if (!configEnabled || !cueId || !videoEl) return;
    const v = videoEl;

    let raf = 0;
    let cancelled = false;
    let pausedTimer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      if (cancelled) return;

      const { config, cue } = useLoopStore.getState();
      if (!config.enabled || !cue) return;

      const tMs = v.currentTime * 1000;

      if (!pausingRef.current && tMs >= cue.endMs) {
        pausingRef.current = true;
        const wasPaused = v.paused;
        v.pause();

        const nextIter = config.currentIteration + 1;

        if (nextIter > config.maxIterations) {
          // Iterations exhausted for this cue.
          if (config.chainNext) {
            const primary = useSubtitleStore.getState().primary;
            const cues = primary?.cues ?? [];
            const idx = cues.findIndex((c) => c.id === cue.id);
            const next = cues[idx + 1];

            if (next) {
              pausedTimer = window.setTimeout(() => {
                if (cancelled) return;
                try {
                  v.currentTime = next.startMs / 1000;
                } catch {
                  /* no-op */
                }
                pausingRef.current = false;
                v.play().catch(() => undefined);
                useLoopStore.getState().advanceTo(next);
              }, config.pauseBetweenMs);
              return;
            }
          }

          // No next cue (or chaining disabled) — stop and resume normal playback.
          useLoopStore.getState().stopLoop();
          if (!wasPaused) {
            v.play().catch(() => undefined);
          }
          pausingRef.current = false;
          return;
        }

        // Start the next iteration after a short pause.
        pausedTimer = window.setTimeout(() => {
          if (cancelled) return;
          try {
            v.currentTime = cue.startMs / 1000;
          } catch {
            /* no-op */
          }
          const { config: cfg } = useLoopStore.getState();
          const iter = cfg.currentIteration + 1;
          const vis = cfg.visibilityPattern[iter - 1] ?? "both";
          useLoopStore.getState().setIteration(iter);
          useLoopStore.getState().setVisibility(vis);
          pausingRef.current = false;
          v.play().catch(() => undefined);
          raf = requestAnimationFrame(tick);
        }, config.pauseBetweenMs);
        return;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (pausedTimer) window.clearTimeout(pausedTimer);
      cancelAnimationFrame(raf);
      pausingRef.current = false;
    };
  }, [configEnabled, cueId, videoEl]);
}
