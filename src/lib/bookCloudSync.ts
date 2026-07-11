/**
 * Cloud sync for the book library.
 *
 * Uploads / downloads the user's books (metadata + parsed chapters + the
 * original EPUB blob) so the same library is available on every device the
 * user signs in to.
 *
 * Strategy:
 *  - The local IndexedDB row stays the source of truth on the current device.
 *  - The cloud row is keyed by `(user_id, client_id)` where `client_id` is the
 *    same UUID we use locally — this lets us merge instead of duplicating.
 *  - On sign-in we pull anything in the cloud that's missing locally; on
 *    upload (`upsertBook`) and progress changes we push to the cloud.
 *
 * Anonymous users keep working in pure offline mode — every cloud function
 * here returns silently when there is no `user_id`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Book, BookChapter } from "@/types";
import {
  getAllBooks,
  getBook,
  getBookBlob,
  getChaptersForBook,
  saveBook,
  saveBookBlob,
  saveChapters,
} from "@/lib/bookDb";

const BUCKET = "book-files";

// ─── helpers ───────────────────────────────────────────────────────────

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function storagePathFor(userId: string, clientId: string): string {
  return `${userId}/${clientId}.epub`;
}

interface CloudBookRow {
  id: string;
  user_id: string;
  client_id: string;
  title: string;
  author: string | null;
  language: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  chapter_count: number;
  word_count: number;
  last_chapter_index: number;
  last_scroll_ratio: number;
  total_read_seconds: number;
  cover_url: string | null;
  storage_path: string | null;
  created_at: string;
  updated_at: string;
}

interface CloudChapterRow {
  id: string;
  book_id: string;
  user_id: string;
  chapter_index: number;
  title: string | null;
  html: string;
  text: string;
  word_count: number;
}

function cloudRowToBook(row: CloudBookRow): Book {
  return {
    id: row.client_id,
    title: row.title,
    author: row.author ?? undefined,
    language: row.language ?? undefined,
    fileName: row.file_name ?? "",
    chapterCount: row.chapter_count,
    lastChapterIndex: row.last_chapter_index,
    lastScrollRatio: row.last_scroll_ratio,
    coverDataUrl: row.cover_url ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function cloudRowToChapter(row: CloudChapterRow, clientBookId: string): BookChapter {
  return {
    id: `${clientBookId}:${row.chapter_index}`,
    bookId: clientBookId,
    index: row.chapter_index,
    title: row.title ?? "",
    html: row.html,
    text: row.text,
    wordCount: row.word_count,
  };
}

// ─── upload ────────────────────────────────────────────────────────────

/**
 * Push a single book + its chapters + the EPUB blob to the cloud.
 * Idempotent: if the row already exists it's updated; the blob is only
 * uploaded the first time (or when forced via `forceBlob`).
 */
export async function uploadBookToCloud(
  book: Book,
  options: { forceBlob?: boolean } = {},
): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return; // not signed in → noop.

  // 1. Upsert metadata row (returns the cloud UUID needed for chapters).
  const path = storagePathFor(userId, book.id);
  const { data: meta, error: metaErr } = await supabase
    .from("books")
    .upsert(
      {
        user_id: userId,
        client_id: book.id,
        title: book.title,
        author: book.author ?? null,
        language: book.language ?? null,
        file_name: book.fileName ?? null,
        chapter_count: book.chapterCount,
        last_chapter_index: book.lastChapterIndex,
        last_scroll_ratio: book.lastScrollRatio,
        cover_url: book.coverDataUrl ?? null,
        storage_path: path,
      },
      { onConflict: "user_id,client_id" },
    )
    .select("id, storage_path")
    .single();

  if (metaErr || !meta) {
    console.warn("[bookCloudSync] upsert metadata failed", metaErr);
    return;
  }

  // 2. Upload chapters (one transaction-ish pass).
  try {
    const chapters = await getChaptersForBook(book.id);
    if (chapters.length) {
      const rows = chapters.map((c) => ({
        book_id: meta.id,
        user_id: userId,
        chapter_index: c.index,
        title: c.title,
        html: c.html,
        text: c.text,
        word_count: c.wordCount,
      }));
      const { error: chErr } = await supabase
        .from("book_chapters")
        .upsert(rows, { onConflict: "book_id,chapter_index" });
      if (chErr) console.warn("[bookCloudSync] upsert chapters failed", chErr);
    }
  } catch (e) {
    console.warn("[bookCloudSync] chapters error", e);
  }

  // 3. Upload the original EPUB blob (only if not already uploaded).
  try {
    let needsUpload = options.forceBlob ?? false;
    if (!needsUpload) {
      const { data: existing } = await supabase.storage
        .from(BUCKET)
        .list(userId, { search: `${book.id}.epub`, limit: 1 });
      needsUpload = !existing || existing.length === 0;
    }
    if (needsUpload) {
      const blob = await getBookBlob(book.id);
      if (blob) {
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
          contentType: "application/epub+zip",
          upsert: true,
        });
        if (upErr) console.warn("[bookCloudSync] upload blob failed", upErr);
      }
    }
  } catch (e) {
    console.warn("[bookCloudSync] blob sync error", e);
  }
}

/** Push only the lightweight progress (chapter index + scroll ratio). */
export async function pushBookProgress(book: Book): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const { error } = await supabase
    .from("books")
    .update({
      last_chapter_index: book.lastChapterIndex,
      last_scroll_ratio: book.lastScrollRatio,
    })
    .eq("user_id", userId)
    .eq("client_id", book.id);
  if (error) console.warn("[bookCloudSync] push progress failed", error);
}

// ─── pull ──────────────────────────────────────────────────────────────

/**
 * Pull every book the current user has in the cloud and merge it into the
 * local IndexedDB. Books we already have locally only get progress updated
 * (cloud wins when its updated_at is newer); brand-new books are downloaded
 * in full (metadata + chapters + EPUB blob).
 *
 * Returns the number of new or updated books pulled.
 */
export async function pullBooksFromCloud(): Promise<number> {
  const userId = await currentUserId();
  if (!userId) return 0;

  const { data: cloudBooks, error } = await supabase
    .from("books")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error || !cloudBooks) {
    console.warn("[bookCloudSync] list books failed", error);
    return 0;
  }

  const localBooks = await getAllBooks();
  const localById = new Map(localBooks.map((b) => [b.id, b]));

  let touched = 0;

  for (const row of cloudBooks as CloudBookRow[]) {
    const remote = cloudRowToBook(row);
    const local = localById.get(remote.id);

    if (!local) {
      // Brand new on this device — pull chapters + blob.
      await pullSingleBook(row);
      touched += 1;
      continue;
    }

    // Already exists locally — keep newer progress.
    const cloudUpdated = new Date(row.updated_at).getTime();
    if (cloudUpdated > local.updatedAt) {
      const merged: Book = {
        ...local,
        title: remote.title,
        author: remote.author,
        language: remote.language,
        chapterCount: remote.chapterCount,
        lastChapterIndex: remote.lastChapterIndex,
        lastScrollRatio: remote.lastScrollRatio,
        coverDataUrl: remote.coverDataUrl ?? local.coverDataUrl,
        updatedAt: cloudUpdated,
      };
      await saveBook(merged);
      touched += 1;
    }
  }

  return touched;
}

async function pullSingleBook(row: CloudBookRow): Promise<void> {
  const remote = cloudRowToBook(row);

  // Metadata first so the book appears in the library immediately.
  await saveBook(remote);

  // Chapters.
  try {
    const { data: chRows, error: chErr } = await supabase
      .from("book_chapters")
      .select("*")
      .eq("book_id", row.id)
      .order("chapter_index", { ascending: true });
    if (!chErr && chRows) {
      const chapters = (chRows as CloudChapterRow[]).map((c) => cloudRowToChapter(c, remote.id));
      if (chapters.length) await saveChapters(chapters);
    }
  } catch (e) {
    console.warn("[bookCloudSync] pull chapters failed", e);
  }

  // EPUB blob — best-effort, non-blocking.
  if (row.storage_path) {
    try {
      const { data: blob, error: dlErr } = await supabase.storage
        .from(BUCKET)
        .download(row.storage_path);
      if (!dlErr && blob) {
        await saveBookBlob(remote.id, blob);
      }
    } catch (e) {
      console.warn("[bookCloudSync] pull blob failed", e);
    }
  }
}

// ─── delete ────────────────────────────────────────────────────────────

export async function deleteBookFromCloud(clientId: string): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;

  // Find row first to get storage_path.
  const { data: row } = await supabase
    .from("books")
    .select("id, storage_path")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!row) return;

  if (row.storage_path) {
    await supabase.storage
      .from(BUCKET)
      .remove([row.storage_path])
      .catch(() => null);
  }
  await supabase.from("books").delete().eq("id", row.id);
  // book_chapters cascade via FK.
}

// ─── one-shot full sync (called from auth listener / on demand) ───────

/**
 * Pulls anything missing from the cloud, then pushes anything new from the
 * local library. Safe to call repeatedly — it is idempotent.
 */
export async function syncBooksWithCloud(): Promise<{
  pulled: number;
  pushed: number;
}> {
  const userId = await currentUserId();
  if (!userId) return { pulled: 0, pushed: 0 };

  const pulled = await pullBooksFromCloud();

  // After pulling, push any local books that don't have a matching cloud row.
  const { data: cloudBooks } = await supabase
    .from("books")
    .select("client_id")
    .eq("user_id", userId);
  const cloudIds = new Set((cloudBooks ?? []).map((r) => r.client_id));

  const localBooks = await getAllBooks();
  let pushed = 0;
  for (const b of localBooks) {
    if (!cloudIds.has(b.id)) {
      await uploadBookToCloud(b);
      pushed += 1;
    }
  }

  return { pulled, pushed };
}
