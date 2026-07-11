/**
 * Helpers for the new study modes: Multiple Choice, Type-the-answer, Cloze deletion.
 */
import type { LeitnerCard } from "@/types";

/** Pick `n` random distractor backs from `pool` excluding the correct one. */
export function pickDistractors(pool: LeitnerCard[], correct: LeitnerCard, n = 3): string[] {
  const seen = new Set<string>([correct.back.trim().toLowerCase()]);
  const candidates = pool
    .filter((c) => c.id !== correct.id && c.back && c.back.trim())
    .filter((c) => {
      const k = c.back.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  // Fisher–Yates
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, n).map((c) => c.back);
}

/** Shuffle in place and return new array. */
export function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Loose comparison for typed answers: lower-case, collapse spaces, strip punctuation. */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0600-\u06ff\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function answersMatch(a: string, b: string): boolean {
  const na = normalizeAnswer(a);
  const nb = normalizeAnswer(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // tolerate one char typo for short answers
  if (Math.abs(na.length - nb.length) <= 2 && levenshtein(na, nb) <= 1) return true;
  return false;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const dp = Array(b.length + 1)
    .fill(0)
    .map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Build a cloze sentence: replaces the front word in the example with "____". */
export function buildCloze(card: LeitnerCard): { masked: string; answer: string } | null {
  const sentence = card.exampleSentence?.trim();
  const word = card.front.trim();
  if (!sentence || !word) return null;
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  if (!re.test(sentence)) return null;
  return { masked: sentence.replace(re, "____"), answer: word };
}
