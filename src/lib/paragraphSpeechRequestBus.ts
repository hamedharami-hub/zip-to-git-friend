/**
 * Bus for paragraph-level TTS commands raised by the long-press action menu.
 *
 *  - 'play-one'   → read just this paragraph
 *  - 'play-from'  → start the full chapter narrator from this paragraph and
 *                   keep reading until the user stops
 *  - 'stop'       → cancel any current narration
 *
 * Producer = `ParagraphActionsMenu` inside `InteractiveBookText`.
 * Consumer = `ChapterTTSPlayer` (opens itself and seeks to the matching chunk).
 */

export type ParagraphSpeechAction = "play-one" | "play-from" | "stop";

export interface ParagraphSpeechRequest {
  action: ParagraphSpeechAction;
  /** Plain text of the paragraph the user long-pressed. Empty for 'stop'. */
  text: string;
  /** Language hint when the user picked the Persian translation. */
  lang?: "en" | "fa";
}

type Listener = (req: ParagraphSpeechRequest) => void;

const listeners = new Map<string, Set<Listener>>();

function key(bookId: string, chapterIndex: number): string {
  return `${bookId}:${chapterIndex}`;
}

export function subscribeParagraphSpeechRequest(
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

export function emitParagraphSpeechRequest(
  bookId: string,
  chapterIndex: number,
  req: ParagraphSpeechRequest,
): void {
  const set = listeners.get(key(bookId, chapterIndex));
  if (!set || set.size === 0) return;
  for (const fn of set) {
    try {
      fn(req);
    } catch {
      /* ignore */
    }
  }
}
