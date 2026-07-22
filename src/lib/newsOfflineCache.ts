/**
 * Offline cache for News article reader. Caches the article body and any
 * rewrites by article id so re-opens (and tap-through from the feed) work
 * fully without internet. Translations are already cached separately
 * (IndexedDB via paragraphAnalysisCloud).
 *
 * Also maintains a small `url → articleId` index so the News list can open
 * a prefetched article even when offline (otherwise the `upsertArticle`
 * call would fail and we'd have no `id` to navigate to).
 */
import type { BookChapter } from "@/types";
import type { NewsArticle, NewsDigest, FeedItem } from "@/lib/news";
import { batchAnalyzeChapter } from "@/lib/batchAnalyzeChapter";
import { scrapeArticle, upsertArticle, importUrl } from "@/lib/news";

const ARTICLE_PREFIX = "news.cache.article.v1:";
const REWRITES_PREFIX = "news.cache.rewrites.v1:";
const URL_INDEX_KEY = "news.cache.urlIndex.v1";
const TRANSLATION_PREFIX = "news.cache.translations.v1:";

// ── Article body ─────────────────────────────────────────────────────────
export function cacheArticle(a: NewsArticle): void {
  try {
    localStorage.setItem(ARTICLE_PREFIX + a.id, JSON.stringify(a));
    setUrlIndex(a.url, a.id);
  } catch {
    /* */
  }
}
export function getCachedArticle(id: string): NewsArticle | null {
  try {
    const v = localStorage.getItem(ARTICLE_PREFIX + id);
    return v ? (JSON.parse(v) as NewsArticle) : null;
  } catch {
    return null;
  }
}

// ── Rewrites ─────────────────────────────────────────────────────────────
export function cacheRewrites(
  articleId: string,
  map: Record<string, NewsDigest | undefined>,
): void {
  try {
    localStorage.setItem(REWRITES_PREFIX + articleId, JSON.stringify(map));
  } catch {
    /* */
  }
}
export function getCachedRewrites(
  articleId: string,
): Record<string, NewsDigest | undefined> | null {
  try {
    const v = localStorage.getItem(REWRITES_PREFIX + articleId);
    return v ? (JSON.parse(v) as Record<string, NewsDigest | undefined>) : null;
  } catch {
    return null;
  }
}

// ── URL → articleId index ───────────────────────────────────────────────
function readUrlIndex(): Record<string, string> {
  try {
    const v = localStorage.getItem(URL_INDEX_KEY);
    return v ? (JSON.parse(v) as Record<string, string>) : {};
  } catch {
    return {};
  }
}
function setUrlIndex(url: string, id: string): void {
  try {
    const map = readUrlIndex();
    if (map[url] === id) return;
    map[url] = id;
    localStorage.setItem(URL_INDEX_KEY, JSON.stringify(map));
  } catch {
    /* */
  }
}
export function getCachedIdForUrl(url: string): string | null {
  return readUrlIndex()[url] ?? null;
}
export function isUrlCached(url: string): boolean {
  const id = getCachedIdForUrl(url);
  if (!id) return false;
  const a = getCachedArticle(id);
  if (!a?.contentMd || a.contentMd === "__SCRAPE_FAILED__") return false;
  return hasArticleTranslationsCached(id);
}

export function markArticleTranslationsCached(id: string): void {
  try {
    localStorage.setItem(TRANSLATION_PREFIX + id, "1");
  } catch {
    /* */
  }
}

export function hasArticleTranslationsCached(id: string): boolean {
  try {
    return localStorage.getItem(TRANSLATION_PREFIX + id) === "1";
  } catch {
    return false;
  }
}

// ── Prefetch ─────────────────────────────────────────────────────────────
function isYoutubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /(^|\.)youtube\.com$/.test(u.hostname) || u.hostname === "youtu.be";
  } catch {
    return false;
  }
}

/**
 * Download, scrape and persist a single feed item for offline use.
 * Also fetches and caches per-paragraph translations so the full reader
 * experience works offline.
 *
 * Returns the resulting NewsArticle (already saved on the server + cached).
 * Skips work if the article body and its translations are already cached
 * locally (unless force).
 */
export async function prefetchArticleForOffline(
  item: FeedItem,
  opts: {
    sourceId?: string | null;
    force?: boolean;
    signal?: AbortSignal;
    withTranslations?: boolean;
  } = {},
): Promise<NewsArticle> {
  const withTranslations = opts.withTranslations !== false;

  // Fast-path: already cached with real content and translations.
  const existingId = getCachedIdForUrl(item.url);
  if (!opts.force && existingId) {
    const ex = getCachedArticle(existingId);
    if (
      ex?.contentMd &&
      ex.contentMd !== "__SCRAPE_FAILED__" &&
      (!withTranslations || hasArticleTranslationsCached(existingId))
    ) {
      return ex;
    }
  }

  // 1. Make sure the article row exists so we have a stable id.
  let updated: NewsArticle | null = existingId ? getCachedArticle(existingId) : null;
  if (!updated) {
    updated = await upsertArticle({
      sourceId: opts.sourceId ?? null,
      url: item.url,
      title: item.title,
      excerpt: item.excerpt ?? null,
      imageUrl: item.imageUrl ?? null,
      siteName: item.siteName ?? null,
      publishedAt: item.publishedAt ?? null,
    });
  }

  // 2. YouTube → transcript-to-article via importUrl; everything else → scrape.
  try {
    if (!updated.contentMd || opts.force) {
      if (isYoutubeUrl(item.url)) {
        const result = await importUrl(item.url);
        if (result.kind === "article" || result.kind === "youtube") {
          const art = result.article;
          updated = await upsertArticle({
            sourceId: updated.sourceId,
            url: updated.url,
            title: art.title || updated.title,
            author: art.author,
            excerpt: art.excerpt,
            contentMd: art.contentMd,
            contentHtml: art.contentHtml,
            imageUrl: art.imageUrl ?? updated.imageUrl,
            siteName: art.siteName ?? updated.siteName,
            language: art.language,
            publishedAt: art.publishedAt ?? updated.publishedAt,
            wordCount: art.wordCount,
          });
        }
      } else {
        const scraped = await scrapeArticle(item.url, {
          excerpt: item.excerpt ?? undefined,
          imageUrl: item.imageUrl ?? undefined,
          siteName: item.siteName ?? undefined,
        });
        updated = await upsertArticle({
          sourceId: updated.sourceId,
          url: updated.url,
          title: scraped.title || updated.title,
          author: scraped.author,
          excerpt: scraped.excerpt || updated.excerpt,
          contentMd: scraped.contentMd,
          contentHtml: scraped.contentHtml,
          imageUrl: scraped.imageUrl ?? updated.imageUrl,
          siteName: scraped.siteName ?? updated.siteName,
          language: scraped.language,
          publishedAt: scraped.publishedAt ?? updated.publishedAt,
          wordCount: scraped.wordCount,
        });
      }
    }
  } catch (e) {
    // Even if scrape failed, cache the bare row so the user lands on a real
    // article page (not a 404) when offline.
    cacheArticle(updated);
    throw e;
  }

  cacheArticle(updated);

  // 3. Cache paragraph translations for offline reading.
  if (withTranslations && updated.contentHtml) {
    const bookId = `news-${updated.id}`;
    const chapter: BookChapter = {
      id: `${bookId}:0`,
      bookId,
      index: 0,
      title: updated.title,
      html: updated.contentHtml,
      text: updated.contentMd ?? "",
      wordCount: updated.wordCount ?? 0,
    };
    try {
      if (opts.signal?.aborted) throw new Error("cancelled");
      const progress = await batchAnalyzeChapter(bookId, chapter, {
        concurrency: 1,
        signal: opts.signal,
      });
      if (progress.failed === 0) {
        markArticleTranslationsCached(updated.id);
      }
    } catch {
      // Translations are optional for offline; the article body is already cached.
      console.warn("[news offline] paragraph translation prefetch failed", item.url);
    }
  }

  return updated;
}

export interface PrefetchProgress {
  done: number;
  total: number;
  failed: number;
  current?: string;
}

/**
 * Prefetch a batch of items for offline use, with limited parallelism.
 * Skips items already cached. Reports progress via onProgress.
 */
export async function prefetchManyForOffline(
  items: FeedItem[],
  opts: {
    sourceIdByUrl?: (url: string) => string | null;
    concurrency?: number;
    force?: boolean;
    onProgress?: (p: PrefetchProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<PrefetchProgress> {
  const concurrency = Math.max(1, Math.min(4, opts.concurrency ?? 2));
  const queue = [...items];
  const total = queue.length;
  let done = 0;
  let failed = 0;

  const report = (current?: string) => opts.onProgress?.({ done, total, failed, current });
  report();

  const workers: Promise<void>[] = [];
  for (let w = 0; w < concurrency; w++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          if (opts.signal?.aborted) return;
          const item = queue.shift()!;
          report(item.title);
          try {
            await prefetchArticleForOffline(item, {
              sourceId: opts.sourceIdByUrl?.(item.url) ?? null,
              force: opts.force,
              signal: opts.signal,
              withTranslations: true,
            });
          } catch (e) {
            failed += 1;
            console.warn("[news offline] prefetch failed", item.url, e);
          } finally {
            done += 1;
            report(item.title);
          }
        }
      })(),
    );
  }
  await Promise.all(workers);
  return { done, total, failed };
}
