/**
 * Full-text search across all chapters of the open book.
 *
 * Implementation notes:
 *  - Searches the plain `chapter.text` (already pre-extracted at import time),
 *    so it's instant for books up to a few MB.
 *  - Splits each chapter into sentences and returns a snippet around the
 *    matched term with the term highlighted via <mark>.
 *  - Debounced (180ms) to keep the keystroke-to-result loop responsive even
 *    on large books.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X, ArrowRight } from "lucide-react";
import type { BookChapter } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  chapters: BookChapter[];
  currentChapterIndex: number;
  onJump: (chapterIndex: number) => void;
}

interface Hit {
  chapterIndex: number;
  chapterTitle: string;
  /** Snippet with the term wrapped in <mark> tags. */
  snippetHtml: string;
  /** Total occurrences in the chapter (informational). */
  count: number;
}

/** Escape user input for use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Escape text before injecting into innerHTML. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Build a <mark>-decorated snippet around the first match. */
function buildSnippet(text: string, term: string, contextChars = 60): string {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return escapeHtml(text.slice(0, contextChars * 2));
  const start = Math.max(0, idx - contextChars);
  const end = Math.min(text.length, idx + term.length + contextChars);
  const head = start > 0 ? "… " : "";
  const tail = end < text.length ? " …" : "";
  const slice = text.slice(start, end);
  // Highlight every occurrence within the snippet.
  const re = new RegExp(escapeRegExp(term), "gi");
  const html = escapeHtml(slice).replace(re, (m) => `<mark>${m}</mark>`);
  return `${head}${html}${tail}`;
}

function searchBook(chapters: BookChapter[], rawQuery: string, limit = 80): Hit[] {
  const query = rawQuery.trim();
  if (query.length < 2) return [];
  const re = new RegExp(escapeRegExp(query), "gi");
  const hits: Hit[] = [];
  for (const ch of chapters) {
    if (hits.length >= limit) break;
    const text = ch.text || "";
    if (!text) continue;
    const matches = text.match(re);
    if (!matches) continue;
    hits.push({
      chapterIndex: ch.index,
      chapterTitle: ch.title || `Chapter ${ch.index + 1}`,
      snippetHtml: buildSnippet(text, query),
      count: matches.length,
    });
  }
  return hits;
}

export const BookSearchSheet = memo(function BookSearchSheet({
  chapters,
  currentChapterIndex,
  onJump,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce query → debounced
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query), 180);
    return () => window.clearTimeout(id);
  }, [query]);

  // Auto-focus the input when the sheet opens.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open]);

  const hits = useMemo(() => searchBook(chapters, debounced), [chapters, debounced]);
  const totalOccurrences = useMemo(() => hits.reduce((sum, h) => sum + h.count, 0), [hits]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search inside book"
          title="Search inside book"
        >
          <Search className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle>Search this book</SheetTitle>
        </SheetHeader>

        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a word or phrase…"
              className="pl-9 pr-9"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label="Clear"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {debounced.length >= 2 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {hits.length === 0
                ? "No matches."
                : `${hits.length} chapter${hits.length === 1 ? "" : "s"} · ${totalOccurrences} occurrence${totalOccurrences === 1 ? "" : "s"}`}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {debounced.length < 2 ? (
            <p className="text-center text-xs text-muted-foreground py-12">
              Enter at least 2 characters to search.
            </p>
          ) : (
            hits.map((h) => (
              <button
                key={h.chapterIndex}
                type="button"
                onClick={() => {
                  onJump(h.chapterIndex);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left rounded-lg border border-border bg-card hover:bg-accent/40 transition px-3 py-2.5",
                  h.chapterIndex === currentChapterIndex && "ring-1 ring-primary/40",
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-medium truncate flex-1 min-w-0">{h.chapterTitle}</p>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{h.count}×</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                </div>
                <p
                  className="text-xs text-muted-foreground leading-relaxed [&>mark]:bg-primary/30 [&>mark]:text-foreground [&>mark]:rounded [&>mark]:px-0.5"
                  dangerouslySetInnerHTML={{ __html: h.snippetHtml }}
                />
              </button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
});
