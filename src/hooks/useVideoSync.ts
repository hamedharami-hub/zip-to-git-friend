import { useEffect, useState } from 'react';
import type { SubtitleCue, SubtitleTrack } from '@/types';

function getActiveCue(
  cues: SubtitleCue[],
  videoTimeMs: number,
  delayMs: number,
  speedMult: number,
): SubtitleCue | null {
  const adjusted = videoTimeMs * speedMult - delayMs;
  // binary search would be nicer; linear is fine for typical SRT sizes
  for (const c of cues) {
    if (adjusted >= c.startMs && adjusted <= c.endMs) return c;
    if (c.startMs > adjusted) break;
  }
  return null;
}

export function useActiveCues(
  videoEl: HTMLVideoElement | null,
  primary: SubtitleTrack | null,
  secondary: SubtitleTrack | null,
) {
  const [activePrimary, setActivePrimary] = useState<SubtitleCue | null>(null);
  const [activeSecondary, setActiveSecondary] = useState<SubtitleCue | null>(null);

  useEffect(() => {
    if (!videoEl) return;
    let raf = 0;
    let lastP: string | null = null;
    let lastS: string | null = null;

    const tick = () => {
      const tMs = videoEl.currentTime * 1000;
      const p = primary
        ? getActiveCue(primary.cues, tMs, primary.delayMs, primary.speedMultiplier)
        : null;
      const s = secondary
        ? getActiveCue(secondary.cues, tMs, secondary.delayMs, secondary.speedMultiplier)
        : null;
      const pId = p?.id ?? null;
      const sId = s?.id ?? null;
      if (pId !== lastP) {
        lastP = pId;
        setActivePrimary(p);
      }
      if (sId !== lastS) {
        lastS = sId;
        setActiveSecondary(s);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoEl, primary, secondary]);

  return { activePrimary, activeSecondary };
}
