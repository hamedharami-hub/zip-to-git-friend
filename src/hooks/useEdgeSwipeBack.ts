import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * iOS-style edge swipe to go back.
 * - Touch must start within `edgeSize` px of the LEFT edge.
 * - Horizontal drag must exceed `threshold` px and dominate vertical movement.
 *
 * Plus a left→right two-finger or wide swipe anywhere opens optional drawers
 * via a custom event "app:swipe-open-left" — components can listen if they want.
 */
export function useEdgeSwipeBack({
  edgeSize = 28,
  threshold = 60,
  enabled = true,
}: { edgeSize?: number; threshold?: number; enabled?: boolean } = {}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      tracking = startX <= edgeSize;
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dx > threshold && dy < dx * 0.6) {
        if (window.history.length > 1) navigate(-1);
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [navigate, edgeSize, threshold, enabled]);
}
