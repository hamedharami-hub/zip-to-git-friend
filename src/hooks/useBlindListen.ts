import { useEffect, useRef, useState } from "react";
import type { SubtitleCue } from "@/types";
import { useSettingsStore } from "@/store/settingsStore";

/**
 * Blind-listen mode controller:
 * - Watches the active cue and auto-pauses the underlying media at the end of
 *   each cue (until the user advances).
 * - Tracks which cues have been "revealed" so the subtitle text can stay
 *   hidden until the user opts in.
 */
export function useBlindListen(
  mediaEl: HTMLMediaElement | null,
  activeCue: SubtitleCue | null,
  allCues: SubtitleCue[],
) {
  const enabled = useSettingsStore((s) => s.settings.blindListen);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const lastCueIdRef = useRef<string | null>(null);
  const pausedForCueRef = useRef<string | null>(null);

  // When we move to a new cue, reset the "paused for this cue" flag.
  useEffect(() => {
    if (!enabled) return;
    const id = activeCue?.id ?? null;
    if (id !== lastCueIdRef.current) {
      lastCueIdRef.current = id;
      pausedForCueRef.current = null;
    }
  }, [enabled, activeCue?.id]);

  // Poll for end-of-cue → pause.
  useEffect(() => {
    if (!enabled || !mediaEl) return;
    let raf = 0;
    const tick = () => {
      const cue = activeCue;
      if (cue && !mediaEl.paused) {
        const tMs = mediaEl.currentTime * 1000;
        // Pause slightly before the cue's end so the next cue's audio doesn't bleed in.
        if (tMs >= cue.endMs - 60 && pausedForCueRef.current !== cue.id) {
          pausedForCueRef.current = cue.id;
          try {
            mediaEl.pause();
          } catch {}
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, mediaEl, activeCue?.id]);

  const isRevealed = activeCue ? revealedIds.has(activeCue.id) : false;
  const reveal = () => {
    if (!activeCue) return;
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.add(activeCue.id);
      return next;
    });
  };
  const next = () => {
    if (!mediaEl) return;
    const cur = activeCue;
    if (!cur) {
      try {
        mediaEl.play().catch(() => {});
      } catch {}
      return;
    }
    const target = allCues.find((c) => c.startMs > cur.startMs + 10);
    if (target) {
      try {
        mediaEl.currentTime = target.startMs / 1000;
      } catch {}
    }
    pausedForCueRef.current = null;
    try {
      mediaEl.play().catch(() => {});
    } catch {}
  };

  return { enabled, isRevealed, reveal, next };
}
