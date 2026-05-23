import { create } from 'zustand';
import type { Book, BookChapter } from '@/types';
import {
  getAllBooks,
  getBook as dbGetBook,
  saveBook as dbSaveBook,
  deleteBook as dbDeleteBook,
  getChaptersForBook,
} from '@/lib/bookDb';
import {
  uploadBookToCloud,
  pushBookProgress,
  deleteBookFromCloud,
  syncBooksWithCloud,
} from '@/lib/bookCloudSync';

interface BookStoreState {
  books: Book[];
  loaded: boolean;
  /** True while a cloud pull/push is happening (used by the books page). */
  syncing: boolean;
  /** Currently opened book in the reader (null until /books/:id mounts). */
  currentBook: Book | null;
  /** Chapters for the currently opened book. Empty until parsed/loaded. */
  currentChapters: BookChapter[];

  load: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Pull from cloud, then push anything local that wasn't there. */
  syncWithCloud: () => Promise<void>;
  upsert: (book: Book, options?: { syncBlob?: boolean }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  openBook: (id: string) => Promise<Book | null>;
  closeBook: () => void;
}

export const useBookStore = create<BookStoreState>((set, get) => ({
  books: [],
  loaded: false,
  syncing: false,
  currentBook: null,
  currentChapters: [],

  async load() {
    if (get().loaded) return;
    const books = await getAllBooks();
    set({ books, loaded: true });
  },

  async refresh() {
    const books = await getAllBooks();
    set({ books });
  },

  async syncWithCloud() {
    if (get().syncing) return;
    set({ syncing: true });
    try {
      await syncBooksWithCloud();
      const books = await getAllBooks();
      set({ books });
    } catch (e) {
      console.warn('[bookStore] cloud sync failed', e);
    } finally {
      set({ syncing: false });
    }
  },

  async upsert(book, options) {
    await dbSaveBook(book);
    await get().refresh();
    if (get().currentBook?.id === book.id) {
      set({ currentBook: book });
    }
    // Fire-and-forget cloud sync. Full upload (incl. blob+chapters) when
    // explicitly requested OR when the book just appeared (no chapterCount
    // change check needed — the helper is idempotent and cheap).
    if (options?.syncBlob) {
      void uploadBookToCloud(book, { forceBlob: true });
    } else {
      // Lightweight progress push for scroll/chapter updates.
      void pushBookProgress(book);
    }
  },

  async remove(id) {
    await dbDeleteBook(id);
    void deleteBookFromCloud(id);
    await get().refresh();
    if (get().currentBook?.id === id) {
      set({ currentBook: null, currentChapters: [] });
    }
  },

  async openBook(id) {
    const book = (await dbGetBook(id)) ?? null;
    if (!book) {
      set({ currentBook: null, currentChapters: [] });
      return null;
    }
    const chapters = await getChaptersForBook(id);
    set({ currentBook: book, currentChapters: chapters });
    return book;
  },

  closeBook() {
    set({ currentBook: null, currentChapters: [] });
  },
}));
