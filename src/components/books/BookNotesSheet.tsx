/**
 * Side sheet listing this book's highlights & bookmarks.
 *
 * Each row jumps to its chapter (and roughly its scroll position for bookmarks).
 * Notes can be edited inline; entries can be deleted.
 */
import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bookmark, BookmarkX, StickyNote, Trash2, Pencil, Check, ArrowRight } from "lucide-react";
import type { BookHighlight, BookBookmark, BookChapter } from "@/types";
import { HIGHLIGHT_CLASSES, HIGHLIGHT_SWATCHES, highlightColor } from "@/hooks/useBookAnnotations";
import { cn } from "@/lib/utils";

interface Props {
  highlights: BookHighlight[];
  bookmarks: BookBookmark[];
  chapters: BookChapter[];
  currentChapterIndex: number;
  onJump: (chapterIndex: number, scrollRatio?: number) => void;
  onDeleteHighlight: (id: string) => void;
  onUpdateHighlightNote: (id: string, note: string) => void;
  onDeleteBookmark: (id: string) => void;
}

export function BookNotesSheet({
  highlights,
  bookmarks,
  chapters,
  currentChapterIndex,
  onJump,
  onDeleteHighlight,
  onUpdateHighlightNote,
  onDeleteBookmark,
}: Props) {
  const [open, setOpen] = useState(false);
  const total = highlights.length + bookmarks.length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notes & bookmarks"
          title="Notes & bookmarks"
          className="relative"
        >
          <StickyNote className="h-5 w-5" />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle>Notes & Bookmarks</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="highlights" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-5 mt-3 grid grid-cols-2">
            <TabsTrigger value="highlights">Highlights ({highlights.length})</TabsTrigger>
            <TabsTrigger value="bookmarks">Bookmarks ({bookmarks.length})</TabsTrigger>
          </TabsList>

          <TabsContent
            value="highlights"
            className="flex-1 overflow-y-auto px-5 py-4 space-y-3 mt-0"
          >
            {highlights.length === 0 ? (
              <EmptyHint
                icon={<StickyNote className="h-8 w-8 text-muted-foreground/60" />}
                title="No highlights yet"
                hint="Select any text in the reader to highlight it."
              />
            ) : (
              highlights.map((h) => (
                <HighlightRow
                  key={h.id}
                  highlight={h}
                  chapterTitle={chapters[h.chapterIndex]?.title ?? `Chapter ${h.chapterIndex + 1}`}
                  isCurrent={h.chapterIndex === currentChapterIndex}
                  onJump={() => {
                    onJump(h.chapterIndex);
                    setOpen(false);
                  }}
                  onDelete={() => onDeleteHighlight(h.id)}
                  onUpdateNote={(n) => onUpdateHighlightNote(h.id, n)}
                />
              ))
            )}
          </TabsContent>

          <TabsContent
            value="bookmarks"
            className="flex-1 overflow-y-auto px-5 py-4 space-y-2 mt-0"
          >
            {bookmarks.length === 0 ? (
              <EmptyHint
                icon={<Bookmark className="h-8 w-8 text-muted-foreground/60" />}
                title="No bookmarks yet"
                hint="Use the bookmark icon in the reader header to save your spot."
              />
            ) : (
              bookmarks.map((b) => (
                <BookmarkRow
                  key={b.id}
                  bookmark={b}
                  chapterTitle={chapters[b.chapterIndex]?.title ?? `Chapter ${b.chapterIndex + 1}`}
                  isCurrent={b.chapterIndex === currentChapterIndex}
                  onJump={() => {
                    onJump(b.chapterIndex, b.scrollRatio);
                    setOpen(false);
                  }}
                  onDelete={() => onDeleteBookmark(b.id)}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

/* ─────────────────────────────────────────── rows ── */

function HighlightRow({
  highlight,
  chapterTitle,
  isCurrent,
  onJump,
  onDelete,
  onUpdateNote,
}: {
  highlight: BookHighlight;
  chapterTitle: string;
  isCurrent: boolean;
  onJump: () => void;
  onDelete: () => void;
  onUpdateNote: (n: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(highlight.note ?? "");
  const color = highlightColor(highlight);

  const save = () => {
    const next = draft.trim();
    if (next !== (highlight.note ?? "")) onUpdateNote(next);
    setEditing(false);
  };

  return (
    <article className="rounded-lg border border-border bg-card overflow-hidden">
      <div className={cn("px-3 py-2 text-sm", HIGHLIGHT_CLASSES[color])}>“{highlight.text}”</div>
      <div className="px-3 py-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onJump}
            className="text-xs text-muted-foreground hover:text-primary truncate text-left flex-1 min-w-0 flex items-center gap-1.5"
            title={`Jump to ${chapterTitle}`}
          >
            <span className={cn("h-2 w-2 rounded-full shrink-0", HIGHLIGHT_SWATCHES[color])} />
            <span className="truncate">{chapterTitle}</span>
            {isCurrent && (
              <span className="text-[10px] uppercase tracking-wider text-primary/70">here</span>
            )}
            <ArrowRight className="h-3 w-3 shrink-0" />
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => (editing ? save() : setEditing(true))}
            aria-label={editing ? "Save note" : "Edit note"}
          >
            {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
            aria-label="Delete highlight"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {editing ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a personal note…"
            className="min-h-[64px] text-sm"
            autoFocus
            onBlur={save}
          />
        ) : highlight.note ? (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {highlight.note}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function BookmarkRow({
  bookmark,
  chapterTitle,
  isCurrent,
  onJump,
  onDelete,
}: {
  bookmark: BookBookmark;
  chapterTitle: string;
  isCurrent: boolean;
  onJump: () => void;
  onDelete: () => void;
}) {
  const date = useMemo(() => {
    const d = new Date(bookmark.createdAt);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [bookmark.createdAt]);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
      <button
        type="button"
        onClick={onJump}
        className="flex-1 min-w-0 text-left flex items-center gap-2"
      >
        <Bookmark className="h-4 w-4 text-primary shrink-0" />
        <div className="min-w-0">
          <p className="text-sm truncate">{bookmark.label || chapterTitle}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {chapterTitle} · {Math.round(bookmark.scrollRatio * 100)}% · {date}
            {isCurrent && " · here"}
          </p>
        </div>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive hover:text-destructive"
        onClick={onDelete}
        aria-label="Delete bookmark"
      >
        <BookmarkX className="h-4 w-4" />
      </Button>
    </div>
  );
}

function EmptyHint({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="text-center py-12 space-y-2">
      <div className="flex justify-center">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground max-w-[240px] mx-auto">{hint}</p>
    </div>
  );
}
