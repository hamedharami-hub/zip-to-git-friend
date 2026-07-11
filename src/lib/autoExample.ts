/**
 * Auto-generate a tiny illustrative SENTENCE for short phrases.
 *
 * Many entries in Sentence Lab are bare phrases ("on the other hand",
 * "as a matter of fact") rather than full sentences. For those we ask
 * Lovable AI for a single short example sentence using that phrase, and
 * its Persian translation, then cache the result in localStorage forever.
 *
 * The cache key is the (sentenceId, english, persian) tuple so AI is
 * called at most once per phrase per browser.
 */

import { supabase } from "@/integrations/supabase/client";

export interface AutoExample {
  english: string;
  persian: string;
}

const STORAGE_KEY = "sentenceLab.autoExamples.v1";
const inflight = new Map<string, Promise<AutoExample | null>>();

function loadCache(): Record<string, AutoExample> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AutoExample>) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, AutoExample>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota errors */
  }
}

/** Heuristic: ≤3 words OR ends without punctuation = treat as phrase. */
export function looksLikePhrase(english: string): boolean {
  const trimmed = english.trim();
  if (!trimmed) return false;
  const words = trimmed.split(/\s+/).length;
  if (words <= 3) return true;
  const lastChar = trimmed[trimmed.length - 1];
  if (!/[.!?]/.test(lastChar) && words <= 6) return true;
  return false;
}

export function getCachedExample(sentenceId: string): AutoExample | null {
  const cache = loadCache();
  return cache[sentenceId] ?? null;
}

/**
 * Get an example sentence for a phrase, generating + caching on first use.
 * Returns null if generation fails (caller should just hide the example).
 */
export async function getAutoExample(
  sentenceId: string,
  english: string,
  persian: string | null,
  model?: string,
): Promise<AutoExample | null> {
  const cached = getCachedExample(sentenceId);
  if (cached) return cached;

  const pending = inflight.get(sentenceId);
  if (pending) return pending;

  const task = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("sentence-auto-example", {
        body: {
          sentence_id: sentenceId,
          english,
          persian: persian ?? null,
          model,
        },
      });
      if (error) throw error;
      const example = (data as { example?: AutoExample })?.example;
      if (!example?.english || !example?.persian) return null;
      const cache = loadCache();
      cache[sentenceId] = example;
      saveCache(cache);
      return example;
    } catch (e) {
      console.warn("[autoExample] generation failed", sentenceId, e);
      return null;
    } finally {
      inflight.delete(sentenceId);
    }
  })();

  inflight.set(sentenceId, task);
  return task;
}
