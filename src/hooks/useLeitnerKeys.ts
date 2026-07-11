/**
 * Hook returning a Set of normalized "fronts" of every Leitner card the
 * user has — used by InteractiveSubtitle (and other word renderers) to
 * paint a subtle highlight on words/phrases that already live in the
 * spaced-repetition deck.
 *
 * Subscribes to the live Leitner store so it stays in sync as cards are
 * added or removed from any screen.
 */
import { useMemo } from "react";
import { useLeitnerStore } from "@/store/leitnerStore";
import { normalizeFront } from "@/lib/leitner";

export function useLeitnerKeys(): Set<string> {
  const cards = useLeitnerStore((s) => s.cards);
  return useMemo(() => {
    const set = new Set<string>();
    for (const c of cards) set.add(normalizeFront(c.front));
    return set;
  }, [cards]);
}

/** Convenience: is THIS string already in the user's Leitner deck? */
export function useIsInLeitner(text: string): boolean {
  const keys = useLeitnerKeys();
  return keys.has(normalizeFront(text));
}
