/**
 * Auto-resolve a Leitner folder for a card based on which app section
 * it came from. Ensures a top-level folder per source, and (for books) a
 * sub-folder per individual book/article so the user's deck stays tidy.
 *
 * Returns the leaf folderId (or undefined if the store/folder lookup fails).
 */
import { useLeitnerFolderStore } from "@/store/leitnerFolderStore";
import type { LeitnerSourceKind } from "@/types";

interface AutoFolderInput {
  kind: LeitnerSourceKind;
  /** Stable identifier of the source (videoId/bookId/articleId/etc). */
  sourceRef?: string;
  /** Human-readable title (book title, article title, podcast name…). */
  sourceTitle?: string;
}

/** Top-level folder name for each source kind. */
const PARENT_NAMES: Record<LeitnerSourceKind, string> = {
  video: "Movies & Subtitles",
  audio: "Podcasts",
  book: "Books",
  language_book: "Language Books",
  news: "News",
  manual: "Manual",
};

/** Kinds that get a child folder per individual source item. */
const SUBFOLDER_KINDS: ReadonlySet<LeitnerSourceKind> = new Set(["book", "language_book"]);

export async function ensureAutoFolder(input: AutoFolderInput): Promise<string | undefined> {
  try {
    const store = useLeitnerFolderStore.getState();
    if (!store.loaded) await store.load();

    const parentName = PARENT_NAMES[input.kind] ?? "Custom";
    // Parent folder is keyed by `kind` + a sentinel sourceRef so it's unique.
    const PARENT_REF = "__auto_parent__";
    const parent = await store.ensureFolder({
      name: parentName,
      kind: input.kind,
      sourceRef: PARENT_REF,
    });

    if (!SUBFOLDER_KINDS.has(input.kind) || !input.sourceTitle?.trim()) {
      return parent.id;
    }

    // Sub-folder per book/article.
    const child = await store.ensureFolder({
      name: input.sourceTitle.trim().slice(0, 80),
      kind: input.kind,
      sourceRef: input.sourceRef || input.sourceTitle.trim(),
      parentId: parent.id,
    });
    return child.id;
  } catch (e) {
    console.warn("[leitnerAutoFolder] failed", e);
    return undefined;
  }
}
