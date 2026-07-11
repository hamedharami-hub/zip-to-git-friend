/**
 * Shadowing utilities: text normalization, token-level diffing, similarity
 * scoring, and IndexedDB persistence for recorded takes.
 *
 * The diff/similarity is purely lexical — we lowercase, strip punctuation, and
 * compare token sequences using Levenshtein edit distance. This is intentional:
 * the goal is to give the learner concrete, word-level feedback on how close
 * their attempt was to the reference cue, not to grade pronunciation.
 */

import type { ShadowingTake, ShadowingTakeRecord } from "@/types";
import { getDb } from "@/lib/db";

/** Lowercase + strip diacritics + collapse non-alphanumerics to spaces. */
export function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/['’]/g, "") // collapse contractions: don't ↔ dont
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(s: string): string[] {
  const n = normalizeForCompare(s);
  return n ? n.split(" ") : [];
}

/** Classic Levenshtein edit distance between two token arrays. */
function tokenEditDistance(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // 2-row rolling DP for memory efficiency.
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** 0..100 similarity score between reference and hypothesis text. */
export function similarityScore(reference: string, hypothesis: string): number {
  const ref = tokenize(reference);
  const hyp = tokenize(hypothesis);
  if (ref.length === 0 && hyp.length === 0) return 100;
  if (ref.length === 0) return 0;
  const dist = tokenEditDistance(ref, hyp);
  const score = 1 - dist / Math.max(ref.length, hyp.length);
  return Math.max(0, Math.min(100, Math.round(score * 100)));
}

export type DiffOpKind = "match" | "sub" | "ins" | "del";
export interface DiffOp {
  kind: DiffOpKind;
  /** Token from reference (if any). */
  ref?: string;
  /** Token from hypothesis (if any). */
  hyp?: string;
}

/**
 * Word-level diff between reference and hypothesis. Returns an op stream that
 * can be rendered side-by-side: matches in green, substitutions in amber,
 * insertions (extra spoken words) in red, deletions (missed words) struck-through.
 */
export function diffTokens(reference: string, hypothesis: string): DiffOp[] {
  const a = tokenize(reference);
  const b = tokenize(hypothesis);
  const m = a.length;
  const n = b.length;
  // Build full DP table to enable backtrace.
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const ops: DiffOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ kind: "match", ref: a[i - 1], hyp: b[j - 1] });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      ops.push({ kind: "sub", ref: a[i - 1], hyp: b[j - 1] });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ kind: "del", ref: a[i - 1] });
      i--;
    } else {
      ops.push({ kind: "ins", hyp: b[j - 1] });
      j--;
    }
  }
  return ops.reverse();
}

// ─────────────────────────────────────── Persistence (IndexedDB) ──

export async function listTakes(videoId: string, cueId: string): Promise<ShadowingTake[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("shadowingTakes", "videoId+cueId", [videoId, cueId]);
  return rows
    .map((r) => rowToTake(r as ShadowingTakeRecord))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveTake(input: {
  id: string;
  videoId: string;
  cueId: string;
  blob: Blob;
  durationMs: number;
  refText: string;
  hypothesis?: string;
  score?: number;
}): Promise<void> {
  const db = await getDb();
  const rec: ShadowingTakeRecord = {
    id: input.id,
    videoId: input.videoId,
    cueId: input.cueId,
    blob: input.blob,
    mimeType: input.blob.type || "audio/webm",
    durationMs: input.durationMs,
    refText: input.refText,
    hypothesis: input.hypothesis,
    score: input.score,
    createdAt: Date.now(),
  };
  await db.put("shadowingTakes", rec);
}

export async function updateTake(
  id: string,
  patch: Partial<Pick<ShadowingTakeRecord, "hypothesis" | "score">>,
): Promise<ShadowingTake | null> {
  const db = await getDb();
  const existing = await db.get("shadowingTakes", id);
  if (!existing) return null;
  const next: ShadowingTakeRecord = { ...(existing as ShadowingTakeRecord), ...patch };
  await db.put("shadowingTakes", next);
  return rowToTake(next);
}

export async function deleteTake(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("shadowingTakes", id);
}

function rowToTake(rec: ShadowingTakeRecord): ShadowingTake {
  return {
    id: rec.id,
    videoId: rec.videoId,
    cueId: rec.cueId,
    blob: rec.blob,
    mimeType: rec.mimeType,
    durationMs: rec.durationMs,
    refText: rec.refText,
    hypothesis: rec.hypothesis,
    score: rec.score,
    createdAt: rec.createdAt,
  };
}

/** Format milliseconds → "0:05.3" style label. */
export function formatTakeDuration(ms: number): string {
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
