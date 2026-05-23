/**
 * Tiny in-memory pub/sub used to broadcast freshly-cached paragraph analyses
 * between the BookReader's batch sheet and the InteractiveBookText renderer
 * without prop-drilling through unrelated components.
 *
 * Scope: per (bookId, chapterIndex). Subscribers receive the FULL merged map
 * so they can re-render idiom underlines + inline translations in place.
 */
import type { BookParagraphAnalysis } from '@/types';

type Listener = (results: Record<string, BookParagraphAnalysis>) => void;
type Key = string; // `${bookId}:${chapterIndex}`

const listeners = new Map<Key, Set<Listener>>();

function key(bookId: string, chapterIndex: number): Key {
  return `${bookId}:${chapterIndex}`;
}

export function subscribeChapterAnalyses(
  bookId: string,
  chapterIndex: number,
  fn: Listener,
): () => void {
  const k = key(bookId, chapterIndex);
  let set = listeners.get(k);
  if (!set) {
    set = new Set();
    listeners.set(k, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(k);
  };
}

export function emitChapterAnalyses(
  bookId: string,
  chapterIndex: number,
  results: Record<string, BookParagraphAnalysis>,
): void {
  const set = listeners.get(key(bookId, chapterIndex));
  if (!set || set.size === 0) return;
  for (const fn of set) {
    try {
      fn(results);
    } catch {
      /* listener errors must not break siblings */
    }
  }
}
