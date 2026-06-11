/**
 * Client-side helper for the `rewrite-chapter` edge function.
 *
 * Stores results per (bookId, chapterIndex, style) inside the book DB so
 * subsequent visits load instantly from cache.
 */
import { supabase } from '@/integrations/supabase/client';
import type { BookChapterRewrite, BookAnalysisModel, RewriteStyle } from '@/types';
import {
  getChapterRewrite,
  rewriteKey,
  saveChapterRewrite,
} from '@/lib/bookDb';

export class ChapterRewriteError extends Error {
  code: 'rate_limit' | 'payment' | 'network' | 'invalid' | 'unknown';
  constructor(code: ChapterRewriteError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'ChapterRewriteError';
  }
}

interface RewriteResponse {
  html: string;
  text: string;
  wordCount: number;
  model: string;
  error?: string;
}

export interface RewriteStyleMeta {
  id: RewriteStyle;
  label: string;
  description: string;
}

export const REWRITE_STYLES: RewriteStyleMeta[] = [
  {
    id: 'short_summary',
    label: 'Short summary',
    description: '120–180 words capturing the main thesis.',
  },
  {
    id: 'detailed_summary',
    label: 'Detailed summary',
    description: '350–600 words preserving every key argument.',
  },
  {
    id: 'key_points',
    label: 'Key points',
    description: '6–12 bullet points in original order.',
  },
  {
    id: 'simplified',
    label: 'Simplified (B1)',
    description: 'Same ideas in easy English, ≈ 60% the length.',
  },
  {
    id: 'everyday_simple',
    label: 'Everyday simple (full detail)',
    description: 'Same length, everyday words + common phrases — no detail dropped.',
  },
  {
    id: 'key_quotes',
    label: 'Key quotes',
    description: '5–10 most powerful sentences, verbatim.',
  },
  {
    id: 'review_questions',
    label: 'Review questions',
    description: '6–10 questions to test understanding.',
  },
];

/**
 * Run AI rewrite on a chapter. Returns the cached entry when available;
 * otherwise calls the edge function and writes the result to IndexedDB.
 */
export async function rewriteChapter(
  bookId: string,
  chapterIndex: number,
  chapterTitle: string,
  chapterText: string,
  style: RewriteStyle,
  options: { force?: boolean; model?: BookAnalysisModel } = {},
): Promise<BookChapterRewrite> {
  if (!options.force) {
    const cached = await getChapterRewrite(bookId, chapterIndex, style);
    if (cached) return cached;
  }

  const { data, error } = await supabase.functions.invoke<RewriteResponse>(
    'rewrite-chapter',
    {
      body: {
        chapterText,
        chapterTitle,
        style,
        model: options.model,
      },
    },
  );

  if (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (error as any).context as Response | undefined;
    const status = ctx?.status;
    let message = error.message || 'Rewrite failed.';
    try {
      if (ctx) {
        const body = await ctx.clone().json().catch(() => null);
        if (body?.error) message = String(body.error);
      }
    } catch {
      /* ignore */
    }
    if (status === 429) throw new ChapterRewriteError('rate_limit', message);
    if (status === 402) throw new ChapterRewriteError('payment', message);
    throw new ChapterRewriteError('network', message);
  }

  if (!data || data.error) {
    throw new ChapterRewriteError('invalid', data?.error ?? 'Empty rewrite response.');
  }

  const record: BookChapterRewrite = {
    id: rewriteKey(bookId, chapterIndex, style),
    bookId,
    chapterIndex,
    style,
    html: data.html,
    text: data.text,
    wordCount: data.wordCount ?? 0,
    model: data.model ?? options.model ?? 'unknown',
    createdAt: Date.now(),
  };

  await saveChapterRewrite(record);
  return record;
}

export function rewriteErrorMessage(e: unknown, fallback = 'Rewrite failed.'): string {
  if (e instanceof ChapterRewriteError) {
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
