import { useEffect, useRef, useState } from 'react';

interface Options {
  /** Called when the user pulls past the threshold and releases. Should return a promise. */
  onRefresh: () => Promise<void> | void;
  /** Pixel distance the user must pull before triggering. Defaults to 80. */
  threshold?: number;
  /** Disable when false (e.g. during another async op). Defaults to true. */
  enabled?: boolean;
}

interface State {
  /** 0..1 — visual progress of the pull. */
  progress: number;
  refreshing: boolean;
}

/**
 * Touch-only "pull-to-refresh" gesture. Only triggers when the page is
 * scrolled to the top and the user drags downward. No-op on desktop.
 */
export function usePullToRefresh({ onRefresh, threshold = 80, enabled = true }: Options): State {
  const [state, setState] = useState<State>({ progress: 0, refreshing: false });
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const progressRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0]?.clientY ?? null;
      pulling.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current == null) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
      if (dy <= 0) return;
      pulling.current = true;
      const eased = Math.min(1, dy / (threshold * 1.5));
      progressRef.current = eased;
      setState((s) => (s.refreshing ? s : { progress: eased, refreshing: false }));
    };

    const onTouchEnd = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      const finalProgress = progressRef.current;
      startY.current = null;
      if (finalProgress >= 1 / 1.5) {
        setState({ progress: 1, refreshing: true });
        try {
          await onRefresh();
        } finally {
          progressRef.current = 0;
          setState({ progress: 0, refreshing: false });
        }
      } else {
        progressRef.current = 0;
        setState({ progress: 0, refreshing: false });
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [enabled, onRefresh, threshold]);

  return state;
}
