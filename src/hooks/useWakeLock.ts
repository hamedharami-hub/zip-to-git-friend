/**
 * Keeps the screen awake using the Wake Lock API while `active` is true.
 * No-op in browsers that don't support it. Re-acquires the lock on
 * visibility change (browsers drop the lock when the tab goes hidden).
 */
import { useEffect, useRef } from 'react';

interface WakeLockSentinel { release: () => Promise<void>; released: boolean }

export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    if (!nav?.wakeLock?.request) return;

    let cancelled = false;

    const acquire = async () => {
      if (!active || document.visibilityState !== 'visible') return;
      try {
        const s = await nav.wakeLock.request('screen');
        if (cancelled) { try { await s.release(); } catch { /* */ } return; }
        sentinelRef.current = s;
      } catch { /* permission/policy: silently ignore */ }
    };

    const release = async () => {
      const s = sentinelRef.current;
      sentinelRef.current = null;
      if (s && !s.released) { try { await s.release(); } catch { /* */ } }
    };

    if (active) {
      void acquire();
      const onVisible = () => {
        if (document.visibilityState === 'visible' && active && !sentinelRef.current) {
          void acquire();
        }
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        cancelled = true;
        document.removeEventListener('visibilitychange', onVisible);
        void release();
      };
    } else {
      void release();
      return () => { cancelled = true; };
    }
  }, [active]);
}
