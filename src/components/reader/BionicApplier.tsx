/**
 * Applies / removes Bionic Reading formatting on the reading container.
 * Uses MutationObserver to re-apply after external content changes, but
 * disconnects while we ourselves are mutating the DOM to avoid loops.
 */
import { useEffect } from 'react';
import { useReadingMode } from '@/hooks/useReadingMode';
import { applyBionic, removeBionic } from '@/lib/bionic';

interface Props {
  containerSelector: string;
}

export function BionicApplier({ containerSelector }: Props) {
  const { bionicEnabled, bionicIntensity } = useReadingMode();

  useEffect(() => {
    // Poll briefly for the container (content may mount async).
    let cancelled = false;
    let mo: MutationObserver | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let root: HTMLElement | null = null;

    const doApply = () => {
      if (!root) return;
      mo?.disconnect();
      applyBionic(root, bionicIntensity);
      if (mo) mo.observe(root, { childList: true, subtree: true, characterData: true });
    };
    const doRemove = () => {
      if (!root) return;
      mo?.disconnect();
      removeBionic(root);
      if (mo) mo.observe(root, { childList: true, subtree: true, characterData: true });
    };

    const attach = (el: HTMLElement) => {
      root = el;
      if (!bionicEnabled) {
        doRemove();
        return;
      }
      doApply();
      mo = new MutationObserver(() => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(doApply, 120);
      });
      mo.observe(root, { childList: true, subtree: true, characterData: true });
    };

    const tryFind = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(containerSelector);
      if (el) attach(el);
      else setTimeout(tryFind, 150);
    };
    tryFind();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      mo?.disconnect();
      if (root) removeBionic(root);
    };
  }, [bionicEnabled, bionicIntensity, containerSelector]);

  return null;
}
