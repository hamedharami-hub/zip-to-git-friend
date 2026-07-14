/**
 * Path / step-by-step progress for Sentence Lab.
 *
 * Each subcategory exposes a "ladder" of CEFR levels (A2 → B1 → B2 → C1).
 * Each rung shows: total sentences at that level, how many the user has
 * already "mastered" (FSRS state = review/relearning with stability ≥ 7).
 *
 * Pure read-only helpers — no mutations.
 */

import { supabase } from "@/integrations/supabase/client";

export const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_ORDER)[number];

export interface PathStep {
  level: CefrLevel;
  total: number;
  seen: number; // user has reviewed at least once
  mastered: number; // FSRS stability ≥ 7 days
  /** 0..1 — share of mastered / total. */
  progress: number;
  /** Step is the current focus: previous step is mostly done but this one isn't. */
  isActive: boolean;
  /** Step has no sentences. */
  isEmpty: boolean;
}

const MASTERY_STABILITY = 7;
const STEP_COMPLETION = 0.7; // 70% mastered = move on

/** Build the CEFR ladder for a category + subcategory. */
export async function fetchPathSteps(
  categorySlug: string,
  subcategorySlug: string,
): Promise<PathStep[]> {
  // 1) Pull every published sentence in this sub, with id + cefr_level
  let q = supabase
    .from("sentence_lab")
    .select("id, cefr_level")
    .eq("status", "published")
    .eq("category", categorySlug);
  if (subcategorySlug && subcategorySlug !== "all") {
    q = q.eq("subcategory", subcategorySlug);
  }
  const { data: sentences, error } = await q;
  if (error) throw error;

  const byLevel = new Map<string, string[]>();
  for (const s of sentences ?? []) {
    const lvl = (s.cefr_level ?? "A2") as string;
    const arr = byLevel.get(lvl) ?? [];
    arr.push(s.id as string);
    byLevel.set(lvl, arr);
  }

  // 2) Pull this user's progress for those sentence ids in one go
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
  const allIds = (sentences ?? []).map((s: any) => s.id as string);
  const progressById = new Map<string, { state: string; stability: number }>();
  if (userId && allIds.length > 0) {
    // Supabase .in() handles up to a few thousand ids fine for our scale.
    const { data: prog } = await supabase
      .from("sentence_progress")
      .select("sentence_id, state, stability")
      .eq("user_id", userId)
      .in("sentence_id", allIds);
    for (const p of prog ?? []) {
      progressById.set(p.sentence_id as string, {
        state: p.state as string,
        stability: Number(p.stability) || 0,
      });
    }
  }

  // 3) Build steps for every level we have sentences for, in CEFR order.
  const presentLevels = CEFR_ORDER.filter((l) => byLevel.has(l));
  const steps: PathStep[] = presentLevels.map((level) => {
    const ids = byLevel.get(level) ?? [];
    let seen = 0;
    let mastered = 0;
    for (const id of ids) {
      const p = progressById.get(id);
      if (!p) continue;
      seen += 1;
      if (p.stability >= MASTERY_STABILITY) mastered += 1;
    }
    const total = ids.length;
    return {
      level,
      total,
      seen,
      mastered,
      progress: total ? mastered / total : 0,
      isActive: false,
      isEmpty: total === 0,
    };
  });

  // 4) Mark active step: first step not yet completed.
  const activeIdx = steps.findIndex((s) => s.progress < STEP_COMPLETION);
  if (activeIdx >= 0) steps[activeIdx].isActive = true;

  return steps;
}

/** Aggregate progress for a whole subcategory (used for header). */
export function summarizeSteps(steps: PathStep[]): {
  total: number;
  mastered: number;
  progress: number;
} {
  const total = steps.reduce((a, s) => a + s.total, 0);
  const mastered = steps.reduce((a, s) => a + s.mastered, 0);
  return { total, mastered, progress: total ? mastered / total : 0 };
}
