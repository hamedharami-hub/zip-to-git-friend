/**
 * Persistent feed cache: keeps a per-source rolling list of FeedItems in
 * localStorage so that previously-seen titles never disappear, even when
 * the live RSS or AI search forgets them.
 *
 * Strategy:
 *   - Key per source: `news.feed.<sourceId>`
 *   - Merge new items into the cached list, deduping by URL.
 *   - Sort by publishedAt desc (fallback: insertion order).
 *   - Cap at MAX_ITEMS to keep storage bounded.
 */
import type { FeedItem } from "./news";

const PREFIX = "news.feed.";
const MAX_ITEMS = 300;
export const FEED_CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

interface StoredItem extends FeedItem {
  cachedAt: string;
}

function key(sourceId: string): string {
  return `${PREFIX}${sourceId}`;
}

export function loadCachedFeed(sourceId: string): FeedItem[] {
  try {
    const raw = localStorage.getItem(key(sourceId));
    if (!raw) return [];
    const arr = JSON.parse(raw) as StoredItem[];
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

export function mergeIntoCache(sourceId: string, fresh: FeedItem[]): FeedItem[] {
  const existing = loadCachedFeed(sourceId);
  const map = new Map<string, StoredItem>();
  // Older first so that fresh entries overwrite (and update titles/excerpts).
  for (const it of existing) {
    map.set(it.url, { ...it, cachedAt: (it as StoredItem).cachedAt ?? new Date().toISOString() });
  }
  const now = new Date().toISOString();
  for (const it of fresh) {
    if (!it?.url) continue;
    const prev = map.get(it.url);
    map.set(it.url, {
      ...prev,
      ...it,
      cachedAt: prev?.cachedAt ?? now,
    });
  }
  const merged = Array.from(map.values());
  merged.sort((a, b) => {
    const aT = Date.parse(a.publishedAt ?? a.cachedAt ?? "") || 0;
    const bT = Date.parse(b.publishedAt ?? b.cachedAt ?? "") || 0;
    return bT - aT;
  });
  const capped = merged.slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(key(sourceId), JSON.stringify(capped));
  } catch {
    // Quota — drop half and retry once.
    try {
      localStorage.setItem(
        key(sourceId),
        JSON.stringify(capped.slice(0, Math.floor(MAX_ITEMS / 2))),
      );
    } catch {
      /* ignore */
    }
  }
  return capped;
}

export function clearCachedFeed(sourceId: string): void {
  try {
    localStorage.removeItem(key(sourceId));
  } catch {
    /* ignore */
  }
}

export function getFeedLastCachedAt(sourceId: string): number | null {
  const arr = loadCachedFeed(sourceId) as StoredItem[];
  if (!arr.length) return null;
  const latest = Math.max(
    ...arr.map((it) => Date.parse(it.cachedAt ?? "1970-01-01T00:00:00Z") || 0),
  );
  return Number.isFinite(latest) ? latest : null;
}

export function isFeedFresh(sourceId: string, maxAgeMs: number = FEED_CACHE_TTL_MS): boolean {
  const last = getFeedLastCachedAt(sourceId);
  if (!last) return false;
  return Date.now() - last < maxAgeMs;
}
