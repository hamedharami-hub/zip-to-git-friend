/**
 * Cross-device cache for paragraph analyses.
 *
 * Storage strategy:
 *   1. IndexedDB (per device, fast, source of truth on-device)
 *   2. Supabase `paragraph_analyses` (cross-device, keyed by user + paragraph hash)
 *
 * Read path:  IDB → if miss, Cloud → if hit, hydrate IDB → return
 * Write path: IDB + Cloud (fire-and-forget cloud, non-blocking)
 *
 * Anonymous users (not signed in) keep working in pure local mode — every
 * cloud call returns silently when there is no user.
 */
import { supabase } from '@/integrations/supabase/client';
import type { BookParagraphAnalysis } from '@/types';
import {
  getParagraphAnalysis as getLocal,
  paragraphAnalysisKey,
  saveParagraphAnalysis as saveLocal,
} from '@/lib/bookDb';

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Look up a cached analysis. Returns the IDB copy when present; otherwise
 * tries the cloud and hydrates IDB on hit.
 */
export async function getCachedParagraphAnalysisShared(
  bookId: string,
  chapterIndex: number,
  paragraphHash: string,
): Promise<BookParagraphAnalysis | undefined> {
  const local = await getLocal(bookId, chapterIndex, paragraphHash);
  if (local) return local;

  const userId = await currentUserId();
  if (!userId) return undefined;

  try {
    const { data, error } = await supabase
      .from('paragraph_analyses')
      .select('translation, vocabulary, idioms, model, analyzed_at')
      .eq('user_id', userId)
      .eq('paragraph_hash', paragraphHash)
      .maybeSingle();
    if (error || !data) return undefined;

    const record: BookParagraphAnalysis = {
      id: paragraphAnalysisKey(bookId, chapterIndex, paragraphHash),
      bookId,
      chapterIndex,
      paragraphHash,
      translation: data.translation ?? '',
      vocabulary: Array.isArray(data.vocabulary) ? (data.vocabulary as never) : [],
      idioms: Array.isArray(data.idioms) ? (data.idioms as never) : [],
      analyzedAt: data.analyzed_at ? new Date(data.analyzed_at).getTime() : Date.now(),
      model: data.model ?? 'cloud',
    };
    // Hydrate local cache for the next read.
    await saveLocal(record).catch(() => null);
    return record;
  } catch {
    return undefined;
  }
}

/** Save the analysis locally and push to the cloud (non-blocking). */
export async function saveParagraphAnalysisShared(
  record: BookParagraphAnalysis,
): Promise<void> {
  await saveLocal(record);
  void pushToCloud(record);
}

async function pushToCloud(record: BookParagraphAnalysis): Promise<void> {
  try {
    const userId = await currentUserId();
    if (!userId) return;
    await supabase.from('paragraph_analyses').upsert(
      {
        user_id: userId,
        paragraph_hash: record.paragraphHash,
        book_client_id: record.bookId,
        chapter_index: record.chapterIndex,
        translation: record.translation ?? '',
        vocabulary: record.vocabulary ?? [],
        idioms: record.idioms ?? [],
        model: record.model ?? null,
        analyzed_at: new Date(record.analyzedAt).toISOString(),
      },
      { onConflict: 'user_id,paragraph_hash' },
    );
  } catch {
    /* best-effort */
  }
}
