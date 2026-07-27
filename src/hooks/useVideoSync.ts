import { useCallback, useEffect, useRef, useState } from "react";
import type { SubtitleCue, SubtitleTrack } from "@/types";
import { useSettingsStore } from "@/store/settingsStore";
import { useLoopStore } from "@/store/loopStore";
import { useSubtitleStore } from "@/store/subtitleStore";

/**
 * Binary search for the cue containing `adjustedMs`. `hint` is the last
 * returned index — when playback is forward and the next cue is one step
 * away, we short-circuit to O(1). Falls back to O(log n) binary search
 * when the hint misses (seek, jump, restart).
 */
function findCueIndex(cues: SubtitleCue[], adjustedMs: number, hint: number): number {
  if (cues.length === 0) return -1;
  if (hint >= 0 && hint < cues.length) {
    const h = cues[hint];
    if (adjustedMs >= h.startMs && adjustedMs <= h.endMs) return hint;
    const next = cues[hint + 1];
    if (next && adjustedMs >= next.startMs && adjustedMs <= next.endMs) return hint + 1;
  }
  let lo = 0;
  let hi = cues.length - 1;
  let cand = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].startMs <= adjustedMs) {
      cand = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (cand >= 0 && adjustedMs <= cues[cand].endMs) return cand;
  return -1;
}

export interface BlindListenState {
  enabled: boolean;
  isRevealed: boolean;
  reveal: () => void;
  next: () => void;
}

/**
 * Single rAF ticker for the video player.
 *
 * Replaces the four separate `requestAnimationFrame` loops that were polling
 * the same `<video>` element (`useActiveCues`, `useLoop`, `useAutoPauseAtCueEnd`,
 * `useBlindListen`). It keeps one loop that:
 *  - tracks active primary/secondary cues,
 *  - drives loop iteration/visibility/chain,
 *  - auto-pauses at the end of each cue when enabled,
 *  - controls blind-listen pause/reveal flow.
 */
export function useVideoSync(
  videoEl: HTMLVideoElement | null,
  primary: SubtitleTrack | null,
  secondary: SubtitleTrack | null,
) {
  const [activePrimary, setActivePrimary] = useState<SubtitleCue | null>(null);
  const [activeSecondary, setActiveSecondary] = useState<SubtitleCue | null>(null);

  const autoPauseAtCueEnd = useSettingsStore((s) => s.settings.autoPauseAtCueEnd);
  const blindEnabled = useSettingsStore((s) => s.settings.blindListen);
  const loopEnabled = useLoopStore((s) => s.config.enabled);
  const loopCueId = useLoopStore((s) => s.cue?.id);

  const pIdxRef = useRef(-1);
  const sIdxRef = useRef(-1);

  const pausedForCueRef = useRef<string | null>(null);
  const blindLastCueIdRef = useRef<string | null>(null);
  const pausedForBlindRef = useRef<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const pausingRef = useRef(false);
  const pausedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const reveal = useCallback(() => {
    if (!activePrimary) return;
    setRevealedIds((prev) => {
      if (prev.has(activePrimary.id)) return prev;
      const next = new Set(prev);
      next.add(activePrimary.id);
      return next;
    });
  }, [activePrimary]);

  const next = useCallback(() => {
    if (!videoEl) return;
    const cur = activePrimary;
    const cues = primary?.cues ?? [];
    if (!cur) {
      videoEl.play().catch(() => undefined);
      return;
    }
    const target = cues.find((c) => c.startMs > cur.startMs + 10);
    if (target) {
      try {
        videoEl.currentTime = target.startMs / 1000;
      } catch {
        /* no-op */
      }
    }
    pausedForBlindRef.current = null;
    videoEl.play().catch(() => undefined);
  }, [activePrimary, primary?.cues, videoEl]);

  useEffect(() => {
    if (!videoEl) return;
    pIdxRef.current = -1;
    sIdxRef.current = -1;
    pausedForCueRef.current = null;
    blindLastCueIdRef.current = null;
    pausedForBlindRef.current = null;
    pausingRef.current = false;
    cancelledRef.current = false;
    if (pausedTimerRef.current) {
      clearTimeout(pausedTimerRef.current);
      pausedTimerRef.current = null;
    }

    let raf = 0;

    const maybeLoopTick = (tMs: number) => {
      const { config, cue } = useLoopStore.getState();
      if (!config.enabled || !cue) return false;
      if (pausingRef.current || tMs < cue.endMs) return false;

      pausingRef.current = true;
      const wasPaused = videoEl.paused;
      videoEl.pause();
      const nextIter = config.currentIteration + 1;

      if (nextIter > config.maxIterations) {
        if (config.chainNext) {
          const p = useSubtitleStore.getState().primary;
          const cues = p?.cues ?? [];
          const idx = cues.findIndex((c) => c.id === cue.id);
          const nextCue = cues[idx + 1];
          if (nextCue) {
            pausedTimerRef.current = window.setTimeout(() => {
              if (cancelledRef.current) return;
              try {
                videoEl.currentTime = nextCue.startMs / 1000;
              } catch {
                /* no-op */
              }
              pausingRef.current = false;
              videoEl.play().catch(() => undefined);
              useLoopStore.getState().advanceTo(nextCue);
            }, config.pauseBetweenMs);
            return true;
          }
        }

        useLoopStore.getState().stopLoop();
        if (!wasPaused) videoEl.play().catch(() => undefined);
        pausingRef.current = false;
        return true;
      }

      pausedTimerRef.current = window.setTimeout(() => {
        if (cancelledRef.current) return;
        try {
          videoEl.currentTime = cue.startMs / 1000;
        } catch {
          /* no-op */
        }
        const cfg = useLoopStore.getState().config;
        const iter = cfg.currentIteration + 1;
        const vis = cfg.visibilityPattern[iter - 1] ?? "both";
        useLoopStore.getState().setIteration(iter);
        useLoopStore.getState().setVisibility(vis);
        pausingRef.current = false;
        videoEl.play().catch(() => undefined);
      }, config.pauseBetweenMs);
      return true;
    };

    const tick = () => {
      if (cancelledRef.current) return;
      raf = requestAnimationFrame(tick);
      if (!videoEl || pausingRef.current) return;

      const tMs = videoEl.currentTime * 1000;

      // Active cues
      if (primary) {
        const adj = tMs * primary.speedMultiplier - primary.delayMs;
        const idx = findCueIndex(primary.cues, adj, pIdxRef.current);
        if (idx !== pIdxRef.current) {
          pIdxRef.current = idx;
          setActivePrimary(idx >= 0 ? primary.cues[idx] : null);
        }
      } else if (pIdxRef.current !== -1) {
        pIdxRef.current = -1;
        setActivePrimary(null);
      }

      if (secondary) {
        const adj = tMs * secondary.speedMultiplier - secondary.delayMs;
        const idx = findCueIndex(secondary.cues, adj, sIdxRef.current);
        if (idx !== sIdxRef.current) {
          sIdxRef.current = idx;
          setActiveSecondary(idx >= 0 ? secondary.cues[idx] : null);
        }
      } else if (sIdxRef.current !== -1) {
        sIdxRef.current = -1;
        setActiveSecondary(null);
      }

      const activeCue = activePrimary; // fresh value from closure not guaranteed; read primary directly below
      const curPrimary = pIdxRef.current >= 0 ? (primary?.cues[pIdxRef.current] ?? null) : null;

      // Blind listen: pause slightly before the cue end.
      if (blindEnabled && curPrimary && !videoEl.paused) {
        const curId = curPrimary.id;
        if (blindLastCueIdRef.current !== curId) {
          blindLastCueIdRef.current = curId;
          pausedForBlindRef.current = null;
        }
        if (tMs >= curPrimary.endMs - 60 && pausedForBlindRef.current !== curId) {
          pausedForBlindRef.current = curId;
          videoEl.pause();
        }
      }

      // Auto-pause at cue end (suppressed while loop is active).
      if (autoPauseAtCueEnd && curPrimary && !loopEnabled && !videoEl.paused) {
        if (tMs >= curPrimary.endMs - 30 && pausedForCueRef.current !== curPrimary.id) {
          pausedForCueRef.current = curPrimary.id;
          try {
            videoEl.pause();
            videoEl.currentTime = curPrimary.endMs / 1000;
          } catch {
            /* no-op */
          }
        }
      }

      // Loop driver owns playback transitions when enabled.
      if (loopEnabled) {
        const consumed = maybeLoopTick(tMs);
        if (consumed) return;
      }
    };

    const onSeek = () => {
      pIdxRef.current = -1;
      sIdxRef.current = -1;
    };

    const onPlay = () => {
      pausedForCueRef.current = null;
    };

    videoEl.addEventListener("seeking", onSeek);
    videoEl.addEventListener("play", onPlay);

    raf = requestAnimationFrame(tick);

    return () => {
      cancelledRef.current = true;
      if (pausedTimerRef.current) {
        clearTimeout(pausedTimerRef.current);
        pausedTimerRef.current = null;
      }
      cancelAnimationFrame(raf);
      videoEl.removeEventListener("seeking", onSeek);
      videoEl.removeEventListener("play", onPlay);
      pausingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEl, primary, secondary, autoPauseAtCueEnd, blindEnabled, loopEnabled, loopCueId]);

  const isRevealed = activePrimary ? revealedIds.has(activePrimary.id) : false;

  return {
    activePrimary,
    activeSecondary,
    blind: {
      enabled: blindEnabled,
      isRevealed,
      reveal,
      next,
    } as BlindListenState,
  };
}
