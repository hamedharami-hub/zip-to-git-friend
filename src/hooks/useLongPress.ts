import { useCallback, useRef } from 'react';

/**
 * Long-press hook that fires `onLongPress` after `delay` ms of touch/mouse
 * hold, while suppressing the click that follows.
 */
export function useLongPress(onLongPress: () => void, delay = 500) {
  const timer = useRef<number | null>(null);
  const triggered = useRef(false);

  const start = useCallback(() => {
    triggered.current = false;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      triggered.current = true;
      onLongPress();
    }, delay);
  }, [onLongPress, delay]);

  const clear = useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  return {
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: clear,
    onTouchCancel: clear,
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: clear,
    onContextMenu: (e: React.MouseEvent) => {
      // On desktop, right-click acts as long-press equivalent.
      e.preventDefault();
      onLongPress();
    },
    /** True if last interaction triggered long-press (use in onClick to suppress). */
    consumeClick: () => {
      const t = triggered.current;
      triggered.current = false;
      return t;
    },
  };
}
