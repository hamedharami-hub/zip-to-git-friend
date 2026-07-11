/**
 * Daily review limits inspired by Anki / Duolingo to prevent burnout.
 * A "new" card has never been reviewed (no lastReviewed). A "review" card has.
 */
import type { LeitnerCard } from "@/types";

export const DEFAULT_DAILY_NEW = 20;
export const DEFAULT_DAILY_REVIEW = 200;

function startOfTodayMs(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface ReviewedTodayCounts {
  newDone: number;
  reviewDone: number;
}

/** Count cards already reviewed today, split by new vs review. */
export function countReviewedToday(cards: LeitnerCard[], now = Date.now()): ReviewedTodayCounts {
  const start = startOfTodayMs(now);
  let newDone = 0;
  let reviewDone = 0;
  for (const c of cards) {
    const log = c.reviewLog ?? [];
    if (log.length === 0) continue;
    // first review today => count "new"; subsequent => "review"
    let firstToday = -1;
    for (let i = 0; i < log.length; i++) {
      if (log[i].at >= start) {
        firstToday = i;
        break;
      }
    }
    if (firstToday < 0) continue;
    // If the card had no logs before today's first review, it's a "new" card
    if (firstToday === 0) newDone++;
    else reviewDone++;
    // Additional reviews of same card today => count as review
    const restToday = log.slice(firstToday + 1).filter((l) => l.at >= start).length;
    reviewDone += restToday;
  }
  return { newDone, reviewDone };
}

/**
 * Apply daily limits to a due-queue. New cards (no reviewLog) are capped by
 * remaining "new" budget; previously-reviewed cards by review budget.
 */
export function applyDailyLimits(
  due: LeitnerCard[],
  allCards: LeitnerCard[],
  opts: { maxNew?: number; maxReview?: number; now?: number } = {},
): LeitnerCard[] {
  const maxNew = opts.maxNew ?? DEFAULT_DAILY_NEW;
  const maxReview = opts.maxReview ?? DEFAULT_DAILY_REVIEW;
  const { newDone, reviewDone } = countReviewedToday(allCards, opts.now);
  const newBudget = Math.max(0, maxNew - newDone);
  const reviewBudget = Math.max(0, maxReview - reviewDone);
  let n = newBudget,
    r = reviewBudget;
  const out: LeitnerCard[] = [];
  for (const c of due) {
    const isNew = !(c.reviewLog && c.reviewLog.length > 0);
    if (isNew) {
      if (n > 0) {
        out.push(c);
        n--;
      }
    } else {
      if (r > 0) {
        out.push(c);
        r--;
      }
    }
  }
  return out;
}
