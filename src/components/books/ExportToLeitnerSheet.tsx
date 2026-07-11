/**
 * Export analyzed vocabulary from a book to the Leitner deck.
 *
 * Pulls every cached `BookParagraphAnalysis` for the book, dedupes vocabulary
 * by normalized word, and lets the user pick which words to import. The
 * paragraph the word came from is used as the example sentence on the back.
 *
 * Notes:
 *  - Existing Leitner cards (matched by normalized front) are skipped on
 *    import — the leitner store already enforces this, but we surface the
 *    duplicate-state in the UI so users see what's already in their deck.
 */
import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Layers, BookOpen, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { getBookDb } from "@/lib/bookDb";
import { useLeitnerStore } from "@/store/leitnerStore";
import { normalizeFront } from "@/lib/leitner";
import type { BookChapter, BookParagraphAnalysis, VocabItem } from "@/types";

interface Props {
  bookId: string;
  bookTitle: string;
  chapters: BookChapter[];
}

interface Candidate {
  /** Normalized key (lowercase, trimmed). */
  key: string;
  word: string;
  translation: string;
  partOfSpeech?: string;
  /** Best example: prefer AI's own example, fall back to source paragraph. */
  example: string;
  chapterIndex: number;
  chapterTitle: string;
  /** True when a Leitner card with this front already exists. */
  alreadyInDeck: boolean;
}

async function loadAllAnalyses(bookId: string): Promise<BookParagraphAnalysis[]> {
  const db = await getBookDb();
  return db.getAllFromIndex("bookParagraphAnalyses", "bookId", bookId);
}

export function ExportToLeitnerSheet({ bookId, bookTitle, chapters }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const cards = useLeitnerStore((s) => s.cards);
  const loadCards = useLeitnerStore((s) => s.load);
  const addCard = useLeitnerStore((s) => s.addCard);

  // Build candidate list whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (!useLeitnerStore.getState().loaded) {
          await loadCards();
        }
        const analyses = await loadAllAnalyses(bookId);
        const titleByIdx = new Map(chapters.map((c) => [c.index, c.title]));
        const dedup = new Map<string, Candidate>();
        const existingKeys = new Set(
          useLeitnerStore.getState().cards.map((c) => normalizeFront(c.front)),
        );
        for (const a of analyses) {
          const sourceTitle = titleByIdx.get(a.chapterIndex) ?? `Chapter ${a.chapterIndex + 1}`;
          for (const v of a.vocabulary as VocabItem[]) {
            if (!v?.word || !v?.translation) continue;
            const key = normalizeFront(v.word);
            if (!key || dedup.has(key)) continue;
            dedup.set(key, {
              key,
              word: v.word.trim(),
              translation: v.translation.trim(),
              partOfSpeech: v.partOfSpeech,
              example: (v.example?.trim() || "").slice(0, 240),
              chapterIndex: a.chapterIndex,
              chapterTitle: sourceTitle,
              alreadyInDeck: existingKeys.has(key),
            });
          }
        }
        const list = Array.from(dedup.values()).sort((a, b) => a.word.localeCompare(b.word));
        if (cancelled) return;
        setCandidates(list);
        // Pre-select everything that's not already in the deck.
        setSelected(new Set(list.filter((c) => !c.alreadyInDeck).map((c) => c.key)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, bookId, chapters, loadCards]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) => c.word.toLowerCase().includes(q) || c.translation.toLowerCase().includes(q),
    );
  }, [candidates, filter]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of filtered) if (!c.alreadyInDeck) next.add(c.key);
      return next;
    });
  };

  const clearAll = () => setSelected(new Set());

  const handleImport = async () => {
    const picks = candidates.filter((c) => selected.has(c.key) && !c.alreadyInDeck);
    if (picks.length === 0) {
      toast.info("Nothing new to import.");
      return;
    }
    setImporting(true);
    let added = 0;
    let dup = 0;
    try {
      for (const c of picks) {
        const back = [
          c.translation,
          c.partOfSpeech ? `(${c.partOfSpeech})` : "",
          c.example ? `\n\n📖 ${c.example}` : "",
          `\n— ${bookTitle} · ${c.chapterTitle}`,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();
        const result = await addCard(c.word, back, bookId);
        if (result === "added") added += 1;
        else dup += 1;
      }
      toast.success(
        `Imported ${added} card${added === 1 ? "" : "s"}` +
          (dup > 0 ? ` · skipped ${dup} duplicate${dup === 1 ? "" : "s"}.` : "."),
      );
      setOpen(false);
    } finally {
      setImporting(false);
    }
  };

  // Re-flag duplicates in real time as cards mutate.
  useEffect(() => {
    const existingKeys = new Set(cards.map((c) => normalizeFront(c.front)));
    setCandidates((prev) => prev.map((c) => ({ ...c, alreadyInDeck: existingKeys.has(c.key) })));
  }, [cards]);

  const newSelectableCount = filtered.filter((c) => selected.has(c.key) && !c.alreadyInDeck).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Export words to Leitner"
          title="Export analyzed words to Leitner"
        >
          <Layers className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle>Export to Leitner</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Vocabulary from analyzed paragraphs in this book.
          </p>
        </SheetHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : candidates.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
            <BookOpen className="h-10 w-10 text-muted-foreground/60" />
            <p className="text-sm font-medium">No analyzed vocabulary yet.</p>
            <p className="text-xs text-muted-foreground max-w-[260px]">
              Analyze some paragraphs (✨) — or run "Batch Analyze Chapter" — and their vocabulary
              will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="px-5 pt-3 pb-2 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter words…"
                  className="pl-9"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {selected.size} selected · {candidates.length} total ·{" "}
                  {candidates.filter((c) => c.alreadyInDeck).length} already in deck
                </span>
                <div className="flex gap-1">
                  <button type="button" className="hover:text-primary" onClick={selectAllVisible}>
                    Select all
                  </button>
                  <span aria-hidden>·</span>
                  <button type="button" className="hover:text-primary" onClick={clearAll}>
                    Clear
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-2 space-y-1.5">
              {filtered.map((c) => {
                const isSel = selected.has(c.key);
                return (
                  <label
                    key={c.key}
                    className={`flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2 cursor-pointer transition ${
                      c.alreadyInDeck ? "opacity-60" : "hover:bg-accent/40"
                    }`}
                  >
                    <Checkbox
                      checked={isSel}
                      disabled={c.alreadyInDeck}
                      onCheckedChange={() => toggle(c.key)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-medium text-sm">{c.word}</span>
                        {c.partOfSpeech && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {c.partOfSpeech}
                          </span>
                        )}
                        {c.alreadyInDeck && (
                          <span className="text-[10px] uppercase tracking-wide text-primary/70">
                            in deck
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground" dir="rtl">
                        {c.translation}
                      </p>
                      {c.example && (
                        <p className="text-[11px] text-muted-foreground/80 mt-1 italic line-clamp-2">
                          “{c.example}”
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground/60 mt-1 truncate">
                        {c.chapterTitle}
                      </p>
                    </div>
                  </label>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">
                  No words match your filter.
                </p>
              )}
            </div>

            <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {newSelectableCount} new card{newSelectableCount === 1 ? "" : "s"}
              </p>
              <Button onClick={handleImport} disabled={importing || newSelectableCount === 0}>
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>Import to Leitner</>
                )}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
