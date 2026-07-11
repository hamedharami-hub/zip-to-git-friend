import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";
import { applyReview, initFsrsState, type FsrsGrade, type FsrsState } from "@/lib/fsrsAlgorithm";
import { useSentenceFlagStore } from "@/store/sentenceFlagStore";

/** A practice sentence from the public catalog. */
export interface SentenceLabItem {
  id: string;
  status: "draft" | "reviewed" | "published";
  category: string | null;
  subcategory: string | null;
  cefrLevel: string | null;
  english: string;
  persian: string | null;
  englishAussie: string | null;
  examTaskType: string | null;
  expectedDurationSeconds: number | null;
  expectedIntent: string | null;
  aiCounterPrompt: string | null;
  grammarFocus: string[];
  vocabularyTags: string[];
  commonMistakes: string[];
  audioUrl: string | null;
}

/** Per-user SRS progress for a sentence. */
export interface SentenceProgress {
  id: string;
  userId: string;
  sentenceId: string;
  state: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  reps: number;
  lapses: number;
  nextReviewDate: string;
  lastReviewedAt: string | null;
  pronunciationScore: number | null;
  fluencyScore: number | null;
  grammarScore: number | null;
}

/** A queued item: sentence + optional existing progress. */
export interface SentenceQueueItem {
  sentence: SentenceLabItem;
  progress: SentenceProgress | null;
  /** Whether this is a "new" introduction or a "due" review. */
  kind: "new" | "due";
}

export interface QueueFilter {
  category?: string | null;
  subcategory?: string | null;
  cefrLevel?: string | null;
  /** When set, ignores category/subcategory filters and pulls
   *  `count` sentences from each recipe step, interleaving them. */
  pathRecipe?: Array<{ category: string; subcategory: string; count: number }> | null;
}

interface SentenceState {
  queue: SentenceQueueItem[];
  currentIndex: number;
  loading: boolean;
  error: string | null;
  filter: QueueFilter;
  fetchDailyQueue: (filter?: QueueFilter) => Promise<void>;
  next: () => void;
  reset: () => void;
  /** Grade the current sentence with FSRS and persist. Does NOT advance. */
  gradeCurrent: (grade: FsrsGrade) => Promise<void>;
}

const QUEUE_SIZE = 15;
const DUE_RATIO = 0.7;

function mapSentence(row: any): SentenceLabItem {
  return {
    id: row.id,
    status: row.status,
    category: row.category,
    subcategory: row.subcategory,
    cefrLevel: row.cefr_level,
    english: row.english,
    persian: row.persian,
    englishAussie: row.english_aussie,
    examTaskType: row.exam_task_type,
    expectedDurationSeconds: row.expected_duration_seconds,
    expectedIntent: row.expected_intent,
    aiCounterPrompt: row.ai_counter_prompt,
    grammarFocus: row.grammar_focus ?? [],
    vocabularyTags: row.vocabulary_tags ?? [],
    commonMistakes: row.common_mistakes ?? [],
    audioUrl: row.audio_url,
  };
}

function mapProgress(row: any): SentenceProgress {
  return {
    id: row.id,
    userId: row.user_id,
    sentenceId: row.sentence_id,
    state: row.state,
    stability: Number(row.stability),
    difficulty: Number(row.difficulty),
    elapsedDays: row.elapsed_days,
    reps: row.reps,
    lapses: row.lapses,
    nextReviewDate: row.next_review_date,
    lastReviewedAt: row.last_reviewed_at,
    pronunciationScore: row.pronunciation_score,
    fluencyScore: row.fluency_score,
    grammarScore: row.grammar_score,
  };
}

export const useSentenceStore = create<SentenceState>((set, get) => ({
  queue: [],
  currentIndex: 0,
  loading: false,
  error: null,
  filter: {},

  async fetchDailyQueue(filter) {
    const activeFilter = filter ?? get().filter ?? {};
    set({ loading: true, error: null, filter: activeFilter });
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;

      // ─── PATH MODE: pull from each recipe step and interleave ───
      if (activeFilter.pathRecipe && activeFilter.pathRecipe.length > 0) {
        const buckets: SentenceQueueItem[][] = [];
        const seenPath = new Set<string>();
        for (const step of activeFilter.pathRecipe) {
          const { data: rows } = await supabase
            .from("sentence_lab")
            .select("*")
            .eq("status", "published")
            .eq("category", step.category)
            .eq("subcategory", step.subcategory)
            .limit(step.count * 2);
          const picks = (rows ?? []).filter((r: any) => !seenPath.has(r.id)).slice(0, step.count);
          for (const r of picks) seenPath.add(r.id);
          buckets.push(
            picks.map((r: any) => ({
              sentence: mapSentence(r),
              progress: null,
              kind: "new" as const,
            })),
          );
        }
        // Round-robin interleave
        const woven: SentenceQueueItem[] = [];
        let added = true;
        while (added) {
          added = false;
          for (const b of buckets) {
            const next = b.shift();
            if (next) {
              woven.push(next);
              added = true;
            }
          }
        }
        // Attach existing progress where present
        if (userId && woven.length > 0) {
          const ids = woven.map((q) => q.sentence.id);
          const { data: prog } = await supabase
            .from("sentence_progress")
            .select("*")
            .eq("user_id", userId)
            .in("sentence_id", ids);
          const progMap = new Map<string, any>();
          for (const p of prog ?? []) progMap.set(p.sentence_id, p);
          for (const q of woven) {
            const p = progMap.get(q.sentence.id);
            if (p) {
              q.progress = mapProgress(p);
              if (new Date(p.next_review_date) <= new Date()) q.kind = "due";
            }
          }
        }
        set({ queue: woven, currentIndex: 0, loading: false });
        return;
      }

      const dueTarget = Math.round(QUEUE_SIZE * DUE_RATIO);
      const newTarget = QUEUE_SIZE - dueTarget;

      const queue: SentenceQueueItem[] = [];
      const seenIds = new Set<string>();

      // 1) Due reviews (filtered by category if set)
      if (userId) {
        let dueQuery = supabase
          .from("sentence_progress")
          .select("*, sentence_lab!inner(*)")
          .eq("user_id", userId)
          .lte("next_review_date", new Date().toISOString())
          .order("next_review_date", { ascending: true })
          .limit(dueTarget);
        if (activeFilter.category) {
          dueQuery = dueQuery.eq("sentence_lab.category", activeFilter.category);
        }
        if (activeFilter.subcategory) {
          dueQuery = dueQuery.eq("sentence_lab.subcategory", activeFilter.subcategory);
        }
        if (activeFilter.cefrLevel) {
          dueQuery = dueQuery.eq("sentence_lab.cefr_level", activeFilter.cefrLevel);
        }
        const { data: dueRows, error: dueErr } = await dueQuery;
        if (dueErr) throw dueErr;
        for (const row of dueRows ?? []) {
          if (!row.sentence_lab) continue;
          const sentence = mapSentence(row.sentence_lab);
          queue.push({ sentence, progress: mapProgress(row), kind: "due" });
          seenIds.add(sentence.id);
        }
      }

      const remaining = QUEUE_SIZE - queue.length;
      const newCount = Math.max(newTarget, remaining);
      let newQuery = supabase
        .from("sentence_lab")
        .select("*")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(newCount * 3);
      if (activeFilter.category) newQuery = newQuery.eq("category", activeFilter.category);
      if (activeFilter.subcategory) newQuery = newQuery.eq("subcategory", activeFilter.subcategory);
      if (activeFilter.cefrLevel) newQuery = newQuery.eq("cefr_level", activeFilter.cefrLevel);
      const { data: newRows, error: newErr } = await newQuery;
      if (newErr) throw newErr;

      let progressedIds = new Set<string>();
      if (userId && newRows && newRows.length > 0) {
        const ids = newRows.map((r: any) => r.id);
        const { data: prog } = await supabase
          .from("sentence_progress")
          .select("sentence_id")
          .eq("user_id", userId)
          .in("sentence_id", ids);
        progressedIds = new Set((prog ?? []).map((p: any) => p.sentence_id));
      }

      for (const row of newRows ?? []) {
        if (queue.length >= QUEUE_SIZE) break;
        if (seenIds.has(row.id) || progressedIds.has(row.id)) continue;
        queue.push({ sentence: mapSentence(row), progress: null, kind: "new" });
        seenIds.add(row.id);
      }

      // ── Pimsleur-style interleaving: pull RED-flagged sentences from
      //    *other* lessons and weave them between the new ones.
      if (userId) {
        try {
          await useSentenceFlagStore.getState().load();
          const flagMap = useSentenceFlagStore.getState().flags;
          const flaggedIds = Object.values(flagMap)
            .filter((f) => f.color === "red" || f.color === "orange")
            .map((f) => f.sentenceId)
            .filter((id) => !seenIds.has(id));
          if (flaggedIds.length > 0) {
            const sample = flaggedIds.slice(0, Math.min(5, Math.ceil(queue.length / 4)));
            const { data: flagRows } = await supabase
              .from("sentence_lab")
              .select("*")
              .in("id", sample);
            const flaggedItems: SentenceQueueItem[] = (flagRows ?? []).map((row: any) => ({
              sentence: mapSentence(row),
              progress: null,
              kind: "due" as const,
            }));
            // Interleave: insert one flagged item every ~3 new items
            const woven: SentenceQueueItem[] = [];
            let fi = 0;
            for (let i = 0; i < queue.length; i++) {
              woven.push(queue[i]);
              if (fi < flaggedItems.length && (i + 1) % 3 === 0) {
                woven.push(flaggedItems[fi++]);
              }
            }
            while (fi < flaggedItems.length) woven.push(flaggedItems[fi++]);
            queue.length = 0;
            queue.push(...woven);
          }
        } catch (e) {
          console.warn("[sentenceStore] flag interleave failed", e);
        }
      }

      set({ queue, currentIndex: 0, loading: false });
    } catch (e: any) {
      console.error("[sentenceStore] fetchDailyQueue failed", e);
      set({ loading: false, error: e?.message ?? "Failed to load queue" });
    }
  },

  next() {
    const { currentIndex, queue } = get();
    if (currentIndex < queue.length - 1) set({ currentIndex: currentIndex + 1 });
  },

  reset() {
    set({ queue: [], currentIndex: 0, error: null, filter: {} });
  },

  async gradeCurrent(grade) {
    const { queue, currentIndex } = get();
    const item = queue[currentIndex];
    if (!item) return;
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;

      const prevState: FsrsState = item.progress
        ? {
            stability: item.progress.stability,
            difficulty: item.progress.difficulty,
            elapsedDays: item.progress.elapsedDays,
            reps: item.progress.reps,
            lapses: item.progress.lapses,
            nextReviewDate: item.progress.nextReviewDate,
            state: (item.progress.state as FsrsState["state"]) ?? "new",
            lastReviewedAt: item.progress.lastReviewedAt,
          }
        : initFsrsState();

      const nextState = applyReview({ prev: prevState, grade });

      const payload = {
        user_id: userId,
        sentence_id: item.sentence.id,
        state: nextState.state,
        stability: nextState.stability,
        difficulty: nextState.difficulty,
        elapsed_days: nextState.elapsedDays,
        reps: nextState.reps,
        lapses: nextState.lapses,
        next_review_date: nextState.nextReviewDate,
        last_reviewed_at: nextState.lastReviewedAt,
      };

      let savedRow: any = null;
      if (item.progress?.id) {
        const { data, error } = await supabase
          .from("sentence_progress")
          .update(payload)
          .eq("id", item.progress.id)
          .select()
          .single();
        if (error) throw error;
        savedRow = data;
      } else {
        const { data, error } = await supabase
          .from("sentence_progress")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        savedRow = data;
      }

      // Patch local queue with the new progress
      const newQueue = queue.slice();
      newQueue[currentIndex] = {
        ...item,
        progress: savedRow ? mapProgress(savedRow) : item.progress,
      };
      set({ queue: newQueue });

      // Fire gamification (XP, streak, hearts, combo, quests). Lazy import
      // avoids circular deps with stores that import this one.
      try {
        const { useGamificationStore } = await import("@/store/gamificationStore");
        const gradeKey = (["again", "hard", "good", "easy"] as const)[grade - 1];
        void useGamificationStore.getState().grade(gradeKey);
      } catch (e) {
        console.warn("[sentenceStore] gamification hook failed", e);
      }
    } catch (e) {
      console.error("[sentenceStore] gradeCurrent failed", e);
    }
  },
}));
