/**
 * Applies / removes Bionic Reading formatting on the reading container
 * when the toggle is on. Uses MutationObserver to re-apply after content
 * changes (e.g. after "Translate all" or rewrite view swap).
 */
import { useEffect } from 'react';
import { useReadingMode } from '@/hooks/useReadingMode';
import { applyBionic, removeBionic, isBionicActive } from '@/lib/bionic';

interface Props {
  containerSelector: string;
}

export function BionicApplier({ containerSelector }: Props) {
  const { bionicEnabled, bionicIntensity } = useReadingMode();

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(containerSelector);
    if (!root) return;

    if (!bionicEnabled) {
      removeBionic(root);
      return;
    }

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const reapply = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => applyBionic(root, bionicIntensity), 80);
    };
    reapply();

    const mo = new MutationObserver((muts) => {
      // Ignore mutations caused by our own bionic wrapping.
      const externallyChanged = muts.some((m) =>
        Array.from(m.addedNodes).some(
          (n) => !(n instanceof HTMLElement) || !n.classList.contains('rm-bionic-word'),
        ),
      );
      if (!externallyChanged) return;
      if (isBionicActive(root)) removeBionic(root);
      reapply();
    });
    mo.observe(root, { childList: true, subtree: true, characterData: true });

    return () => {
      mo.disconnect();
      if (debounce) clearTimeout(debounce);
      removeBionic(root);
    };
  }, [bionicEnabled, bionicIntensity, containerSelector]);

  return null;
}
