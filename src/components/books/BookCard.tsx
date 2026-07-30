import { memo } from "react";
import { Link } from "react-router-dom";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AddChapterDialog } from "@/components/books/AddChapterDialog";
import { AddLanguageChapterDialog } from "@/components/books/AddLanguageChapterDialog";
import { generateGradientCover } from "@/lib/manualBook";
import { cn } from "@/lib/utils";
import type { Book } from "@/types";

interface Props {
  book: Book;
  badge?: "manual" | "ai";
  onDelete?: (id: string, title: string) => void | Promise<void>;
  allowAddChapter?: boolean;
  allowAddAiChapter?: boolean;
  emptyLabel?: string;
}

export const BookCard = memo(function BookCard({
  book,
  badge,
  onDelete,
  allowAddChapter,
  allowAddAiChapter,
  emptyLabel = "Empty — add a chapter",
}: Props) {
  const inProgress = book.lastChapterIndex > 0 || book.lastScrollRatio > 0.02;
  const progress = Math.max(
    0,
    Math.min(
      1,
      book.chapterCount > 0
        ? (book.lastChapterIndex + (book.lastScrollRatio ?? 0)) / Math.max(1, book.chapterCount)
        : 0,
    ),
  );
  const cover = book.coverDataUrl ?? generateGradientCover(book.title, book.author);

  return (
    <li className="group relative">
      <Link
        to={`/books/${book.id}`}
        aria-label={`Open ${book.title}`}
        className="block focus:outline-none"
      >
        <div className="relative">
          <div
            className={cn(
              "aspect-[2/3] rounded-md overflow-hidden bg-muted",
              "shadow-[0_10px_25px_-12px_hsl(var(--foreground)/0.35)]",
              "transition-all duration-300 ease-out",
              "group-hover:-translate-y-1 group-hover:shadow-[0_18px_35px_-12px_hsl(var(--foreground)/0.45)]",
              "group-focus-within:ring-2 group-focus-within:ring-ring",
            )}
            style={{
              backgroundImage: `url("${cover}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(90deg, hsl(0 0% 0% / 0.18) 0, transparent 6%), linear-gradient(180deg, transparent 70%, hsl(0 0% 0% / 0.25) 100%)",
              }}
            />
          </div>

          {inProgress && (
            <div className="absolute left-2 right-2 bottom-2 h-1 rounded-full bg-background/40 backdrop-blur overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          )}

          {badge === "manual" && (
            <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded bg-background/85 text-foreground/80 border border-border/60 backdrop-blur">
              Manual
            </span>
          )}
          {badge === "ai" && (
            <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded bg-primary/90 text-primary-foreground border border-primary/40 backdrop-blur flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5" />
              AI
            </span>
          )}
        </div>

        <div className="pt-3 px-0.5 space-y-0.5">
          <p className="font-semibold text-sm leading-tight line-clamp-2" title={book.title}>
            {book.title}
          </p>
          {book.author && (
            <p className="text-xs text-muted-foreground line-clamp-1" title={book.author}>
              {book.author}
            </p>
          )}
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 pt-0.5">
            {book.chapterCount > 0
              ? `${book.chapterCount} ch${inProgress ? ` · ${Math.round(progress * 100)}%` : ""}`
              : emptyLabel}
          </p>
        </div>
      </Link>

      {(onDelete || allowAddChapter || allowAddAiChapter) && (
        <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {allowAddAiChapter && (
            <AddLanguageChapterDialog
              book={book}
              existingChapterCount={book.chapterCount}
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Add AI chapter to ${book.title}`}
                  title="Add AI chapter"
                  className="h-8 w-8 bg-background/85 backdrop-blur border border-border/60 hover:bg-primary hover:text-primary-foreground"
                  onClick={(e) => e.preventDefault()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              }
            />
          )}
          {badge === "manual" && allowAddChapter && (
            <AddChapterDialog
              book={book}
              existingChapterCount={book.chapterCount}
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Add chapter to ${book.title}`}
                  title="Add chapter"
                  className="h-8 w-8 bg-background/85 backdrop-blur border border-border/60 hover:bg-primary hover:text-primary-foreground"
                  onClick={(e) => e.preventDefault()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              }
            />
          )}
          {onDelete && (
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${book.title}`}
                  title="Delete book"
                  className="h-8 w-8 bg-background/85 backdrop-blur border border-border/60 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={(e) => e.preventDefault()}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              }
              title={`Delete "${book.title}"?`}
              description="This removes the book, its chapters, highlights, and any cached AI analysis. This cannot be undone."
              confirmLabel="Delete"
              onConfirm={() => onDelete(book.id, book.title)}
            />
          )}
        </div>
      )}
    </li>
  );
});
