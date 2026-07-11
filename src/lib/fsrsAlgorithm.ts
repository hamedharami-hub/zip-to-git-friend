/**
 * Lightweight FSRS-style scheduler for Sentence Lab.
 *
 * Inspired by the FSRS-4.5 model but stripped down to the math
 * we need: stability, difficulty, and next-review interval from a
 * 4-button grade (1=Again, 2=Hard, 3=Good, 4=Easy).
 *
 * This module is INDEPENDENT of `src/lib/srs.ts` and the Leitner
 * algorithm — it is only used by the Sentence Lab feature.
 */

export type FsrsGrade = 1 | 2 | 3 | 4;

export interface FsrsState {
  /** Current memory stability in days (>= 0). 0 == new card. */
  stability: number;
  /** Card difficulty, clamped to [1, 10]. Higher = harder for the user. */
  difficulty: number;
  /** Days since the last successful review (resets to 0 on lapse). */
  elapsedDays: number;
  /** Total successful reviews so far. */
  reps: number;
  /** Total times the user pressed "Again". */
  lapses: number;
  /** ISO timestamp of the next scheduled review. */
  nextReviewDate: string;
  /** Lifecycle state. */
  state: "new" | "learning" | "review" | "relearning";
  /** ISO timestamp of the last review (or null for new cards). */
  lastReviewedAt: string | null;
}

export interface FsrsReviewInput {
  prev: FsrsState;
  grade: FsrsGrade;
  /** Override "now" for testing. Defaults to Date.now(). */
  now?: Date;
  /** Target retention probability in (0, 1). Default 0.9. */
  requestRetention?: number;
}

/**
 * Default FSRS-4.5 weights (w0..w16). Trimmed down to what we need.
 * These are not personalised — they ship as sensible defaults.
 */
const W = [
  0.4,
  0.6,
  2.4,
  5.8, // initial stability per grade (1..4)
  4.93,
  0.94,
  0.86,
  0.01, // difficulty params
  1.49,
  0.14,
  0.94, // stability-on-success params
  2.18,
  0.05,
  0.34,
  1.26, // stability-on-lapse params
  0.29,
  2.61, // hard/easy multipliers
] as const;

const FACTOR = 19 / 81;
const DECAY = -0.5;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Build a fresh state for a brand-new card. */
export function initFsrsState(now: Date = new Date()): FsrsState {
  return {
    stability: 0,
    difficulty: 5,
    elapsedDays: 0,
    reps: 0,
    lapses: 0,
    nextReviewDate: now.toISOString(),
    state: "new",
    lastReviewedAt: null,
  };
}

/** Initial stability after a card's first rating (FSRS w0..w3). */
function initStability(grade: FsrsGrade): number {
  return Math.max(0.1, W[grade - 1]);
}

/** Initial difficulty after a card's first rating (FSRS w4, w5). */
function initDifficulty(grade: FsrsGrade): number {
  const d = W[4] - (grade - 3) * W[5];
  return clamp(d, 1, 10);
}

/** Update difficulty after a non-first review (FSRS w6, w7). */
function nextDifficulty(prevD: number, grade: FsrsGrade): number {
  const delta = -W[6] * (grade - 3);
  const next = prevD + (delta * (10 - prevD)) / 9;
  // Mean-reversion towards the easy-grade default (FSRS w7).
  const reverted = W[7] * initDifficulty(4) + (1 - W[7]) * next;
  return clamp(reverted, 1, 10);
}

/** Stability after a successful review (Hard/Good/Easy). */
function nextStabilityOnRecall(
  prevS: number,
  prevD: number,
  retrievability: number,
  grade: FsrsGrade,
): number {
  const hardPenalty = grade === 2 ? W[15] : 1;
  const easyBonus = grade === 4 ? W[16] : 1;
  const factor =
    1 +
    Math.exp(W[8]) *
      (11 - prevD) *
      Math.pow(prevS, -W[9]) *
      (Math.exp((1 - retrievability) * W[10]) - 1) *
      hardPenalty *
      easyBonus;
  return Math.max(0.1, prevS * factor);
}

/** Stability after a lapse (grade=Again). */
function nextStabilityOnLapse(prevS: number, prevD: number, retrievability: number): number {
  const s =
    W[11] *
    Math.pow(prevD, -W[12]) *
    (Math.pow(prevS + 1, W[13]) - 1) *
    Math.exp((1 - retrievability) * W[14]);
  return Math.max(0.1, Math.min(s, prevS));
}

/** Compute current retrievability given elapsed days and stability. */
function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

/** Convert a stability into the next interval (days) for a target retention. */
function intervalFromStability(stability: number, requestRetention: number): number {
  if (stability <= 0) return 1;
  const i = (stability / FACTOR) * (Math.pow(requestRetention, 1 / DECAY) - 1);
  return clamp(Math.round(i), 1, 36500);
}

/** Run one review and return the new state. */
export function applyReview(input: FsrsReviewInput): FsrsState {
  const { prev, grade } = input;
  const now = input.now ?? new Date();
  const requestRetention = input.requestRetention ?? 0.9;

  // ── First review ────────────────────────────────────────────────
  if (prev.state === "new" || prev.stability === 0) {
    const stability = initStability(grade);
    const difficulty = initDifficulty(grade);
    if (grade === 1) {
      // Again on a new card: short relearning step (10 minutes).
      return {
        stability,
        difficulty,
        elapsedDays: 0,
        reps: 0,
        lapses: 1,
        nextReviewDate: addMinutes(now, 10).toISOString(),
        state: "relearning",
        lastReviewedAt: now.toISOString(),
      };
    }
    const intervalDays = intervalFromStability(stability, requestRetention);
    return {
      stability,
      difficulty,
      elapsedDays: 0,
      reps: 1,
      lapses: 0,
      nextReviewDate: addDays(now, intervalDays).toISOString(),
      state: "review",
      lastReviewedAt: now.toISOString(),
    };
  }

  // ── Subsequent review ───────────────────────────────────────────
  const elapsed = prev.lastReviewedAt
    ? Math.max(
        0,
        Math.round(
          (now.getTime() - new Date(prev.lastReviewedAt).getTime()) / (1000 * 60 * 60 * 24),
        ),
      )
    : prev.elapsedDays;
  const r = retrievability(elapsed, prev.stability);
  const difficulty = nextDifficulty(prev.difficulty, grade);

  if (grade === 1) {
    const stability = nextStabilityOnLapse(prev.stability, prev.difficulty, r);
    return {
      stability,
      difficulty,
      elapsedDays: 0,
      reps: prev.reps,
      lapses: prev.lapses + 1,
      // 10-minute relearning step before next full review.
      nextReviewDate: addMinutes(now, 10).toISOString(),
      state: "relearning",
      lastReviewedAt: now.toISOString(),
    };
  }

  const stability = nextStabilityOnRecall(prev.stability, prev.difficulty, r, grade);
  const intervalDays = intervalFromStability(stability, requestRetention);

  return {
    stability,
    difficulty,
    elapsedDays: elapsed,
    reps: prev.reps + 1,
    lapses: prev.lapses,
    nextReviewDate: addDays(now, intervalDays).toISOString(),
    state: "review",
    lastReviewedAt: now.toISOString(),
  };
}

/** Convenience: compute only the next interval (in days) for a planned grade. */
export function previewInterval(prev: FsrsState, grade: FsrsGrade): number {
  const next = applyReview({ prev, grade });
  if (next.state === "relearning") return 0; // < 1 day
  const ms = new Date(next.nextReviewDate).getTime() - new Date(next.lastReviewedAt!).getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}
function addMinutes(d: Date, m: number): Date {
  return new Date(d.getTime() + m * 60 * 1000);
}
