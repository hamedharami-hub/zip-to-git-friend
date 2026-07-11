/**
 * While `active` is true, loop a near-silent audio element so the page
 * keeps audio focus on Android Chrome — helps `speechSynthesis` survive
 * screen-off / backgrounding. iOS Safari still suspends speech when locked.
 */
import { useEffect, useRef } from "react";

const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

export function useTtsKeepAlive(active: boolean): void {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!active) {
      try {
        ref.current?.pause();
      } catch {
        /* */
      }
      return;
    }
    try {
      if (!ref.current) {
        const a = new Audio(SILENT_WAV);
        a.loop = true;
        a.volume = 0.001;
        ref.current = a;
      }
      void ref.current.play().catch(() => {
        /* autoplay may block; harmless */
      });
    } catch {
      /* noop */
    }
    return () => {
      try {
        ref.current?.pause();
      } catch {
        /* */
      }
    };
  }, [active]);
}
