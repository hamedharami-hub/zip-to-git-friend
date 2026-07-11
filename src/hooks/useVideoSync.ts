import { useEffect, useRef, useState } from "react";
import type { SubtitleCue, SubtitleTrack } from "@/types";

/**
 * Binary search for the cue containing `adjustedMs`. `hint` is the last
 * returned index — when playback is forward and the next cue is one step
 * away, we short-circuit to O(1). Falls back to O(log n) binary search
 * when the hint misses (seek, jump, restart).
 */
function findCueIndex(cues: SubtitleCue[], adjustedMs: number, hint: number): number {
  if (cues.length === 0) return -1;
  // Fast path: hint cue still active.
  if (hint >= 0 && hint < cues.length) {
    const h = cues[hint];
    if (adjustedMs >= h.startMs && adjustedMs <= h.endMs) return hint;
    // Forward step: try hint+1.
    const next = cues[hint + 1];
    if (next && adjustedMs >= next.startMs && adjustedMs <= next.endMs) return hint + 1;
  }
  // Binary search for the largest cue with startMs <= adjustedMs.
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

export function useActiveCues(
  videoEl: HTMLVideoElement | null,
  primary: SubtitleTrack | null,
  secondary: SubtitleTrack | null,
) {
  const [activePrimary, setActivePrimary] = useState<SubtitleCue | null>(null);
  const [activeSecondary, setActiveSecondary] = useState<SubtitleCue | null>(null);

  // Refs so we don't re-create the rAF loop on every state update.
  const pIdxRef = useRef(-1);
  const sIdxRef = useRef(-1);

  useEffect(() => {
    if (!videoEl) return;
    // Reset hints whenever the source video or track changes.
    pIdxRef.current = -1;
    sIdxRef.current = -1;
    let raf = 0;

    const tick = () => {
      const tMs = videoEl.currentTime * 1000;

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

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Invalidate hint on seek so the next tick does a fresh binary search.
    const onSeek = () => {
      pIdxRef.current = -1;
      sIdxRef.current = -1;
    };
    videoEl.addEventListener("seeking", onSeek);

    return () => {
      cancelAnimationFrame(raf);
      videoEl.removeEventListener("seeking", onSeek);
    };
  }, [videoEl, primary, secondary]);

  return { activePrimary, activeSecondary };
}
