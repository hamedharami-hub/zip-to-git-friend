/**
 * Batch chapter analysis sheet.
 *
 * Pops out of the BookReader header. Shows total / cached / completed / failed
 * counters, a progress bar, the last-error string (if any), and a Cancel
 * button that aborts in-flight requests.
 *
 * On finish, the parent passes the result map back into the reader so every
 * paragraph in view can lazy-render its translation + idiom underlines.
 */
import { memo, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Loader2, X, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  batchAnalyzeChapter,
  extractAnalysableParagraphs,
  type BatchProgress,
} from "@/lib/batchAnalyzeChapter";
import type { BookChapter, BookParagraphAnalysis } from "@/types";
import { useOnline } from "@/hooks/useOnline";
import { toast } from "sonner";
import { useSettingsStore } from "@/store/settingsStore";
import { coerceBookModel } from "@/lib/aiModels";

interface Props {
  bookId: string;
  chapter: BookChapter | undefined;
  /** Called when one or more paragraph analyses are ready, so the reader
   *  can merge them into its own state and underline idioms in place. */
  onResults: (results: Record<string, BookParagraphAnalysis>) => void;
}

const CONCURRENCY = 3;

/** Force vocabulary to empty — batch processing returns ONLY phrases. */
function stripVocab(
  results: Record<string, BookParagraphAnalysis>,
): Record<string, BookParagraphAnalysis> {
  const out: Record<string, BookParagraphAnalysis> = {};
  for (const [k, v] of Object.entries(results)) {
    out[k] = { ...v, vocabulary: [] };
  }
  return out;
}

export const BatchAnalyzeChapterButton = memo(function BatchAnalyzeChapterButton({
  bookId,
  chapter,
  onResults,
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

  // Stop any in-flight run when the component unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const totalCandidates = chapter ? extractAnalysableParagraphs(chapter).length : 0;

  const handleStart = async () => {
    if (!chapter) return;
    if (!online) {
      toast.error("Batch analysis requires an internet connection.");
      return;
    }
    if (running) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRunning(true);
    setProgress({
      total: totalCandidates,
      completed: 0,
      skipped: 0,
      failed: 0,
      results: {},
      inFlight: 0,
      done: false,
      cancelled: false,
    });

    try {
      const final = await batchAnalyzeChapter(bookId, chapter, {
        concurrency: CONCURRENCY,
        signal: controller.signal,
        modelRef,
        onProgress: (snap) => {
          // Strip single-word vocabulary — batch run is phrase-only by design.
          const phrasesOnly = stripVocab(snap.results);
          setProgress({ ...snap, results: phrasesOnly });
          onResults(phrasesOnly);
        },
      });
      const finalPhrasesOnly = stripVocab(final.results);
      onResults(finalPhrasesOnly);
      if (final.cancelled) {
        toast("پردازش لغو شد.");
      } else if (final.failed > 0) {
        toast.warning(
          `پایان: ${final.completed - final.skipped} پردازش شد، ${final.skipped} از کش، ${final.failed} ناموفق.`,
        );
      } else {
        toast.success(
          `پردازش کامل شد — ${final.completed - final.skipped} جدید، ${final.skipped} از کش.`,
        );
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const pct =
    progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <Sheet open={open} onOpenChange={(v) => !running && setOpen(v)}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="پردازش کل لغت‌های یک متن"
          title="پردازش کل لغت‌های یک متن (فقط عبارات چندکلمه‌ای)"
        >
          <Sparkles className="h-5 w-5 text-primary" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[90vw] sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            پردازش کل لغت‌های یک متن
          </SheetTitle>
          <SheetDescription>
            فقط عبارات چندکلمه‌ای (phrasal verbs، idioms، collocations) از کل متن استخراج می‌شود.
            لغات تک‌کلمه‌ای نادیده گرفته می‌شوند. نتایج کش می‌شوند تا در دفعات بعد بازاستفاده شوند.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {chapter ? (
            <div className="rounded-lg border border-border bg-card/50 p-4 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Current chapter
              </p>
              <p className="font-semibold leading-snug">{chapter.title}</p>
              <p className="text-xs text-muted-foreground">
                {totalCandidates} paragraph{totalCandidates === 1 ? "" : "s"} ·{" "}
                {chapter.wordCount.toLocaleString()} words
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No chapter loaded.</p>
          )}

          <p className="text-xs text-muted-foreground">
            AI model:{" "}
            <span className="font-medium text-foreground">
              {modelRef.provider === "gateway" ? "" : `${modelRef.provider}: `}
              {modelRef.model}
            </span>
            <br />
            Change in <strong>Settings → Books → Whole-chapter batch analysis</strong>.
          </p>

          {progress && (
            <div className="space-y-3">
              <div>
                <div className="flex items-baseline justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">
                    {progress.completed} / {progress.total}
                  </span>
                  <span className="tabular-nums font-medium">{pct}%</span>
                </div>
                <Progress value={pct} />
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <Stat label="Cached" value={progress.skipped} tone="muted" />
                <Stat
                  label="New"
                  value={Math.max(0, progress.completed - progress.skipped)}
                  tone="primary"
                />
                <Stat
                  label="Failed"
                  value={progress.failed}
                  tone={progress.failed > 0 ? "danger" : "muted"}
                />
              </div>

              {progress.inFlight > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {progress.inFlight} request{progress.inFlight === 1 ? "" : "s"} in flight…
                </p>
              )}

              {progress.lastError && (
                <p className="text-xs text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{progress.lastError}</span>
                </p>
              )}

              {progress.done && !progress.cancelled && progress.failed === 0 && (
                <p className="text-xs text-primary flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Chapter analysis complete.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            {running ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                className="flex-1 gap-1.5"
              >
                <X className="h-4 w-4" />
                لغو
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleStart}
                disabled={!chapter || totalCandidates === 0 || !online}
                className="flex-1 gap-1.5"
              >
                <Sparkles className="h-4 w-4" />
                {progress?.done ? "اجرای دوباره" : "شروع پردازش"}
              </Button>
            )}
          </div>

          {!online && (
            <p className="text-xs text-muted-foreground">
              You are offline. Reconnect to run AI analysis.
            </p>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Tip: results are cached on this device. Closing this panel won't lose progress, and the
            same chapter won't be re-analyzed unless you press{" "}
            <span className="font-medium">Re-run</span>.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
});

interface StatProps {
  label: string;
  value: number;
  tone: "muted" | "primary" | "danger";
}

function Stat({ label, value, tone }: StatProps) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "danger"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <div className="rounded-md border border-border bg-card/40 px-2 py-2">
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
