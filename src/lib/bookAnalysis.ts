/**
 * Client-side helper for the `analyze-paragraph` edge function.
 *
 * Caches results per (bookId, chapterIndex, paragraphHash) inside the book DB
 * so repeated views of the same paragraph never re-hit the AI gateway.
 */
import { supabase } from '@/integrations/supabase/client';
import type { BookParagraphAnalysis, IdiomItem, VocabItem } from '@/types';
import {
  paragraphAnalysisKey,
} from '@/lib/bookDb';
import {
  getCachedParagraphAnalysisShared,
  saveParagraphAnalysisShared,
} from '@/lib/paragraphAnalysisCloud';

export class BookAnalysisError extends Error {
  code: 'rate_limit' | 'payment' | 'network' | 'invalid' | 'unknown';
  constructor(code: BookAnalysisError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'BookAnalysisError';
  }
}

interface AnalysisResponse {
  translation: string;
  vocabulary: VocabItem[];
  idioms: IdiomItem[];
  model: string;
  error?: string;
}

/**
 * Stable, fast hash of a string. Not crypto-grade — we only need
 * collision-resistance for paragraph keys inside a single chapter.
 * Algorithm: 32-bit FNV-1a, returned as base36.
 */
export function hashParagraph(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

/** Read-only cache lookup (local IDB + cloud); never triggers an AI call. */
export async function getCachedParagraphAnalysis(
  bookId: string,
  chapterIndex: number,
  paragraphText: string,
): Promise<BookParagraphAnalysis | undefined> {
  const hash = hashParagraph(paragraphText.trim());
  return getCachedParagraphAnalysisShared(bookId, chapterIndex, hash);
}

/**
 * Run AI analysis on a paragraph. Returns the cached entry when available;
 * otherwise calls the edge function and writes the result to IndexedDB.
 */
export async function analyzeParagraph(
  bookId: string,
  chapterIndex: number,
  paragraphText: string,
  options: { force?: boolean; model?: string } = {},
): Promise<BookParagraphAnalysis> {
  const text = paragraphText.trim();
  const hash = hashParagraph(text);

  if (!options.force) {
    const cached = await getCachedParagraphAnalysisShared(bookId, chapterIndex, hash);
    if (cached) return cached;
  }

  const { data, error } = await supabase.functions.invoke<AnalysisResponse>(
    'analyze-paragraph',
    { body: { paragraph: text, model: options.model } },
  );

  if (error) {
    // Supabase's FunctionsHttpError exposes status via error.context.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (error as any).context as Response | undefined;
    const status = ctx?.status;
    let message = error.message || 'Analysis failed.';
    try {
      if (ctx) {
        const cloned = ctx.clone();
        const body = await cloned.json().catch(() => null);
        if (body?.error) message = String(body.error);
      }
    } catch {
      /* swallow */
    }
    if (status === 429) throw new BookAnalysisError('rate_limit', message);
    if (status === 402) throw new BookAnalysisError('payment', message);
    throw new BookAnalysisError('network', message);
  }

  if (!data || data.error) {
    throw new BookAnalysisError('invalid', data?.error ?? 'Empty response from AI.');
  }

  const record: BookParagraphAnalysis = {
    id: paragraphAnalysisKey(bookId, chapterIndex, hash),
    bookId,
    chapterIndex,
    paragraphHash: hash,
    translation: (data.translation ?? '').trim(),
    vocabulary: data.vocabulary ?? [],
    idioms: data.idioms ?? [],
    analyzedAt: Date.now(),
    model: data.model ?? 'unknown',
  };

  await saveParagraphAnalysis(record);
  return record;
}

export function bookAnalysisErrorMessage(e: unknown, fallback = 'Analysis failed.'): string {
  if (e instanceof BookAnalysisError) {
    switch (e.code) {
      case 'rate_limit':
        return 'AI rate limit reached. Try again in a few seconds.';
      case 'payment':
        return 'AI credits exhausted. Add funds in workspace settings.';
      case 'network':
        return e.message || 'Network error contacting AI.';
      case 'invalid':
        return e.message || 'AI returned an unexpected response.';
      default:
        return e.message || fallback;
    }
  }
  return fallback;
}
