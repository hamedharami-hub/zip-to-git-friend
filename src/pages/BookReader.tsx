import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useBookStore } from "@/store/bookStore";
import { EmptyState } from "@/components/EmptyState";
import { InteractiveBookText } from "@/components/books/InteractiveBookText";
import { ChapterTOC } from "@/components/books/ChapterTOC";
import {
  ReaderSettings,
  type ReaderFontFamily,
  FAMILY_FONT_STACKS,
} from "@/components/books/ReaderSettings";
import { BatchAnalyzeChapterButton } from "@/components/books/BatchAnalyzeChapterButton";
import { TranslateChapterButton } from "@/components/books/TranslateChapterButton";
import type { DisplayLang } from "@/components/books/InteractiveBookText";
import { ChapterTTSPlayer } from "@/components/books/ChapterTTSPlayer";
import { ReaderTTSQuickSettings } from "@/components/books/ReaderTTSQuickSettings";
import { ChapterRewriteTabs } from "@/components/books/ChapterRewriteTabs";
import { BookNotesSheet } from "@/components/books/BookNotesSheet";
import { ReaderSelectionToolbar } from "@/components/books/ReaderSelectionToolbar";
import { BookSearchSheet } from "@/components/books/BookSearchSheet";
import { ExportToLeitnerSheet } from "@/components/books/ExportToLeitnerSheet";
import { AddChapterDialog } from "@/components/books/AddChapterDialog";
import { useBookAnnotations } from "@/hooks/useBookAnnotations";
import { addReadingTime, getRewritesForChapter } from "@/lib/bookDb";
import { emitChapterAnalyses } from "@/lib/chapterAnalysisBus";
import { decodeTargetsFromHtml, isLanguageBook } from "@/lib/languageBook";
import { AddLanguageChapterDialog } from "@/components/books/AddLanguageChapterDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { extractAnalysableParagraphs } from "@/lib/batchAnalyzeChapter";
import { getCachedParagraphAnalysis } from "@/lib/bookAnalysis";
import { ReadingModeControls } from "@/components/reader/ReadingModeControls";

const SCROLL_SAVE_DEBOUNCE = 600;
/** Read-time accrual: ping every 15 s while the tab is visible & scrolled. */
const READ_PING_MS = 15_000;

const FAMILY_KEY = "llvp-reader-family";
const SCALE_KEY = "llvp-reader-scale";
const LINE_HEIGHT_KEY = "llvp-reader-line-height";

function loadLocalString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function loadLocalNumber(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    const n = v == null ? NaN : parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

const BookReader = () => {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const currentBook = useBookStore((s) => s.currentBook);
  const currentChapters = useBookStore((s) => s.currentChapters);
  const openBook = useBookStore((s) => s.openBook);
  const closeBook = useBookStore((s) => s.closeBook);
  const upsert = useBookStore((s) => s.upsert);
  usePageMeta({
    title: currentBook?.title ? `${currentBook.title} — کتاب` : "خواندن کتاب — Lingua",
    description: currentBook?.title
      ? `مطالعه‌ی «${currentBook.title}» با ترجمه، تحلیل و خواندن صوتی هوش مصنوعی.`
      : "خواندن تعاملی کتاب با ترجمه و TTS.",
    ogType: "book",
    image: currentBook?.coverDataUrl || undefined,
  });

  const [chapterIndex, setChapterIndex] = useState(0);
  const [fontScale, setFontScale] = useState<number>(() => loadLocalNumber(SCALE_KEY, 1));
  const [lineHeight, setLineHeight] = useState<number>(() => loadLocalNumber(LINE_HEIGHT_KEY, 1.6));
  const [family, setFamily] = useState<ReaderFontFamily>(
    () => loadLocalString(FAMILY_KEY, "serif") as ReaderFontFamily,
  );
  /** Whether the reader currently shows the original chapter or the AI rewrite. */
  const [chapterView, setChapterView] = useState<"original" | "rewrite">("original");
  /** True once any rewrite exists for the current chapter — controls the sticky toggle. */
  const [hasRewrite, setHasRewrite] = useState(false);
  /** EN / FA / EN+FA display mode for the original chapter. */
  const [displayLang, setDisplayLang] = useState<DisplayLang>("en");
  /** Number of paragraphs that have a Persian translation cached. */
  const [translationCount, setTranslationCount] = useState(0);
  const [faTtsText, setFaTtsText] = useState("");

  const scrollerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  /** Initial restore must run after chapter HTML mounts; track per chapter. */
  const restoredChapterRef = useRef<number | null>(null);

  // Highlights & bookmarks for the open book.
  const {
    highlights,
    bookmarks,
    addHighlight,
    removeHighlight,
    updateHighlightNote,
    addBookmark,
    removeBookmark,
  } = useBookAnnotations(bookId ?? null);

  const chapterHighlights = useMemo(
    () => highlights.filter((h) => h.chapterIndex === chapterIndex),
    [highlights, chapterIndex],
  );

  const isBookmarkedHere = useMemo(
    () => bookmarks.some((b) => b.chapterIndex === chapterIndex),
    [bookmarks, chapterIndex],
  );

  // ─── Mount / unmount: open book + clean up ──
  useEffect(() => {
    if (!bookId) return;
    openBook(bookId).then((book) => {
      if (book)
        setChapterIndex(Math.max(0, Math.min(book.lastChapterIndex, book.chapterCount - 1)));
    });
    return () => closeBook();
  }, [bookId, openBook, closeBook]);

  // ─── Title ──
  const chapter = currentChapters[chapterIndex];
  useEffect(() => {
    document.title = currentBook
      ? `${chapter?.title ? `${chapter.title} · ` : ""}${currentBook.title} — Reader`
      : "Book Reader";
  }, [currentBook, chapter]);

  // Reset toggle state whenever chapter changes (re-fetched from rewrites).
  useEffect(() => {
    setChapterView("original");
    setHasRewrite(false);
    setDisplayLang("en");
    setTranslationCount(0);
    setFaTtsText("");
  }, [chapterIndex, bookId]);

  useEffect(() => {
    if (!chapter) return;
    let cancelled = false;
    void (async () => {
      const items = extractAnalysableParagraphs(chapter);
      const out: string[] = [];
      for (const it of items) {
        const cached = await getCachedParagraphAnalysis(currentBook!.id, chapterIndex, it.text);
        const fa = cached?.translation?.trim();
        if (fa) out.push(fa);
      }
      if (!cancelled) setFaTtsText(out.join("\n\n"));
    })();
    return () => {
      cancelled = true;
    };
  }, [chapter, currentBook?.id, chapterIndex, translationCount]);

  // ─── Persist font preferences locally ──
  useEffect(() => {
    try {
      localStorage.setItem(FAMILY_KEY, family);
    } catch {
      /* noop */
    }
  }, [family]);
  useEffect(() => {
    try {
      localStorage.setItem(SCALE_KEY, String(fontScale));
    } catch {
      /* noop */
    }
  }, [fontScale]);
  useEffect(() => {
    try {
      localStorage.setItem(LINE_HEIGHT_KEY, String(lineHeight));
    } catch {
      /* noop */
    }
  }, [lineHeight]);

  // ─── Restore scroll position when chapter mounts ──
  useEffect(() => {
    if (!currentBook || !chapter) return;
    if (restoredChapterRef.current === chapterIndex) return;
    const el = scrollerRef.current;
    if (!el) return;
    // Wait one frame so the article has measured height.
    const id = requestAnimationFrame(() => {
      const ratio = chapterIndex === currentBook.lastChapterIndex ? currentBook.lastScrollRatio : 0;
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTop = Math.max(0, Math.min(1, ratio)) * max;
      restoredChapterRef.current = chapterIndex;
    });
    return () => cancelAnimationFrame(id);
  }, [currentBook, chapter, chapterIndex]);

  // ─── Save scroll position (debounced) + visible progress ──
  const [scrollRatio, setScrollRatio] = useState(0);
  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || !currentBook) return;
    const max = el.scrollHeight - el.clientHeight;
    const ratio = max > 0 ? el.scrollTop / max : 0;
    setScrollRatio(ratio);
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void upsert({
        ...currentBook,
        lastChapterIndex: chapterIndex,
        lastScrollRatio: ratio,
      });
    }, SCROLL_SAVE_DEBOUNCE);
  }, [currentBook, chapterIndex, upsert]);

  // ─── Reading-time tracker (visibility-aware, paused when hidden) ──
  useEffect(() => {
    if (!chapter) return;
    let lastPing = Date.now();
    const tick = () => {
      if (document.hidden) {
        lastPing = Date.now();
        return;
      }
      const now = Date.now();
      const elapsed = (now - lastPing) / 1000;
      lastPing = now;
      // Roughly attribute words by current scroll ratio.
      const seenWords = Math.max(0, Math.round((chapter.wordCount ?? 0) * scrollRatio));
      void addReadingTime(elapsed, 0).then(() => seenWords);
    };
    const id = window.setInterval(tick, READ_PING_MS);
    return () => window.clearInterval(id);
  }, [chapter, scrollRatio]);

  // ─── Chapter navigation ──
  /** Pending scroll ratio to apply right after the chapter mounts (used by bookmark jump). */
  const pendingJumpRatioRef = useRef<number | null>(null);

  const goToChapter = useCallback(
    (idx: number, scrollRatioOverride?: number) => {
      if (!currentBook) return;
      const safe = Math.max(0, Math.min(idx, currentChapters.length - 1));
      const ratio = scrollRatioOverride ?? 0;
      if (safe === chapterIndex) {
        // Same chapter — just jump in place.
        const el = scrollerRef.current;
        if (el) {
          const max = el.scrollHeight - el.clientHeight;
          el.scrollTop = Math.max(0, Math.min(1, ratio)) * max;
        }
        return;
      }
      // Persist before navigating (chapter index changes).
      void upsert({
        ...currentBook,
        lastChapterIndex: safe,
        lastScrollRatio: ratio,
      });
      pendingJumpRatioRef.current = scrollRatioOverride ?? null;
      setChapterIndex(safe);
      restoredChapterRef.current = null;
      requestAnimationFrame(() => {
        if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
      });
    },
    [currentBook, currentChapters.length, chapterIndex, upsert],
  );

  // After a jump-to-bookmark, override the default scroll restore.
  useEffect(() => {
    if (restoredChapterRef.current !== chapterIndex) return;
    const ratio = pendingJumpRatioRef.current;
    if (ratio == null) return;
    pendingJumpRatioRef.current = null;
    const el = scrollerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTop = Math.max(0, Math.min(1, ratio)) * max;
    });
  }, [chapterIndex, chapter]);

  // ─── Annotation handlers ──
  const handleAddHighlight = useCallback(
    async (text: string, color: "yellow" | "green" | "pink") => {
      if (!currentBook) return;
      await addHighlight({
        bookId: currentBook.id,
        chapterIndex,
        text,
        color,
      });
      toast.success("Highlighted.");
    },
    [currentBook, chapterIndex, addHighlight],
  );

  const handleAddNote = useCallback(
    async (text: string) => {
      if (!currentBook) return;
      await addHighlight({
        bookId: currentBook.id,
        chapterIndex,
        text,
        color: "yellow",
        note: "",
      });
      toast.success("Saved — open Notes to write your thought.");
    },
    [currentBook, chapterIndex, addHighlight],
  );

  const toggleBookmarkHere = useCallback(async () => {
    if (!currentBook) return;
    const here = bookmarks.find((b) => b.chapterIndex === chapterIndex);
    if (here) {
      await removeBookmark(here.id);
      toast.success("Bookmark removed.");
      return;
    }
    await addBookmark({
      bookId: currentBook.id,
      chapterIndex,
      scrollRatio,
      label: chapter?.title,
    });
    toast.success("Bookmarked.");
  }, [currentBook, chapterIndex, bookmarks, scrollRatio, chapter, addBookmark, removeBookmark]);

  const fontSizeClass = useMemo(() => "", []);
  const fontFamilyStack = FAMILY_FONT_STACKS[family];
  const fontFamilyClass = "";

  // ─── Empty / loading states ──
  if (!bookId) return null;
  if (!currentBook) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border">
          <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-2">
            <Link to="/books">
              <Button variant="ghost" size="icon" aria-label="Back to books">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-lg font-semibold">Loading…</h1>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-6 py-10">
          <EmptyState
            icon={<BookOpen className="h-10 w-10 text-muted-foreground" />}
            title="Loading book…"
            description="Decoding chapters from storage."
          />
        </main>
      </div>
    );
  }

  if (currentChapters.length === 0) {
    const isLang = isLanguageBook(currentBook);
    const isManual = !isLang && (!currentBook.fileName || /\.manual$/i.test(currentBook.fileName));
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border">
          <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-2">
            <Link to={isLang ? "/language-books" : "/books"}>
              <Button variant="ghost" size="icon" aria-label="Back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-lg font-semibold truncate">{currentBook.title}</h1>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-6 py-10">
          <EmptyState
            icon={<BookOpen className="h-10 w-10 text-muted-foreground" />}
            title={isLang || isManual ? "No chapters yet" : "No chapters found"}
            description={
              isLang
                ? "Generate your first chapter — give AI a list of words/phrases/idioms and it will weave a short story."
                : isManual
                  ? "Paste your first chapter to start reading. You can keep adding more chapters anytime."
                  : "This book doesn't have parsed chapters. Try re-uploading the EPUB."
            }
            action={
              isLang ? (
                <AddLanguageChapterDialog
                  book={currentBook}
                  existingChapterCount={0}
                  onAdded={() => setChapterIndex(0)}
                />
              ) : isManual ? (
                <AddChapterDialog
                  book={currentBook}
                  existingChapterCount={0}
                  onAdded={() => setChapterIndex(0)}
                  trigger={
                    <Button size="lg" className="gap-2">
                      <BookOpen className="h-4 w-4" />
                      Paste first chapter
                    </Button>
                  }
                />
              ) : (
                <Button onClick={() => navigate("/books")}>Back to library</Button>
              )
            }
          />
        </main>
      </div>
    );
  }

  const total = currentChapters.length;
  const isFirst = chapterIndex === 0;
  const isLast = chapterIndex === total - 1;
  const overallProgress = ((chapterIndex + Math.min(1, scrollRatio)) / total) * 100;

  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground">
      {/* ─────────── Header ─────────── */}
      <header className="sticky top-0 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 z-20">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-3 flex items-center gap-1 sm:gap-2">
          <Link to={isLanguageBook(currentBook) ? "/language-books" : "/books"}>
            <Button variant="ghost" size="icon" aria-label="Back to books">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <ChapterTOC
            chapters={currentChapters}
            currentIndex={chapterIndex}
            onSelect={goToChapter}
          />
          <div className="flex-1 min-w-0 px-1">
            <h1 className="text-sm sm:text-base font-semibold truncate leading-tight">
              {currentBook.title}
            </h1>
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
              {chapter?.title ?? `Chapter ${chapterIndex + 1}`} · {chapterIndex + 1}/{total}
            </p>
          </div>
          <BatchAnalyzeChapterButton
            bookId={currentBook.id}
            chapter={chapter}
            onResults={(results) => emitChapterAnalyses(currentBook.id, chapterIndex, results)}
          />
          <TranslateChapterButton
            bookId={currentBook.id}
            chapter={chapter}
            displayLang={displayLang}
            onDisplayLangChange={setDisplayLang}
            hasAnyTranslation={translationCount > 0}
          />
          <ReaderTTSQuickSettings faAvailable={!!faTtsText} />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const el = document.getElementById("chapter-rewrite");
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            aria-label="Jump to chapter rewrite"
            title="Rewrite this chapter (summary, key points, simplified…)"
          >
            <Wand2 className="h-5 w-5" />
          </Button>
          {/* Manual + Language books → quick "add next chapter" affordance */}
          {currentBook && isLanguageBook(currentBook) ? (
            <AddLanguageChapterDialog
              book={currentBook}
              existingChapterCount={currentChapters.length}
              onAdded={(newIdx) => goToChapter(newIdx)}
            />
          ) : currentBook && (!currentBook.fileName || /\.manual$/i.test(currentBook.fileName)) ? (
            <AddChapterDialog
              book={currentBook}
              existingChapterCount={currentChapters.length}
              onAdded={(newIdx) => goToChapter(newIdx)}
            />
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleBookmarkHere}
            aria-label={isBookmarkedHere ? "Remove bookmark" : "Bookmark this spot"}
            title={isBookmarkedHere ? "Remove bookmark" : "Bookmark this spot"}
            className={isBookmarkedHere ? "text-primary" : undefined}
          >
            {isBookmarkedHere ? (
              <BookmarkCheck className="h-5 w-5" />
            ) : (
              <Bookmark className="h-5 w-5" />
            )}
          </Button>
          <BookSearchSheet
            chapters={currentChapters}
            currentChapterIndex={chapterIndex}
            onJump={(idx) => goToChapter(idx)}
          />
          <ExportToLeitnerSheet
            bookId={currentBook.id}
            bookTitle={currentBook.title}
            chapters={currentChapters}
          />
          <BookNotesSheet
            highlights={highlights}
            bookmarks={bookmarks}
            chapters={currentChapters}
            currentChapterIndex={chapterIndex}
            onJump={(idx, ratio) => goToChapter(idx, ratio)}
            onDeleteHighlight={removeHighlight}
            onUpdateHighlightNote={updateHighlightNote}
            onDeleteBookmark={removeBookmark}
          />
          <ReaderSettings
            fontScale={fontScale}
            onFontScale={setFontScale}
            family={family}
            onFamily={setFamily}
            lineHeight={lineHeight}
            onLineHeight={setLineHeight}
          />
          <ReadingModeControls containerSelector="#book-reading-root" />
        </div>
        <Progress value={overallProgress} className="h-0.5 rounded-none" />
        {/* Sticky Original / Rewrite toggle — only when a rewrite exists for this chapter. */}
        {hasRewrite && (
          <div className="border-t border-border/40 bg-background/95 backdrop-blur">
            <div className="max-w-4xl mx-auto px-3 sm:px-6 py-2 flex items-center justify-center">
              <div
                role="tablist"
                aria-label="Original or rewritten chapter"
                className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={chapterView === "original"}
                  onClick={() => {
                    setChapterView("original");
                    requestAnimationFrame(() => {
                      scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                    });
                  }}
                  className={cn(
                    "px-4 py-1.5 text-xs font-medium rounded-md transition-colors",
                    chapterView === "original"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  متن اصلی
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={chapterView === "rewrite"}
                  onClick={() => {
                    setChapterView("rewrite");
                    requestAnimationFrame(() => {
                      document
                        .getElementById("chapter-rewrite")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    });
                  }}
                  className={cn(
                    "px-4 py-1.5 text-xs font-medium rounded-md transition-colors",
                    chapterView === "rewrite"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  بازنویسی AI
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {chapter && (
        <ChapterTTSPlayer
          bookId={currentBook.id}
          chapterIndex={chapterIndex}
          chapterTitle={chapter.title || `Chapter ${chapterIndex + 1}`}
          text={chapter.text}
          textFa={faTtsText || undefined}
          coverUrl={currentBook.coverDataUrl}
        />
      )}

      {/* Floating selection toolbar — appears when user selects text inside the scroller. */}
      <ReaderSelectionToolbar
        containerRef={scrollerRef}
        onHighlight={handleAddHighlight}
        onAddNote={handleAddNote}
      />

      {/* ─────────── Scrollable chapter ─────────── */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto overscroll-contain"
      >
        <main
          id="book-reading-root"
          data-reading-root
          className="max-w-4xl mx-auto px-5 sm:px-10 py-8 sm:py-12"
          style={{ fontSize: `${fontScale}rem`, lineHeight, fontFamily: fontFamilyStack }}
        >
          {chapter ? (
            <>
              <header className="mb-8 pb-6 border-b border-border/50">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Chapter {chapterIndex + 1} of {total}
                </p>
                <h2
                  className={cn("text-3xl sm:text-4xl font-bold tracking-tight", fontFamilyClass)}
                >
                  {chapter.title}
                </h2>
                {chapter.wordCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    ~{chapter.wordCount.toLocaleString()} words
                  </p>
                )}
              </header>

              <div className={chapterView === "rewrite" && hasRewrite ? "hidden" : ""}>
                <InteractiveBookText
                  html={chapter.html}
                  bookId={currentBook.id}
                  chapterIndex={chapterIndex}
                  fontSizeClass={fontSizeClass}
                  fontFamilyClass={fontFamilyClass}
                  highlights={chapterHighlights}
                  targetWords={
                    isLanguageBook(currentBook) ? decodeTargetsFromHtml(chapter.html) : undefined
                  }
                  displayLang={displayLang}
                  onTranslationCountChange={setTranslationCount}
                  sourceKind={isLanguageBook(currentBook) ? "language_book" : "book"}
                  sourceTitle={currentBook.title}
                />
              </div>

              <ChapterRewriteTabs
                bookId={currentBook.id}
                chapterIndex={chapterIndex}
                chapterTitle={chapter.title || `Chapter ${chapterIndex + 1}`}
                chapterText={chapter.text}
                fontSizeClass={fontSizeClass}
                fontFamilyClass={fontFamilyClass}
                view={chapterView}
                onHasRewriteChange={setHasRewrite}
                onToggleView={(v) => {
                  setChapterView(v);
                  if (v === "original") {
                    requestAnimationFrame(() => {
                      scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                    });
                  }
                }}
              />

              {/* End-of-chapter pager */}
              <div className="mt-12 pt-8 border-t border-border/50 flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={() => goToChapter(chapterIndex - 1)}
                  disabled={isFirst}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {chapterIndex + 1} / {total}
                </span>
                <Button
                  onClick={() => goToChapter(chapterIndex + 1)}
                  disabled={isLast}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <p className="text-center text-muted-foreground py-16">— chapter not found —</p>
          )}
        </main>
      </div>
    </div>
  );
};

export default BookReader;
