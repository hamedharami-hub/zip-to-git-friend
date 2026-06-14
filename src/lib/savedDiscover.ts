/**
 * Local cache for "Live Discover" searches so they can be re-opened offline.
 * Stored in localStorage as a list, keyed by topic + windowHours.
 */
import type { LiveDiscoverResult } from '@/lib/news';

const KEY = 'news.savedDiscover.v1';
const MAX = 30;

export interface SavedDiscover {
  id: string;            // topic|windowHours lowercased
  topic: string;
  windowHours: number;
  savedAt: number;       // ms
  result: LiveDiscoverResult;
}

function read(): SavedDiscover[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function write(list: SavedDiscover[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* */ }
}

export function listSavedDiscover(): SavedDiscover[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

export function saveDiscover(
  topic: string,
  windowHours: number,
  result: LiveDiscoverResult,
): SavedDiscover {
  const id = `${topic.trim().toLowerCase()}|${windowHours}`;
  const entry: SavedDiscover = {
    id,
    topic: topic.trim(),
    windowHours,
    savedAt: Date.now(),
    result,
  };
  const list = read().filter((s) => s.id !== id);
  list.unshift(entry);
  write(list);
  return entry;
}

export function deleteSavedDiscover(id: string): void {
  write(read().filter((s) => s.id !== id));
}

export function getSavedDiscover(id: string): SavedDiscover | null {
  return read().find((s) => s.id === id) ?? null;
}
