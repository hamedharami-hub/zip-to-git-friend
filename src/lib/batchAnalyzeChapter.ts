/**
 * Batch-analyze every paragraph of a chapter through the `analyze-paragraph`
 * edge function. Reuses the per-paragraph cache so re-runs only hit the AI
 * for paragraphs that haven't been analyzed yet.
 *
 * Designed for the reader's "Analyze chapter" sheet:
 *   - bounded concurrency (default 3 parallel) to avoid gateway rate-limits
 *   - progress events with completed / skipped (cached) / failed counters
 *   - cooperative cancellation via AbortSignal
 */
import type { BookChapter, BookParagraphAnalysis, BookAIModelRef } from '@/types';
import {
  bookAnalysisErrorMessage,
  getCachedParagraphAnalysis,
  hashParagraph,
} from './bookAnalysis';
import { analyzeParagraphRouted } from './bookAiRouter';
import { splitIntoShortChunks } from './paragraphSplit';

export interface BatchProgress {
  total: number;
  completed: number;
  /** Paragraphs that were already cached (no AI call). */
  skipped: number;
  /** Paragraphs whose AI call failed. */
  failed: number;
  /** Hash → analysis for everything we've successfully resolved so far. */
  results: Record<string, BookParagraphAnalysis>;
  /** Last error message, if any. */
  lastError?: string;
  /** Currently active in-flight count (for spinner UI). */
  inFlight: number;
  /** True when the run finished (success, cancelled, or all failed). */
  done: boolean;
  /** True when cancelled mid-flight. */
  cancelled: boolean;
}

export interface BatchOptions {
  /** Max parallel requests against the AI gateway. */
  concurrency?: number;
  /** Cancellation hook. */
  signal?: AbortSignal;
  /** Called every time the progress object mutates. */
  onProgress?: (snapshot: BatchProgress) => void;
  /** Provider+model ref used for each call (preferred). */
  modelRef?: BookAIModelRef;
  /** Legacy gateway model id (kept for backwards compat). */
  model?: string;
}

/** Heuristic: only analyse "real" paragraphs, not titles or one-word lines. */
const MIN_WORDS = 4;

interface Item {
  hash: string;
  text: string;
}

/** Extract analysable paragraphs from a chapter's HTML. */
export function extractAnalysableParagraphs(chapter: BookChapter): Item[] {
  const doc = new DOMParser().parseFromString(chapter.html, 'text/html');
  const root = doc.body ?? doc.documentElement;
  const items: Item[] = [];
  const seen = new Set<string>();

  // Walk top-level p / blockquote / li that look like prose, then split each
  // one with the SAME chunker the renderer uses, so every visible paragraph
  // maps 1:1 to its cached analysis.
  root.querySelectorAll('p, blockquote, li').forEach((el) => {
    const raw = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!raw) return;
    const chunks = splitIntoShortChunks(raw);
    for (const text of chunks) {
      const wordCount = text.split(/\s+/).length;
      if (wordCount < MIN_WORDS) continue;
      const hash = hashParagraph(text);
      if (seen.has(hash)) continue;
      seen.add(hash);
      items.push({ hash, text });
    }
  });

  return items;
}

/**
 * Run the batch analysis. Resolves when every item has been processed
 * (or the signal aborts). Never throws — failures are surfaced via the
 * progress snapshot.
 */
export async function batchAnalyzeChapter(
  bookId: string,
  chapter: BookChapter,
  options: BatchOptions = {},
): Promise<BatchProgress> {
  const { concurrency = 3, signal, onProgress, model, modelRef } = options;
  const effectiveRef: BookAIModelRef | undefined =
    modelRef ?? (model ? { provider: 'gateway', model } : undefined);
  const items = extractAnalysableParagraphs(chapter);

  const state: BatchProgress = {
    total: items.length,
    completed: 0,
    skipped: 0,
    failed: 0,
    results: {},
    inFlight: 0,
    done: false,
    cancelled: false,
  };

  const emit = () => onProgress?.({ ...state, results: { ...state.results } });

  if (items.length === 0) {
    state.done = true;
    emit();
    return state;
  }

  // Pre-pass: surface anything already cached so the user sees immediate progress.
  for (const item of items) {
    if (signal?.aborted) break;
    const cached = await getCachedParagraphAnalysis(bookId, chapter.index, item.text);
    if (cached) {
      state.results[item.hash] = cached;
      state.skipped += 1;
      state.completed += 1;
    }
  }
  emit();

  if (signal?.aborted) {
    state.cancelled = true;
    state.done = true;
    emit();
    return state;
  }

  // Build the work queue out of remaining items.
  const remaining = items.filter((it) => !state.results[it.hash]);
  let cursor = 0;

  const next = (): Item | null => {
    if (signal?.aborted) return null;
    return cursor < remaining.length ? remaining[cursor++] : null;
  };

  const worker = async () => {
    while (true) {
      const item = next();
      if (!item) return;
      state.inFlight += 1;
      emit();
      try {
        const result = await analyzeParagraphRouted(bookId, chapter.index, item.text, { modelRef: effectiveRef });
        state.results[item.hash] = result;
        state.completed += 1;
      } catch (e) {
        state.failed += 1;
        state.lastError = bookAnalysisErrorMessage(e);
        // Don't keep hammering the gateway after a payment / rate-limit error.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const code = (e as any)?.code;
        if (code === 'payment') {
          // Drain the queue: swallow remaining items so the run ends gracefully.
          cursor = remaining.length;
        }
      } finally {
        state.inFlight -= 1;
        emit();
      }
      if (signal?.aborted) return;
    }
  };

  const pool = Array.from({ length: Math.max(1, Math.min(concurrency, remaining.length || 1)) }, worker);
  await Promise.all(pool);

  state.cancelled = !!signal?.aborted;
  state.done = true;
  emit();
  return state;
}
