/**
 * Language-Learning Books — helpers.
 *
 * A "language book" is a regular Book whose `fileName` ends with `.langbook`.
 * Each chapter is a short AI-generated story that practices a list of target
 * items (words / phrases / idioms). The target items live INSIDE the chapter
 * HTML as a hidden JSON tag so the reader can re-render them as underlined
 * targets without an extra DB column.
 */
import { supabase } from "@/integrations/supabase/client";
import { appendChapter, saveChapter, chapterKey, getChapter } from "@/lib/bookDb";
import { useBookStore } from "@/store/bookStore";
import { generateGradientCover, pastedTextToChapter } from "@/lib/manualBook";
import type { Book, BookChapter } from "@/types";

export const LANG_BOOK_SUFFIX = ".langbook";

export function isLanguageBook(b: Pick<Book, "fileName">): boolean {
  return !!b.fileName && b.fileName.toLowerCase().endsWith(LANG_BOOK_SUFFIX);
}

/** Hidden marker we embed in chapter HTML to remember the target items. */
const TARGET_TAG_OPEN = "<!--LANG_TARGETS:";
const TARGET_TAG_CLOSE = ":END-->";

export function encodeTargetsInHtml(items: string[], html: string): string {
  if (!items.length) return html;
  // Strip any existing tag first so re-saves stay clean.
  const stripped = stripTargetsTag(html);
  const safe = JSON.stringify(items);
  return `${TARGET_TAG_OPEN}${encodeURIComponent(safe)}${TARGET_TAG_CLOSE}\n${stripped}`;
}

export function decodeTargetsFromHtml(html: string): string[] {
  if (!html) return [];
  const start = html.indexOf(TARGET_TAG_OPEN);
  if (start === -1) return [];
  const end = html.indexOf(TARGET_TAG_CLOSE, start);
  if (end === -1) return [];
  const raw = html.slice(start + TARGET_TAG_OPEN.length, end);
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (Array.isArray(parsed)) {
      return parsed.map((s) => String(s)).filter(Boolean);
    }
  } catch {
    /* noop */
  }
  return [];
}

export function stripTargetsTag(html: string): string {
  const start = html.indexOf(TARGET_TAG_OPEN);
  if (start === -1) return html;
  const end = html.indexOf(TARGET_TAG_CLOSE, start);
  if (end === -1) return html;
  return (html.slice(0, start) + html.slice(end + TARGET_TAG_CLOSE.length)).trimStart();
}

// ─────────────────────────── AI generation ──

export interface LanguageChapterAIResult {
  title: string;
  story: string;
  usedItems: string[];
  missingItems: string[];
  teachingNotes: string;
  targetWordCount: number;
  model: string;
}

export async function generateLanguageChapter(input: {
  items: string[];
  mode: "guided" | "auto";
  outline?: string;
  targetWordCount?: number;
}): Promise<LanguageChapterAIResult> {
  const { data, error } = await supabase.functions.invoke<LanguageChapterAIResult>(
    "generate-language-chapter",
    { body: input },
  );
  if (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
    const msg = (error as any)?.context?.error || (error as any)?.message || "AI request failed.";
    throw new Error(typeof msg === "string" ? msg : "AI request failed.");
  }
  if (!data) throw new Error("Empty AI response.");
  return data;
}

// ─────────────────────────── Book / Chapter helpers ──

export interface CreateLanguageBookInput {
  title: string;
  author?: string;
  language?: string;
  coverDataUrl?: string | null;
  /** Optional: create the first chapter inline. */
  firstChapter?: {
    title: string;
    items: string[];
    aiResult: LanguageChapterAIResult;
    /** Optional teaching notes the user typed themselves. */
    userNotes?: string;
  };
}

/** Build the chapter HTML for a language story (with embedded target tag). */
export function buildLanguageChapterHtml(
  story: string,
  items: string[],
  notes?: string,
): { html: string; text: string; wordCount: number } {
  const parsed = pastedTextToChapter(story);
  let html = parsed.html;
  if (notes && notes.trim()) {
    const safe = notes
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n+/g, "<br/>");
    html = `${html}\n<hr/>\n<blockquote>${safe}</blockquote>`;
  }
  html = encodeTargetsInHtml(items, html);
  return { html, text: parsed.text, wordCount: parsed.wordCount };
}

/** Create a brand-new language book (and optional first chapter). Returns the book id. */
export async function createLanguageBook(input: CreateLanguageBookInput): Promise<string> {
  const upsert = useBookStore.getState().upsert;
  const id = crypto.randomUUID();
  const cover = input.coverDataUrl ?? generateGradientCover(input.title, input.author);

  let chapterCount = 0;

  if (input.firstChapter) {
    const { items, aiResult, userNotes, title: chapTitle } = input.firstChapter;
    const built = buildLanguageChapterHtml(
      aiResult.story,
      items,
      [aiResult.teachingNotes, userNotes].filter(Boolean).join("\n\n"),
    );
    await appendChapter(id, {
      title: chapTitle.trim() || aiResult.title,
      html: built.html,
      text: built.text,
      wordCount: built.wordCount,
    });
    chapterCount = 1;
  }

  await upsert(
    {
      id,
      title: input.title.trim(),
      author: input.author?.trim() || undefined,
      language: input.language?.trim() || "en",
      fileName: `${input.title.trim()}${LANG_BOOK_SUFFIX}`,
      chapterCount,
      lastChapterIndex: 0,
      lastScrollRatio: 0,
      coverDataUrl: cover,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    { syncBlob: true },
  );

  return id;
}

/** Append a new language chapter to an existing language book. */
export async function appendLanguageChapter(
  book: Book,
  input: {
    title: string;
    items: string[];
    aiResult: LanguageChapterAIResult;
    userNotes?: string;
  },
): Promise<BookChapter> {
  const upsert = useBookStore.getState().upsert;
  const built = buildLanguageChapterHtml(
    input.aiResult.story,
    input.items,
    [input.aiResult.teachingNotes, input.userNotes].filter(Boolean).join("\n\n"),
  );
  const created = await appendChapter(book.id, {
    title: input.title.trim() || input.aiResult.title,
    html: built.html,
    text: built.text,
    wordCount: built.wordCount,
  });
  await upsert(
    {
      ...book,
      chapterCount: book.chapterCount + 1,
      updatedAt: Date.now(),
    },
    { syncBlob: true },
  );
  return created;
}

/** Re-save a language chapter (e.g. after editing the items list). */
export async function updateLanguageChapter(
  bookId: string,
  index: number,
  patch: { story?: string; items?: string[]; notes?: string; title?: string },
): Promise<void> {
  const existing = await getChapter(bookId, index);
  if (!existing) return;
  const text = (patch.story ?? existing.text).trim();
  const items = patch.items ?? decodeTargetsFromHtml(existing.html);
  const built = buildLanguageChapterHtml(text, items, patch.notes);
  const next: BookChapter = {
    ...existing,
    title: patch.title?.trim() || existing.title,
    html: built.html,
    text: built.text,
    wordCount: built.wordCount,
    id: chapterKey(bookId, index),
  };
  await saveChapter(next);
}

/** Tokenize user input (one item per line, OR commas) → trimmed unique list. */
export function parseItemsList(raw: string): string[] {
  const split = raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of split) {
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.slice(0, 60);
}
