/**
 * Pub/sub for "which paragraph is currently being spoken".
 *
 * The publisher (ChapterTTSPlayer) emits the *first ~80 chars of the current
 * paragraph*. Subscribers (InteractiveBookText) match it against their own
 * paragraph blocks to drive a karaoke-style ring + auto-scroll.
 *
 * We use text instead of an index because the player chunks plain text while
 * the renderer chunks sanitized HTML — counts can differ.
 */

type Listener = (activeKey: string | null) => void;
const listeners = new Map<string, Set<Listener>>();
const lastValue = new Map<string, string | null>();

function key(bookId: string, chapterIndex: number) {
  return `${bookId}:${chapterIndex}`;
}

/** Build a stable lookup key from a paragraph's first ~80 normalized chars. */
export function speechKeyFor(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 80);
}

export function subscribeParagraphSpeech(
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
  const v = lastValue.get(k);
  if (v !== undefined) {
    try {
      fn(v);
    } catch {
      /* ignore */
    }
  }
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(k);
  };
}

export function emitParagraphSpeech(
  bookId: string,
  chapterIndex: number,
  activeText: string | null,
): void {
  const k = key(bookId, chapterIndex);
  const v = activeText == null ? null : speechKeyFor(activeText);
  lastValue.set(k, v);
  const set = listeners.get(k);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(v);
    } catch {
      /* ignore */
    }
  }
}
