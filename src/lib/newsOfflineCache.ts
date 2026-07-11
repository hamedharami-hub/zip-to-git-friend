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
import type { NewsArticle, NewsDigest, FeedItem } from "@/lib/news";
import { scrapeArticle, upsertArticle, importUrl } from "@/lib/news";

const ARTICLE_PREFIX = "news.cache.article.v1:";
const REWRITES_PREFIX = "news.cache.rewrites.v1:";
const URL_INDEX_KEY = "news.cache.urlIndex.v1";

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
  return !!a?.contentMd && a.contentMd !== "__SCRAPE_FAILED__";
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
 * Returns the resulting NewsArticle (already saved on the server + cached).
 * Skips work if the article body is already cached locally (unless force).
 */
export async function prefetchArticleForOffline(
  item: FeedItem,
  opts: { sourceId?: string | null; force?: boolean } = {},
): Promise<NewsArticle> {
  // Fast-path: already cached with real content.
  const existingId = getCachedIdForUrl(item.url);
  if (!opts.force && existingId) {
    const ex = getCachedArticle(existingId);
    if (ex?.contentMd && ex.contentMd !== "__SCRAPE_FAILED__") return ex;
  }

  // 1. Make sure the article row exists so we have a stable id.
  const base = await upsertArticle({
    sourceId: opts.sourceId ?? null,
    url: item.url,
    title: item.title,
    excerpt: item.excerpt ?? null,
    imageUrl: item.imageUrl ?? null,
    siteName: item.siteName ?? null,
    publishedAt: item.publishedAt ?? null,
  });

  // 2. YouTube → transcript-to-article via importUrl; everything else → scrape.
  let updated: NewsArticle = base;
  try {
    if (isYoutubeUrl(item.url)) {
      const result = await importUrl(item.url);
      if (result.kind === "article" || result.kind === "youtube") {
        const art = result.article;
        updated = await upsertArticle({
          sourceId: base.sourceId,
          url: base.url,
          title: art.title || base.title,
          author: art.author,
          excerpt: art.excerpt,
          contentMd: art.contentMd,
          contentHtml: art.contentHtml,
          imageUrl: art.imageUrl ?? base.imageUrl,
          siteName: art.siteName ?? base.siteName,
          language: art.language,
          publishedAt: art.publishedAt ?? base.publishedAt,
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
        sourceId: base.sourceId,
        url: base.url,
        title: scraped.title || base.title,
        author: scraped.author,
        excerpt: scraped.excerpt || base.excerpt,
        contentMd: scraped.contentMd,
        contentHtml: scraped.contentHtml,
        imageUrl: scraped.imageUrl ?? base.imageUrl,
        siteName: scraped.siteName ?? base.siteName,
        language: scraped.language,
        publishedAt: scraped.publishedAt ?? base.publishedAt,
        wordCount: scraped.wordCount,
      });
    }
  } catch (e) {
    // Even if scrape failed, cache the bare row so the user lands on a real
    // article page (not a 404) when offline.
    cacheArticle(updated);
    throw e;
  }

  cacheArticle(updated);
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
