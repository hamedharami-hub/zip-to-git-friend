/**
 * Book persistence layer.
 *
 * Lives in its own IndexedDB database (`LLVPBookDatabase`) so that future
 * book-only migrations don't touch the main video/leitner DB. Word knowledge
 * (`wordStatus`) and Leitner cards stay in the main DB so progress is shared
 * across all media types (videos, audio, books).
 */
import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type {
  Book,
  BookChapter,
  BookHighlight,
  BookBookmark,
  BookParagraphAnalysis,
  BookTTSAudio,
  BookTTSChunk,
  BookChapterRewrite,
  ReadingSession,
  RewriteStyle,
} from '@/types';

interface BookSchema extends DBSchema {
  books: {
    key: string;
    value: Book;
    indexes: { createdAt: number; updatedAt: number };
  };
  /** Original .epub bytes, kept separately so the metadata row stays small. */
  bookBlobs: {
    key: string; // bookId
    value: { id: string; blob: Blob; mimeType: string; savedAt: number };
  };
  bookChapters: {
    key: string; // `${bookId}:${index}`
    value: BookChapter;
    indexes: { bookId: string };
  };
  bookHighlights: {
    key: string;
    value: BookHighlight;
    indexes: { bookId: string; 'bookId+chapterIndex': [string, number] };
  };
  bookBookmarks: {
    key: string;
    value: BookBookmark;
    indexes: { bookId: string };
  };
  bookParagraphAnalyses: {
    key: string;
    value: BookParagraphAnalysis;
    indexes: {
      bookId: string;
      'bookId+chapterIndex': [string, number];
    };
  };
  bookTTSAudio: {
    key: string;
    value: BookTTSAudio;
    indexes: { bookId: string; 'bookId+chapterIndex': [string, number] };
  };
  bookTTSChunks: {
    key: string;
    value: BookTTSChunk;
    indexes: {
      bookId: string;
      'bookId+chapterIndex': [string, number];
      'bookId+chapterIndex+voice': [string, number, string];
    };
  };
  bookChapterRewrites: {
    key: string;
    value: BookChapterRewrite;
    indexes: { bookId: string; 'bookId+chapterIndex': [string, number] };
  };
  readingSessions: {
    key: string; // YYYY-MM-DD
    value: ReadingSession;
  };
}

let dbPromise: Promise<IDBPDatabase<BookSchema>> | null = null;

export function getBookDb() {
  if (!dbPromise) {
    dbPromise = openDB<BookSchema>('LLVPBookDatabase', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
        const books = db.createObjectStore('books', { keyPath: 'id' });
        books.createIndex('createdAt', 'createdAt');
        books.createIndex('updatedAt', 'updatedAt');

        db.createObjectStore('bookBlobs', { keyPath: 'id' });

        const chapters = db.createObjectStore('bookChapters', { keyPath: 'id' });
        chapters.createIndex('bookId', 'bookId');

        const highlights = db.createObjectStore('bookHighlights', { keyPath: 'id' });
        highlights.createIndex('bookId', 'bookId');
        highlights.createIndex('bookId+chapterIndex', ['bookId', 'chapterIndex']);

        const bookmarks = db.createObjectStore('bookBookmarks', { keyPath: 'id' });
        bookmarks.createIndex('bookId', 'bookId');

        const analyses = db.createObjectStore('bookParagraphAnalyses', { keyPath: 'id' });
        analyses.createIndex('bookId', 'bookId');
        analyses.createIndex('bookId+chapterIndex', ['bookId', 'chapterIndex']);

        const tts = db.createObjectStore('bookTTSAudio', { keyPath: 'id' });
        tts.createIndex('bookId', 'bookId');
        tts.createIndex('bookId+chapterIndex', ['bookId', 'chapterIndex']);

        db.createObjectStore('readingSessions', { keyPath: 'date' });
        }
        if (oldVersion < 2) {
          const rw = db.createObjectStore('bookChapterRewrites', { keyPath: 'id' });
          rw.createIndex('bookId', 'bookId');
          rw.createIndex('bookId+chapterIndex', ['bookId', 'chapterIndex']);
        }
      },
    });
  }
  return dbPromise;
}

// ───────────────────────────── Books ──
export async function getAllBooks(): Promise<Book[]> {
  const rows = await (await getBookDb()).getAllFromIndex('books', 'updatedAt');
  return rows.reverse();
}

export async function getBook(id: string): Promise<Book | undefined> {
  return (await getBookDb()).get('books', id);
}

export async function saveBook(book: Book): Promise<void> {
  await (await getBookDb()).put('books', { ...book, updatedAt: Date.now() });
}

export async function deleteBook(id: string): Promise<void> {
  const db = await getBookDb();
  // Cascade: blob + chapters + highlights + bookmarks + analyses + TTS audio.
  await Promise.allSettled([
    db.delete('books', id),
    db.delete('bookBlobs', id),
    (async () => {
      const chapters = await db.getAllFromIndex('bookChapters', 'bookId', id);
      await Promise.all(chapters.map((c) => db.delete('bookChapters', c.id)));
    })(),
    (async () => {
      const hs = await db.getAllFromIndex('bookHighlights', 'bookId', id);
      await Promise.all(hs.map((h) => db.delete('bookHighlights', h.id)));
    })(),
    (async () => {
      const bs = await db.getAllFromIndex('bookBookmarks', 'bookId', id);
      await Promise.all(bs.map((b) => db.delete('bookBookmarks', b.id)));
    })(),
    (async () => {
      const as = await db.getAllFromIndex('bookParagraphAnalyses', 'bookId', id);
      await Promise.all(as.map((a) => db.delete('bookParagraphAnalyses', a.id)));
    })(),
    (async () => {
      const ts = await db.getAllFromIndex('bookTTSAudio', 'bookId', id);
      await Promise.all(ts.map((t) => db.delete('bookTTSAudio', t.id)));
    })(),
    (async () => {
      const rs = await db.getAllFromIndex('bookChapterRewrites', 'bookId', id);
      await Promise.all(rs.map((r) => db.delete('bookChapterRewrites', r.id)));
    })(),
  ]);
}

// ───────────────────────────── Blobs (.epub bytes) ──
export async function saveBookBlob(id: string, file: File | Blob): Promise<void> {
  const mimeType = (file as File).type || 'application/epub+zip';
  await (await getBookDb()).put('bookBlobs', {
    id,
    blob: file,
    mimeType,
    savedAt: Date.now(),
  });
}

export async function getBookBlob(id: string): Promise<Blob | null> {
  const row = await (await getBookDb()).get('bookBlobs', id);
  return row?.blob ?? null;
}

// ───────────────────────────── Chapters ──
export function chapterKey(bookId: string, index: number): string {
  return `${bookId}:${index}`;
}

export async function saveChapter(chapter: BookChapter): Promise<void> {
  await (await getBookDb()).put('bookChapters', chapter);
}

export async function saveChapters(chapters: BookChapter[]): Promise<void> {
  const db = await getBookDb();
  const tx = db.transaction('bookChapters', 'readwrite');
  await Promise.all(chapters.map((c) => tx.store.put(c)));
  await tx.done;
}

export async function getChapter(
  bookId: string,
  index: number,
): Promise<BookChapter | undefined> {
  return (await getBookDb()).get('bookChapters', chapterKey(bookId, index));
}

export async function getChaptersForBook(bookId: string): Promise<BookChapter[]> {
  const rows = await (await getBookDb()).getAllFromIndex('bookChapters', 'bookId', bookId);
  return rows.sort((a, b) => a.index - b.index);
}

/** Append a brand new chapter to a book (auto-picks the next index).
 *  Returns the saved chapter so the caller can immediately render / sync it. */
export async function appendChapter(
  bookId: string,
  data: { title: string; html: string; text: string; wordCount: number },
): Promise<BookChapter> {
  const existing = await getChaptersForBook(bookId);
  const nextIndex = existing.length;
  const chapter: BookChapter = {
    id: chapterKey(bookId, nextIndex),
    bookId,
    index: nextIndex,
    title: data.title,
    html: data.html,
    text: data.text,
    wordCount: data.wordCount,
  };
  await saveChapter(chapter);
  return chapter;
}

// ───────────────────────────── Highlights ──
export async function saveHighlight(h: BookHighlight): Promise<void> {
  await (await getBookDb()).put('bookHighlights', h);
}

export async function deleteHighlight(id: string): Promise<void> {
  await (await getBookDb()).delete('bookHighlights', id);
}

export async function getHighlightsForBook(bookId: string): Promise<BookHighlight[]> {
  return (await getBookDb()).getAllFromIndex('bookHighlights', 'bookId', bookId);
}

export async function getHighlightsForChapter(
  bookId: string,
  chapterIndex: number,
): Promise<BookHighlight[]> {
  return (await getBookDb()).getAllFromIndex(
    'bookHighlights',
    'bookId+chapterIndex',
    [bookId, chapterIndex],
  );
}

// ───────────────────────────── Bookmarks ──
export async function saveBookmark(b: BookBookmark): Promise<void> {
  await (await getBookDb()).put('bookBookmarks', b);
}

export async function deleteBookmark(id: string): Promise<void> {
  await (await getBookDb()).delete('bookBookmarks', id);
}

export async function getBookmarksForBook(bookId: string): Promise<BookBookmark[]> {
  return (await getBookDb()).getAllFromIndex('bookBookmarks', 'bookId', bookId);
}

// ───────────────────────────── Paragraph analyses ──
export function paragraphAnalysisKey(
  bookId: string,
  chapterIndex: number,
  paragraphHash: string,
): string {
  return `${bookId}:${chapterIndex}:${paragraphHash}`;
}

export async function getParagraphAnalysis(
  bookId: string,
  chapterIndex: number,
  paragraphHash: string,
): Promise<BookParagraphAnalysis | undefined> {
  return (await getBookDb()).get(
    'bookParagraphAnalyses',
    paragraphAnalysisKey(bookId, chapterIndex, paragraphHash),
  );
}

export async function saveParagraphAnalysis(a: BookParagraphAnalysis): Promise<void> {
  await (await getBookDb()).put('bookParagraphAnalyses', a);
}

export async function getAnalysesForChapter(
  bookId: string,
  chapterIndex: number,
): Promise<BookParagraphAnalysis[]> {
  return (await getBookDb()).getAllFromIndex(
    'bookParagraphAnalyses',
    'bookId+chapterIndex',
    [bookId, chapterIndex],
  );
}

// ───────────────────────────── TTS audio cache ──
export function ttsKey(bookId: string, chapterIndex: number, voice: string): string {
  return `${bookId}:${chapterIndex}:${voice}`;
}

export async function saveTTSAudio(audio: BookTTSAudio): Promise<void> {
  await (await getBookDb()).put('bookTTSAudio', audio);
}

export async function getTTSAudio(
  bookId: string,
  chapterIndex: number,
  voice: string,
): Promise<BookTTSAudio | undefined> {
  return (await getBookDb()).get('bookTTSAudio', ttsKey(bookId, chapterIndex, voice));
}

export async function deleteTTSAudio(
  bookId: string,
  chapterIndex: number,
  voice: string,
): Promise<void> {
  await (await getBookDb()).delete('bookTTSAudio', ttsKey(bookId, chapterIndex, voice));
}

// ───────────────────────────── Chapter rewrites ──
export function rewriteKey(
  bookId: string,
  chapterIndex: number,
  style: RewriteStyle,
): string {
  return `${bookId}:${chapterIndex}:${style}`;
}

export async function saveChapterRewrite(r: BookChapterRewrite): Promise<void> {
  await (await getBookDb()).put('bookChapterRewrites', r);
}

export async function getChapterRewrite(
  bookId: string,
  chapterIndex: number,
  style: RewriteStyle,
): Promise<BookChapterRewrite | undefined> {
  return (await getBookDb()).get(
    'bookChapterRewrites',
    rewriteKey(bookId, chapterIndex, style),
  );
}

export async function getRewritesForChapter(
  bookId: string,
  chapterIndex: number,
): Promise<BookChapterRewrite[]> {
  return (await getBookDb()).getAllFromIndex(
    'bookChapterRewrites',
    'bookId+chapterIndex',
    [bookId, chapterIndex],
  );
}

export async function deleteChapterRewrite(
  bookId: string,
  chapterIndex: number,
  style: RewriteStyle,
): Promise<void> {
  await (await getBookDb()).delete(
    'bookChapterRewrites',
    rewriteKey(bookId, chapterIndex, style),
  );
}

// ───────────────────────────── Reading sessions ──
function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function addReadingTime(seconds: number, words = 0): Promise<void> {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const db = await getBookDb();
  const date = todayKey();
  const existing = await db.get('readingSessions', date);
  const next: ReadingSession = {
    date,
    seconds: (existing?.seconds ?? 0) + Math.round(seconds),
    words: (existing?.words ?? 0) + Math.max(0, Math.round(words)),
  };
  await db.put('readingSessions', next);
}

export async function getAllReadingSessions(): Promise<ReadingSession[]> {
  return (await getBookDb()).getAll('readingSessions');
}
