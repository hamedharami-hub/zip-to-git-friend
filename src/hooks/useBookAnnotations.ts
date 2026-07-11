/**
 * Loads + mutates highlights & bookmarks for a single book.
 *
 * Held in component state (not the global book store) because annotations
 * are reader-page only and we want fast local updates without a full refresh
 * of the library list.
 */
import { useCallback, useEffect, useState } from "react";
import {
  saveHighlight,
  deleteHighlight,
  getHighlightsForBook,
  saveBookmark,
  deleteBookmark,
  getBookmarksForBook,
} from "@/lib/bookDb";
import type { BookHighlight, BookBookmark } from "@/types";

export type HighlightColor = "yellow" | "green" | "pink";

export interface CreateHighlightInput {
  bookId: string;
  chapterIndex: number;
  text: string;
  color: HighlightColor;
  note?: string;
  /** Optional locator (e.g. paragraph hash) for jump-to. */
  locator?: string;
}

export function useBookAnnotations(bookId: string | null) {
  const [highlights, setHighlights] = useState<BookHighlight[]>([]);
  const [bookmarks, setBookmarks] = useState<BookBookmark[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!bookId) {
      setHighlights([]);
      setBookmarks([]);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [hs, bs] = await Promise.all([
        getHighlightsForBook(bookId),
        getBookmarksForBook(bookId),
      ]);
      if (cancelled) return;
      setHighlights(hs);
      setBookmarks(bs);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const addHighlight = useCallback(async (input: CreateHighlightInput): Promise<BookHighlight> => {
    const row: BookHighlight = {
      id: crypto.randomUUID(),
      bookId: input.bookId,
      chapterIndex: input.chapterIndex,
      text: input.text,
      note: input.note,
      // Pack the colour into the locator string when no locator is provided so
      // we don't have to extend the schema for a cosmetic field.
      locator: input.locator ?? `color:${input.color}`,
      createdAt: Date.now(),
    };
    await saveHighlight(row);
    setHighlights((prev) => [row, ...prev]);
    return row;
  }, []);

  const removeHighlight = useCallback(async (id: string) => {
    await deleteHighlight(id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const updateHighlightNote = useCallback(
    async (id: string, note: string) => {
      const existing = highlights.find((h) => h.id === id);
      if (!existing) return;
      const next: BookHighlight = { ...existing, note };
      await saveHighlight(next);
      setHighlights((prev) => prev.map((h) => (h.id === id ? next : h)));
    },
    [highlights],
  );

  const addBookmark = useCallback(
    async (input: {
      bookId: string;
      chapterIndex: number;
      scrollRatio: number;
      label?: string;
    }): Promise<BookBookmark> => {
      const row: BookBookmark = {
        id: crypto.randomUUID(),
        bookId: input.bookId,
        chapterIndex: input.chapterIndex,
        scrollRatio: input.scrollRatio,
        label: input.label,
        createdAt: Date.now(),
      };
      await saveBookmark(row);
      setBookmarks((prev) => [row, ...prev]);
      return row;
    },
    [],
  );

  const removeBookmark = useCallback(async (id: string) => {
    await deleteBookmark(id);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  return {
    loaded,
    highlights,
    bookmarks,
    addHighlight,
    removeHighlight,
    updateHighlightNote,
    addBookmark,
    removeBookmark,
  };
}

/** Extract the colour packed into a highlight's locator. */
export function highlightColor(h: BookHighlight): HighlightColor {
  const m = /^color:(yellow|green|pink)$/.exec(h.locator ?? "");
  return (m?.[1] as HighlightColor | undefined) ?? "yellow";
}

/** Tailwind classes for the three supported highlight colours. */
export const HIGHLIGHT_CLASSES: Record<HighlightColor, string> = {
  yellow: "bg-yellow-300/40 dark:bg-yellow-400/30",
  green: "bg-green-300/40 dark:bg-green-400/30",
  pink: "bg-pink-300/40 dark:bg-pink-400/30",
};

export const HIGHLIGHT_SWATCHES: Record<HighlightColor, string> = {
  yellow: "bg-yellow-400",
  green: "bg-green-500",
  pink: "bg-pink-500",
};
