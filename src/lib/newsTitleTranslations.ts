/**
 * Persistent local cache of Persian translations for news titles/excerpts,
 * plus a batch translator that calls the `news-translate-titles` edge fn.
 *
 * Cost-aware: cached forever per URL; batches up to 25 items per AI call.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'news.titleTranslations.v1';
const BATCH_SIZE = 25;

export interface TitleTranslation {
  titleFa: string;
  excerptFa?: string;
}

type Store = Record<string, TitleTranslation>;

let memory: Store = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch { return {}; }
})();

const listeners = new Set<() => void>();
function emit() { for (const fn of listeners) fn(); }

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(memory)); } catch { /* */ }
}

export function getCachedTitleTranslation(url: string): TitleTranslation | undefined {
  return memory[url];
}

export function setTitleTranslation(url: string, t: TitleTranslation) {
  memory[url] = t;
  persist();
  emit();
}

export function subscribeTitleTranslations(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React hook — returns a reactive copy of the whole map. */
export function useTitleTranslations(): Store {
  const [snap, setSnap] = useState<Store>(memory);
  useEffect(() => subscribeTitleTranslations(() => setSnap({ ...memory })), []);
  return snap;
}

const RTL_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
function isPersianish(s?: string | null): boolean {
  return !!s && RTL_RE.test(s);
}

export interface TranslatableItem {
  url: string;
  title: string;
  excerpt?: string;
}

/**
 * Translate every item that isn't already in Persian and isn't already cached.
 * Returns a summary { translated, skipped, failed }.
 */
export async function translateTitlesBatch(
  items: TranslatableItem[],
  opts: {
    model?: string;
    onProgress?: (snap: { done: number; total: number; failed: number }) => void;
    signal?: AbortSignal;
  } = {},
): Promise<{ translated: number; skipped: number; failed: number }> {
  // Deduplicate + filter out cached + Persian items.
  const map = new Map<string, TranslatableItem>();
  for (const it of items) {
    if (!it.url || !it.title) continue;
    if (isPersianish(it.title)) continue;
    if (memory[it.url]?.titleFa) continue;
    if (!map.has(it.url)) map.set(it.url, it);
  }
  const pending = Array.from(map.values());
  const total = pending.length;
  let done = 0;
  let failed = 0;

  if (total === 0) {
    opts.onProgress?.({ done: 0, total: 0, failed: 0 });
    return { translated: 0, skipped: items.length, failed: 0 };
  }

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    if (opts.signal?.aborted) break;
    const slice = pending.slice(i, i + BATCH_SIZE);
    try {
      const { data, error } = await supabase.functions.invoke<{
        results: Array<{ id: string; titleFa: string; excerptFa?: string }>;
      }>('news-translate-titles', {
        body: {
          items: slice.map((it) => ({ id: it.url, title: it.title, excerpt: it.excerpt })),
          model: opts.model,
        },
      });
      if (error) throw new Error(error.message);
      const results = data?.results ?? [];
      for (const r of results) {
        if (r?.id && r.titleFa) {
          memory[r.id] = { titleFa: r.titleFa, excerptFa: r.excerptFa };
        }
      }
      persist();
      emit();
      done += slice.length;
    } catch (e) {
      console.error('[translateTitlesBatch] batch failed', e);
      failed += slice.length;
    }
    opts.onProgress?.({ done, total, failed });
  }

  return { translated: done - failed, skipped: items.length - total, failed };
}

/** Wipe the entire cache (useful for a "reset" option). */
export function clearTitleTranslations() {
  memory = {};
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
  emit();
}
