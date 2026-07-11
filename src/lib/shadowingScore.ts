/**
 * Lightweight shadowing/repetition scorer.
 *
 * Uses normalized word-level similarity (Levenshtein distance over tokens)
 * to score how closely the user's spoken transcript matches the target
 * English sentence. Returns 0–100.
 */

function normalize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function levenshtein<T>(a: T[], b: T[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export interface ShadowingResult {
  score: number; // 0..100
  matched: number;
  total: number;
  missingWords: string[];
  extraWords: string[];
}

export function scoreShadowing(target: string, spoken: string): ShadowingResult {
  const t = normalize(target);
  const s = normalize(spoken);
  if (t.length === 0) return { score: 0, matched: 0, total: 0, missingWords: [], extraWords: s };

  const dist = levenshtein(t, s);
  const maxLen = Math.max(t.length, s.length);
  const score = Math.max(0, Math.round(((maxLen - dist) / maxLen) * 100));

  const tSet = new Set(t);
  const sSet = new Set(s);
  const missingWords = t.filter((w) => !sSet.has(w));
  const extraWords = s.filter((w) => !tSet.has(w));
  const matched = t.filter((w) => sSet.has(w)).length;

  return { score, matched, total: t.length, missingWords, extraWords };
}
