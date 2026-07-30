/**
 * "Translate whole text" — runs the same per-paragraph analyzer used by the
 * batch-analyze sheet, then exposes an EN / FA / EN+FA view toggle.
 *
 * One button in the reader header. Click → progress popover with cancel.
 * Each finished paragraph immediately publishes via `chapterAnalysisBus`,
 * so InteractiveBookText can render the Persian translation in place.
 *
 * Reuses the existing `analyze-paragraph` cache, so reopening a previously
 * translated chapter is instant and free.
 */
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import { Languages, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  batchAnalyzeChapter,
  extractAnalysableParagraphs,
  type BatchProgress,
} from "@/lib/batchAnalyzeChapter";
import { emitChapterAnalyses } from "@/lib/chapterAnalysisBus";
import { useOnline } from "@/hooks/useOnline";
import { useSettingsStore } from "@/store/settingsStore";
import { coerceBookModel } from "@/lib/aiModels";
import type { BookChapter } from "@/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type DisplayLang = "en" | "fa" | "both";

interface Props {
  bookId: string;
  chapter: BookChapter | undefined;
  /** Current rendering mode in the parent. */
  displayLang: DisplayLang;
  onDisplayLangChange: (l: DisplayLang) => void;
  /** True once at least one paragraph translation is available (cached or fresh). */
  hasAnyTranslation: boolean;
}

const CONCURRENCY = 5;

export function TranslateChapterButton({
  bookId,
  chapter,
  displayLang,
  onDisplayLangChange,
  hasAnyTranslation,
}: Props) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const online = useOnline();
  const { paragraphBatchModelRef, bookBatchAnalysisModelRef, bookBatchAnalysisModel } =
    useSettingsStore(
      useShallow((s) => ({
        paragraphBatchModelRef: s.settings.paragraphBatchModelRef,
        bookBatchAnalysisModelRef: s.settings.bookBatchAnalysisModelRef,
        bookBatchAnalysisModel: s.settings.bookBatchAnalysisModel,
      })),
    );
  const modelRef = coerceBookModel(
    paragraphBatchModelRef ?? bookBatchAnalysisModelRef ?? bookBatchAnalysisModel,
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  const totalCandidates = chapter ? extractAnalysableParagraphs(chapter).length : 0;

  const handleStart = async () => {
    if (!chapter) return;
    if (!online) {
      toast.error("ترجمه نیاز به اینترنت دارد.");
      return;
    }
    if (running) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    try {
      const final = await batchAnalyzeChapter(bookId, chapter, {
        concurrency: CONCURRENCY,
        signal: controller.signal,
        modelRef,
        onProgress: (snap) => {
          setProgress(snap);
          // Stream into the reader so paragraphs flip to Persian as they land.
          emitChapterAnalyses(bookId, chapter.index, snap.results);
        },
      });
      emitChapterAnalyses(bookId, chapter.index, final.results);
      // Auto-switch to bilingual view when the first paragraph finishes.
      if (Object.keys(final.results).length > 0 && displayLang === "en") {
        onDisplayLangChange("both");
      }
      if (final.cancelled) toast("ترجمه لغو شد.");
      else if (final.failed > 0)
        toast.warning(
          `پایان: ${final.completed - final.skipped} ترجمه شد، ${final.skipped} از کش، ${final.failed} ناموفق.`,
        );
      else
        toast.success(
          `ترجمه کامل — ${final.completed - final.skipped} جدید، ${final.skipped} از کش.`,
        );
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => abortRef.current?.abort();

  const pct =
    progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={(v) => !running && setOpen(v)}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="ترجمه کامل متن"
            title="ترجمه کامل متن"
            className={cn(hasAnyTranslation && "text-primary")}
          >
            {running ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Languages className="h-5 w-5" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">ترجمه کامل متن به فارسی</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              همهٔ پاراگراف‌ها با یک کلیک ترجمه و پردازش می‌شوند. نتیجه در دستگاه شما کش می‌شود.
            </p>
          </div>
          {progress && (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">
                  {progress.completed} / {progress.total}
                </span>
                <span className="tabular-nums font-medium">{pct}%</span>
              </div>
              <Progress value={pct} />
              {progress.inFlight > 0 && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {progress.inFlight} در حال انجام…
                </p>
              )}
              {progress.lastError && (
                <p className="text-[11px] text-destructive">{progress.lastError}</p>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            {running ? (
              <Button onClick={handleCancel} variant="outline" className="flex-1 gap-1.5" size="sm">
                <X className="h-4 w-4" />
                لغو
              </Button>
            ) : (
              <Button
                onClick={handleStart}
                disabled={!chapter || totalCandidates === 0 || !online}
                className="flex-1 gap-1.5"
                size="sm"
              >
                <Languages className="h-4 w-4" />
                {progress?.done ? "اجرای دوباره" : `شروع ترجمه (${totalCandidates} پاراگراف)`}
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {hasAnyTranslation && (
        <div
          role="tablist"
          aria-label="نمایش زبان"
          className="inline-flex max-w-full flex-wrap rounded-md border border-border bg-muted/40 p-0.5"
        >
          {(["en", "both", "fa"] as DisplayLang[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={displayLang === m}
              onClick={() => onDisplayLangChange(m)}
              className={cn(
                "px-2 py-0.5 text-[11px] font-medium rounded transition-colors",
                displayLang === m
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "en" ? "EN" : m === "fa" ? "FA" : "EN+FA"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
