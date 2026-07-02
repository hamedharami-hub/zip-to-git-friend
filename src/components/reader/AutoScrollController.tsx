/**
 * Auto-scroll controller: while enabled, scrolls the nearest scrollable
 * ancestor of `containerSelector` at a rate derived from WPM. Also renders
 * an optional fixed horizontal "ruler" line in the middle of the viewport.
 */
import { useEffect } from 'react';
import { useReadingMode } from '@/hooks/useReadingMode';

function findScrollParent(el: HTMLElement | null): HTMLElement | Window {
  let node: HTMLElement | null = el;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return window;
}

interface Props {
  containerSelector: string;
}

export function AutoScrollController({ containerSelector }: Props) {
  const { autoScrollEnabled, autoScrollWpm, rulerEnabled } = useReadingMode();

  useEffect(() => {
    if (!autoScrollEnabled) return;
    const el = document.querySelector<HTMLElement>(containerSelector);
    if (!el) return;
    const parent = findScrollParent(el);
    // Estimate: avg word ~ 8px wide × X chars per line — use line height as proxy.
    // Roughly 12 words per line at typical widths → pxPerSec = wpm/60 * lineHeight / 12
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 26;
    const pxPerSec = (autoScrollWpm / 60) * (lh / 10);

    let raf = 0;
    let last = performance.now();
    let paused = false;

    const step = (t: number) => {
      const dt = t - last;
      last = t;
      if (!paused) {
        const delta = pxPerSec * (dt / 1000);
        if (parent === window) window.scrollBy({ top: delta, behavior: 'auto' });
        else (parent as HTMLElement).scrollTop += delta;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const toggle = (e: Event) => {
      // Ignore taps on buttons/links.
      const target = e.target as HTMLElement;
      if (target.closest('button,a,input,select,textarea')) return;
      paused = !paused;
    };
    el.addEventListener('click', toggle);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('click', toggle);
    };
  }, [autoScrollEnabled, autoScrollWpm, containerSelector]);

  if (!rulerEnabled) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 right-0 top-1/2 -translate-y-1/2 z-40"
    >
      <div className="mx-auto max-w-4xl h-[3px] bg-primary/40 rounded-full shadow-[0_0_12px_rgba(59,130,246,0.6)]" />
    </div>
  );
}
