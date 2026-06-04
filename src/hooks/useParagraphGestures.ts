import { useRef, useCallback } from 'react';

interface Options {
  enabled: boolean;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Fires when the user double-taps. The tap target's dir attribute helps you
   *  decide which language to read. */
  onDoubleTap?: (target: HTMLElement) => void;
  onLongPress?: (target: HTMLElement) => void;
  swipeThreshold?: number;
  longPressMs?: number;
  doubleTapMs?: number;
}

/**
 * Touch gesture handlers for paragraph cards: horizontal swipe, double-tap,
 * long-press. Pointer events so it works with both finger and mouse.
 */
export function useParagraphGestures({
  enabled,
  onSwipeLeft,
  onSwipeRight,
  onDoubleTap,
  onLongPress,
  swipeThreshold = 55,
  longPressMs = 500,
  doubleTapMs = 280,
}: Options) {
  const startX = useRef(0);
  const startY = useRef(0);
  const startT = useRef(0);
  const moved = useRef(false);
  const longTimer = useRef<number | null>(null);
  const lastTapT = useRef(0);
  const longFired = useRef(false);

  const clear = useCallback(() => {
    if (longTimer.current) {
      window.clearTimeout(longTimer.current);
      longTimer.current = null;
    }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.currentTarget;
    startX.current = e.clientX;
    startY.current = e.clientY;
    startT.current = performance.now();
    moved.current = false;
    longFired.current = false;
    clear();
    longTimer.current = window.setTimeout(() => {
      longFired.current = true;
      onLongPress?.(e.target as HTMLElement);
    }, longPressMs);
    // Avoid the synthetic click on long-press
    void target;
  }, [enabled, longPressMs, onLongPress, clear]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!enabled) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      moved.current = true;
      clear();
    }
  }, [enabled, clear]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!enabled) return;
    clear();
    if (longFired.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const dt = performance.now() - startT.current;
    if (absX > swipeThreshold && absX > absY * 1.5 && dt < 800) {
      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
      return;
    }
    if (!moved.current && dt < 300) {
      const now = performance.now();
      if (now - lastTapT.current < doubleTapMs) {
        onDoubleTap?.(e.target as HTMLElement);
        lastTapT.current = 0;
      } else {
        lastTapT.current = now;
      }
    }
  }, [enabled, swipeThreshold, doubleTapMs, onSwipeLeft, onSwipeRight, onDoubleTap, clear]);

  const onPointerCancel = useCallback(() => {
    clear();
  }, [clear]);

  if (!enabled) return {};
  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave: onPointerCancel,
  };
}

/** Speak text using the Web Speech API. Best-effort, no-op if unavailable. */
export function speakText(text: string, lang: 'en' | 'fa'): void {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'fa' ? 'fa-IR' : 'en-US';
    u.rate = lang === 'fa' ? 0.95 : 1.0;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}
