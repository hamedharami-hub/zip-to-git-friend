import type { LeitnerCard, LeitnerRating } from "@/types";
import { applyRating, ratingFromBoolean, BOX_BASE_DAYS } from "@/lib/srs";

export const BOX_INTERVAL_DAYS: Record<1 | 2 | 3 | 4 | 5, number> = BOX_BASE_DAYS;

const DAY_MS = 86_400_000;

export function nextReviewFor(box: 1 | 2 | 3 | 4 | 5, from = Date.now()): number {
  return from + BOX_INTERVAL_DAYS[box] * DAY_MS;
}

export function promote(box: 1 | 2 | 3 | 4 | 5): 1 | 2 | 3 | 4 | 5 {
  return Math.min(5, box + 1) as 1 | 2 | 3 | 4 | 5;
}

export function demote(): 1 {
  return 1;
}

/** Legacy helper kept for any old callers — delegates to FSRS-lite. */
export function applyReview(card: LeitnerCard, correct: boolean, now = Date.now()): LeitnerCard {
  return applyRating(card, ratingFromBoolean(correct), now);
}

/** Preferred entry point: explicit 4-level rating. */
export function applyAnswer(
  card: LeitnerCard,
  rating: LeitnerRating,
  now = Date.now(),
): LeitnerCard {
  return applyRating(card, rating, now);
}

/** Sort due cards: lapsed cards first (more urgent), then higher boxes, then oldest due. */
export function sortDue(cards: LeitnerCard[]): LeitnerCard[] {
  return [...cards].sort((a, b) => {
    const la = a.lapseCount ?? 0;
    const lb = b.lapseCount ?? 0;
    if (la !== lb) return lb - la;
    if (a.box !== b.box) return b.box - a.box;
    return a.nextReview - b.nextReview;
  });
}

export function normalizeFront(text: string): string {
  return text.trim().toLowerCase();
}
