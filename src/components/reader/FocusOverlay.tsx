/**
 * Focus mode: adds classes to the reading container that either blur
 * non-focused paragraphs, dim non-focused sentences, or both.
 * The "focused" paragraph is the one closest to the viewport center,
 * detected via IntersectionObserver.
 */
import { useEffect } from 'react';
import { useReadingMode } from '@/hooks/useReadingMode';

interface Props {
  containerSelector: string;
}

export function FocusOverlay({ containerSelector }: Props) {
  const { focusBlurEnabled, focusHighlightEnabled } = useReadingMode();

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(containerSelector);
    if (!root) return;

    const active = focusBlurEnabled || focusHighlightEnabled;
    if (!active) {
      root.classList.remove('rm-focus-blur', 'rm-focus-dim');
      root.querySelectorAll('.rm-focused').forEach((n) => n.classList.remove('rm-focused'));
      return;
    }

    root.classList.toggle('rm-focus-blur', focusBlurEnabled);
    root.classList.toggle('rm-focus-dim', focusHighlightEnabled);

    const paras = Array.from(root.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, li, blockquote'));
    paras.forEach((p) => p.classList.add('rm-para'));

    const setFocused = (el: HTMLElement) => {
      paras.forEach((p) => p.classList.remove('rm-focused'));
      el.classList.add('rm-focused');
    };

    const onScroll = () => {
      const centerY = window.innerHeight / 2;
      let best: HTMLElement | null = null;
      let bestDist = Infinity;
      for (const p of paras) {
        const rect = p.getBoundingClientRect();
        const mid = (rect.top + rect.bottom) / 2;
        const dist = Math.abs(mid - centerY);
        if (dist < bestDist) { bestDist = dist; best = p; }
      }
      if (best) setFocused(best);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      root.classList.remove('rm-focus-blur', 'rm-focus-dim');
      paras.forEach((p) => p.classList.remove('rm-focused', 'rm-para'));
    };
  }, [focusBlurEnabled, focusHighlightEnabled, containerSelector]);

  return null;
}
