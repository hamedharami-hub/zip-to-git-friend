/**
 * Persists "already-read" article URLs in localStorage so the news list
 * can dim items the user has previously opened. Cross-tab safe via the
 * `storage` event.
 */
const KEY = 'news.seen.v1';
const MAX = 5000;

type Listener = () => void;
const listeners = new Set<Listener>();

let cache: Set<string> | null = null;

function load(): Set<string> {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    cache = new Set(Array.isArray(arr) ? arr : []);
  } catch {
    cache = new Set();
  }
  return cache;
}

function persist() {
  if (!cache) return;
  try {
    let arr = Array.from(cache);
    if (arr.length > MAX) arr = arr.slice(arr.length - MAX);
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    /* quota — ignore */
  }
}

export function isSeen(url: string): boolean {
  return load().has(url);
}

export function markSeen(url: string) {
  if (!url) return;
  const s = load();
  if (s.has(url)) return;
  s.add(url);
  persist();
  for (const l of listeners) l();
}

export function subscribeSeen(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      cache = null;
      for (const l of listeners) l();
    }
  });
}
