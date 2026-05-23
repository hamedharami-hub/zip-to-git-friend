/**
 * FSRS-lite scheduler — 4-button Leitner with per-card ease.
 *
 * Combines the simplicity of Leitner boxes (1–5) with FSRS-style ratings
 * (Again/Hard/Good/Easy) and an adaptive ease factor. Pure functions, fully
 * client-side. No external deps.
 */
import type { LeitnerCard, LeitnerRating, LeitnerReviewLog } from '@/types';

const DAY = 86_400_000;

/** Default base interval per box (in days), used when no `lastIntervalMs` exists. */
export const BOX_BASE_DAYS: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

const MIN_EASE = 0.5;
const MAX_EASE = 2.5;
const DEFAULT_EASE = 2.0;
const MAX_LOG = 50;

export function clamp<T extends number>(v: T, lo: T, hi: T): T {
  return Math.max(lo, Math.min(hi, v)) as T;
}

export function clampBox(b: number): 1 | 2 | 3 | 4 | 5 {
  return clamp(Math.round(b), 1, 5) as 1 | 2 | 3 | 4 | 5;
}

export function nextIntervalMsForBox(box: 1 | 2 | 3 | 4 | 5): number {
  return BOX_BASE_DAYS[box] * DAY;
}

/**
 * Compute the next box, ease, and interval for a given rating.
 */
export function applyRating(
  card: LeitnerCard,
  rating: LeitnerRating,
  now = Date.now(),
): LeitnerCard {
  const ease = clamp(card.easeFactor ?? DEFAULT_EASE, MIN_EASE, MAX_EASE);
  const baseInterval = card.lastIntervalMs ?? nextIntervalMsForBox(card.box);

  let nextBox: 1 | 2 | 3 | 4 | 5 = card.box;
  let nextEase = ease;
  let nextInterval = baseInterval;
  let lapses = card.lapseCount ?? 0;

  switch (rating) {
    case 'again':
      nextBox = 1;
      nextEase = clamp(ease - 0.2, MIN_EASE, MAX_EASE);
      nextInterval = DAY; // back to 1 day
      lapses += 1;
      break;
    case 'hard':
      // stay in same box, halve interval (min 1 day)
      nextEase = clamp(ease - 0.05, MIN_EASE, MAX_EASE);
      nextInterval = Math.max(DAY, Math.round(baseInterval * 0.6));
      break;
    case 'good':
      nextBox = clampBox(card.box + 1);
      // grow interval modestly
      nextInterval = Math.max(
        nextIntervalMsForBox(nextBox),
        Math.round(baseInterval * Math.max(1.2, ease)),
      );
      break;
    case 'easy':
      nextBox = clampBox(card.box + 2);
      nextEase = clamp(ease + 0.1, MIN_EASE, MAX_EASE);
      nextInterval = Math.max(
        nextIntervalMsForBox(nextBox),
        Math.round(baseInterval * Math.max(1.6, ease + 0.3)),
      );
      break;
  }

  const log: LeitnerReviewLog = {
    at: now,
    rating,
    box: nextBox,
    intervalMs: nextInterval,
  };
  const nextLog = [...(card.reviewLog ?? []), log].slice(-MAX_LOG);

  return {
    ...card,
    box: nextBox,
    easeFactor: nextEase,
    lastIntervalMs: nextInterval,
    nextReview: now + nextInterval,
    lastReviewed: now,
    lapseCount: lapses,
    reviewLog: nextLog,
  };
}

/** Map a legacy boolean "correct" answer into a rating. */
export function ratingFromBoolean(correct: boolean): LeitnerRating {
  return correct ? 'good' : 'again';
}

export function intervalLabel(ms: number): string {
  const d = Math.round(ms / DAY);
  if (d < 1) return '<1d';
  if (d === 1) return '1d';
  if (d < 30) return `${d}d`;
  const m = Math.round(d / 30);
  return m <= 1 ? '1mo' : `${m}mo`;
}
