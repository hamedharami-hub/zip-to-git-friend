import { useEffect, useRef } from "react";

/**
 * Detects pinch-zoom gestures on the given element ref. On a meaningful
 * pinch open/close, fires a custom event `news-font-step` with `{ delta: +1|-1 }`
 * so font-size pickers can cycle. Throttled so a single gesture steps
 * at most every `cooldownMs`.
 */
export function usePinchFontStep(
  ref: React.RefObject<HTMLElement | null>,
  opts: { threshold?: number; cooldownMs?: number } = {},
) {
  const threshold = opts.threshold ?? 30; // px change before triggering
  const cooldown = opts.cooldownMs ?? 220;
  const startDist = useRef(0);
  const lastFire = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dist = (t: TouchList) => {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.hypot(dx, dy);
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) startDist.current = dist(e.touches);
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !startDist.current) return;
      const d = dist(e.touches);
      const delta = d - startDist.current;
      if (Math.abs(delta) < threshold) return;
      const now = Date.now();
      if (now - lastFire.current < cooldown) return;
      lastFire.current = now;
      startDist.current = d;
      window.dispatchEvent(
        new CustomEvent("news-font-step", { detail: { delta: delta > 0 ? 1 : -1 } }),
      );
    };
    const onEnd = () => {
      startDist.current = 0;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [ref, threshold, cooldown]);
}
