import { useEffect, useRef } from "react";
import type { SubtitleCue } from "@/types";

interface Options {
  enabled: boolean;
  /** When loop is running, auto-pause is suppressed (loop owns playback). */
  suppressed?: boolean;
}

/**
 * Pauses the video at the end of every active subtitle cue, once per cue.
 * The user must press play (or use any seek/cue jump) to continue. Pressing
 * play after a pause re-arms the next cue, so the next cue will pause again.
 *
 * Driven by a polling rAF loop so it works regardless of how time advances
 * (native timeupdate is throttled to 4× / sec on some browsers).
 */
export function useAutoPauseAtCueEnd(
  videoEl: HTMLVideoElement | null,
  activeCue: SubtitleCue | null,
  { enabled, suppressed = false }: Options,
) {
  const pausedForCueRef = useRef<string | null>(null);

  // Re-arm whenever the active cue changes (so we pause once per cue).
  useEffect(() => {
    if (!activeCue) return;
    if (pausedForCueRef.current !== activeCue.id) {
      // New cue started — clear the latch so we pause at *its* end.
      pausedForCueRef.current = null;
    }
  }, [activeCue?.id]);

  // Re-arm on user-initiated play after an auto-pause.
  useEffect(() => {
    if (!videoEl) return;
    const onPlay = () => {
      // If user pressed play while still inside the cue we paused on,
      // clear the latch so the same cue won't immediately re-pause.
      pausedForCueRef.current = null;
    };
    videoEl.addEventListener("play", onPlay);
    return () => videoEl.removeEventListener("play", onPlay);
  }, [videoEl]);

  useEffect(() => {
    if (!enabled || suppressed || !videoEl || !activeCue) return;
    let raf = 0;
    const tick = () => {
      const v = videoEl;
      if (!v.paused) {
        const tMs = v.currentTime * 1000;
        // Pause exactly at (or just past) the cue end, once.
        if (tMs >= activeCue.endMs - 30 && pausedForCueRef.current !== activeCue.id) {
          pausedForCueRef.current = activeCue.id;
          try {
            v.pause();
            // Clamp to cue end for a clean stopping point.
            v.currentTime = activeCue.endMs / 1000;
          } catch {
            /* ignore */
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoEl, activeCue?.id, activeCue?.endMs, enabled, suppressed]);
}
