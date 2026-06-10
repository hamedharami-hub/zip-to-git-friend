/**
 * Tiny localStorage cache for News article reader so re-opens work fully
 * offline. We cache the article body and any rewrites by article id.
 * Translations are already cached separately (IndexedDB via
 * paragraphAnalysisCloud), so we don't duplicate them here.
 */
import type { NewsArticle, NewsDigest } from '@/lib/news';

const ARTICLE_PREFIX = 'news.cache.article.v1:';
const REWRITES_PREFIX = 'news.cache.rewrites.v1:';

export function cacheArticle(a: NewsArticle): void {
  try { localStorage.setItem(ARTICLE_PREFIX + a.id, JSON.stringify(a)); } catch { /* */ }
}
export function getCachedArticle(id: string): NewsArticle | null {
  try {
    const v = localStorage.getItem(ARTICLE_PREFIX + id);
    return v ? (JSON.parse(v) as NewsArticle) : null;
  } catch { return null; }
}

export function cacheRewrites(articleId: string, map: Record<string, NewsDigest | undefined>): void {
  try { localStorage.setItem(REWRITES_PREFIX + articleId, JSON.stringify(map)); } catch { /* */ }
}
export function getCachedRewrites(articleId: string): Record<string, NewsDigest | undefined> | null {
  try {
    const v = localStorage.getItem(REWRITES_PREFIX + articleId);
    return v ? (JSON.parse(v) as Record<string, NewsDigest | undefined>) : null;
  } catch { return null; }
}
