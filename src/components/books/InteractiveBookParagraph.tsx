import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import { Sparkles, Languages, Loader2 } from "lucide-react";
import { InteractiveSubtitle } from "@/components/ai/InteractiveSubtitle";
import { useParagraphGestures, speakText } from "@/hooks/useParagraphGestures";
import { Button } from "@/components/ui/button";
import { ParagraphAnalysisCard } from "@/components/books/ParagraphAnalysisCard";
import { ParagraphTTSButton } from "@/components/books/ParagraphTTSButton";
import { ParagraphActionsMenu } from "@/components/books/ParagraphActionsMenu";
import { analyzeParagraphRouted } from "@/lib/bookAiRouter";
import { coerceBookModel } from "@/lib/aiModels";
import { useSettingsStore } from "@/store/settingsStore";
import { useOnline } from "@/hooks/useOnline";
import { toast } from "sonner";
import type { BookParagraphAnalysis, HighlightColor } from "@/types";
import { cn } from "@/lib/utils";
import { HIGHLIGHT_CLASSES } from "@/hooks/useBookAnnotations";

export type DisplayLang = "en" | "fa" | "both";

export interface ParagraphProps {
  kind: "p" | "blockquote" | "li";
  text: string;
  hash: string;
  bookId: string;
  chapterIndex: number;
  cueId: string;
  analysis: BookParagraphAnalysis | null;
  onAnalyzed: (hash: string, a: BookParagraphAnalysis) => void;
  /** All chapter highlights — Paragraph picks up substring matches itself. */
  highlights: { text: string; color: HighlightColor }[];
  /** Optional: language-book target items present in this paragraph. */
  targets?: string[];
  displayLang?: DisplayLang;
  isActiveSpeech?: boolean;
  activeRef?: React.MutableRefObject<HTMLDivElement | null>;
  sourceKind?: import("@/types").LeitnerSourceKind;
  sourceTitle?: string;
}

const Paragraph = memo(function Paragraph({
  kind,
  text,
  hash,
  bookId,
  chapterIndex,
  cueId,
  analysis,
  onAnalyzed,
  highlights,
  targets = [],
  displayLang = "en",
  isActiveSpeech = false,
  activeRef,
  sourceKind,
  sourceTitle,
}: ParagraphProps) {
  const [localMode, setLocalMode] = useState<"none" | "fa" | "analysis">("none");
  const [localLoading, setLocalLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { bookSingleAnalysisModelRef, bookSingleAnalysisModel, paragraphGestures } =
    useSettingsStore(
      useShallow((s) => ({
        bookSingleAnalysisModelRef: s.settings.bookSingleAnalysisModelRef,
        bookSingleAnalysisModel: s.settings.bookSingleAnalysisModel,
        paragraphGestures: s.settings.paragraphGestures,
      })),
    );
  const online = useOnline();
  const modelRef = coerceBookModel(bookSingleAnalysisModelRef ?? bookSingleAnalysisModel);

  const gesturesEnabled = !!paragraphGestures;

  const [starred, setStarred] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`para-star:${hash}`) === "1";
    } catch {
      return false;
    }
  });

  const handleAnalysisUpdate = useCallback(
    (a: BookParagraphAnalysis) => {
      onAnalyzed(hash, a);
    },
    [hash, onAnalyzed],
  );

  const ensureAnalysis = useCallback(async (): Promise<boolean> => {
    if (analysis) return true;
    if (!online) {
      toast.error("برای ترجمه نیاز به اینترنت است.");
      return false;
    }
    setLocalLoading(true);
    try {
      const result = await analyzeParagraphRouted(bookId, chapterIndex, text, { modelRef });
      handleAnalysisUpdate(result);
      return true;
    } catch {
      toast.error("ترجمه با خطا مواجه شد.");
      return false;
    } finally {
      setLocalLoading(false);
    }
  }, [analysis, online, bookId, chapterIndex, text, modelRef, handleAnalysisUpdate]);

  const handleFaOnly = useCallback(async () => {
    if (localMode === "fa") {
      setLocalMode("none");
      return;
    }
    if (!analysis) {
      const ok = await ensureAnalysis();
      if (!ok) return;
    }
    setLocalMode("fa");
  }, [localMode, analysis, ensureAnalysis]);

  const handleAnalysis = useCallback(async () => {
    if (localMode === "analysis") {
      setLocalMode("none");
      return;
    }
    if (!analysis) {
      const ok = await ensureAnalysis();
      if (!ok) return;
    }
    setLocalMode("analysis");
  }, [localMode, analysis, ensureAnalysis]);

  const toggleStar = useCallback(() => {
    setStarred((v) => {
      const n = !v;
      try {
        if (n) {
          localStorage.setItem(`para-star:${hash}`, "1");
        } else {
          localStorage.removeItem(`para-star:${hash}`);
        }
      } catch {
        /* ignore */
      }
      toast.success(n ? "ستاره‌دار شد" : "ستاره برداشته شد");
      return n;
    });
  }, [hash]);

  const handleDoubleTap = useCallback(
    (target: HTMLElement) => {
      const fa = analysis?.translation?.trim() ?? "";
      const isFaTarget = target.closest('[lang="fa"], [dir="rtl"]');
      if (isFaTarget && fa) {
        speakText(fa, "fa");
        return;
      }
      speakText(text, "en");
    },
    [analysis?.translation, text],
  );

  const gestureHandlers = useParagraphGestures({
    enabled: gesturesEnabled,
    onSwipeRight: () => {
      void handleFaOnly();
    },
    onSwipeLeft: () => {
      void handleAnalysis();
    },
    onDoubleTap: handleDoubleTap,
    onLongPress: () => {
      setMenuOpen(true);
    },
  });

  // Long-press support when gestures mode is OFF: detect 500ms touch hold.
  const lpTimer = useRef<number | null>(null);
  const lpFired = useRef(false);
  const startLp = useCallback(() => {
    if (gesturesEnabled) return;
    lpFired.current = false;
    if (lpTimer.current) window.clearTimeout(lpTimer.current);
    lpTimer.current = window.setTimeout(() => {
      lpFired.current = true;
      setMenuOpen(true);
    }, 500);
  }, [gesturesEnabled]);
  const clearLp = useCallback(() => {
    if (lpTimer.current) {
      window.clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  }, []);
  const nonGestureHandlers = gesturesEnabled
    ? {}
    : {
        onTouchStart: startLp,
        onTouchEnd: clearLp,
        onTouchMove: clearLp,
        onTouchCancel: clearLp,
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault();
          setMenuOpen(true);
        },
      };

  // Build the annotation list: highlights win over targets/phrases when they
  // overlap. Targets are stronger than AI idioms (the user explicitly chose
  // them), so we sort them first within the "phrase" group.
  // IMPORTANT: idiom/vocab underlines only appear when the user explicitly
  // toggles "ترجمه + پردازش" on this paragraph (i.e. localMode === 'analysis').
  const targetPhrases = useMemo(
    () => targets.map((t) => t.trim()).filter((t) => t.length > 1),
    [targets],
  );
  const idiomPhrases = useMemo(
    () =>
      (localMode === "analysis" ? (analysis?.idioms ?? []) : [])
        .map((i) => i.phrase.trim())
        .filter((p) => p.length > 1),
    [localMode, analysis?.idioms],
  );
  const vocabWords = useMemo(
    () =>
      (localMode === "analysis" ? (analysis?.vocabulary ?? []) : [])
        .map((v) => v.word.trim())
        .filter((w) => w.length > 1),
    [localMode, analysis?.vocabulary],
  );

  const annotations = useMemo<Annotation[]>(
    () => [
      ...highlights.map((h) => ({
        text: h.text,
        kind: "highlight" as const,
        color: h.color,
      })),
      ...targetPhrases.map((p) => ({ text: p, kind: "target" as const })),
      ...idiomPhrases.map((p) => ({ text: p, kind: "idiom" as const })),
      ...vocabWords.map((p) => ({ text: p, kind: "idiom" as const })),
    ],
    [highlights, targetPhrases, idiomPhrases, vocabWords],
  );

  const segments = useMemo(() => splitByAnnotations(text, annotations), [text, annotations]);

  const Wrapper: React.ElementType =
    kind === "blockquote" ? "blockquote" : kind === "li" ? "div" : "p";

  const wrapperClass =
    kind === "blockquote"
      ? "border-l-4 border-primary/40 pl-4 italic text-muted-foreground"
      : kind === "li"
        ? "flex gap-2 pl-2 text-foreground/90"
        : "text-foreground/90";

  const fa = analysis?.translation?.trim() ?? "";

  // If global displayLang asks for fa/both and we have a translation, force-show it.
  const globalShowFa = !!fa && (displayLang === "fa" || displayLang === "both");
  const showFa = globalShowFa || localMode === "fa" || localMode === "analysis";
  const showEn = displayLang !== "fa" || !showFa;
  const showAnalysisCard = localMode === "analysis";

  const handleCloseCard = useCallback(() => setLocalMode("none"), []);
  const handleTranslateAction = useCallback(() => {
    void handleAnalysis();
  }, [handleAnalysis]);

  useEffect(() => {
    return () => {
      if (lpTimer.current) window.clearTimeout(lpTimer.current);
    };
  }, []);

  return (
    <div
      ref={activeRef}
      {...gestureHandlers}
      {...nonGestureHandlers}
      className={cn(
        "group relative rounded-lg transition-colors",
        gesturesEnabled && "touch-pan-y select-none cursor-pointer",
        starred && "ring-1 ring-amber-400/50 bg-amber-400/[0.04]",
        isActiveSpeech && "ring-2 ring-primary/60 bg-primary/5 px-2 py-1.5 -mx-2",
      )}
    >
      {showEn && (
        <Wrapper className={wrapperClass}>
          {kind === "li" && <span className="text-muted-foreground select-none">•</span>}
          <span className={cn(kind === "li" && "flex-1")}>
            <span className="block">
              {segments.map((seg, i) => {
                if (seg.kind === "highlight") {
                  return (
                    <mark
                      key={i}
                      data-highlight-color={seg.color}
                      className={cn(
                        "rounded px-0.5 transition-colors",
                        HIGHLIGHT_CLASSES[seg.color],
                      )}
                    >
                      <InteractiveSubtitle
                        text={seg.text}
                        context={text}
                        videoId={bookId}
                        cueId={cueId}
                      />
                    </mark>
                  );
                }
                if (seg.kind === "idiom" || seg.kind === "target") {
                  const isTarget = seg.kind === "target";
                  return (
                    <span
                      key={i}
                      className={cn(
                        "rounded px-0.5",
                        isTarget
                          ? "lang-target font-medium"
                          : "underline decoration-primary/60 decoration-2 underline-offset-4",
                      )}
                      title={
                        isTarget
                          ? "Target item — tap to study"
                          : "Idiom / phrase — see analysis below"
                      }
                    >
                      <InteractiveSubtitle
                        text={seg.text}
                        context={text}
                        videoId={bookId}
                        cueId={cueId}
                      />
                    </span>
                  );
                }
                return (
                  <InteractiveSubtitle
                    key={i}
                    text={seg.text}
                    context={text}
                    videoId={bookId}
                    cueId={cueId}
                  />
                );
              })}
            </span>
          </span>
        </Wrapper>
      )}

      {showFa && fa && (
        <p
          dir="rtl"
          lang="fa"
          className={cn(
            "leading-[2] text-[1.02em] text-foreground rounded-md",
            // Only show the accent rail + tint when both languages are visible.
            // In "Persian only" mode the page should look like a plain Persian
            // article — same vibe as "English only".
            showEn && "border-r-2 border-primary/40 pr-3 bg-primary/[0.04] py-2",
            showEn ? (gesturesEnabled ? "mt-1.5" : "mt-2.5") : "mt-0",
          )}
          style={{ fontFamily: '"Vazirmatn","IRANSans","Tahoma",sans-serif', fontWeight: 500 }}
        >
          {fa}
        </p>
      )}

      {/* Per-paragraph toolbar — hidden in gesture mode (use swipes/taps instead). */}
      {!gesturesEnabled && (
        <div className="mt-2 flex flex-wrap items-center gap-1 not-prose">
          <ParagraphTTSButton text={text} lang="en" />
          <ParagraphTTSButton text={fa || text} lang="fa" />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleFaOnly}
            disabled={localLoading}
            className={cn(
              "h-7 px-2 gap-1.5 text-[11px]",
              localMode === "fa"
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-primary",
            )}
            title="فقط ترجمه فارسی"
            aria-label="فقط ترجمه فارسی"
            aria-pressed={localMode === "fa"}
          >
            {localLoading && localMode !== "analysis" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Languages className="h-3.5 w-3.5" />
            )}
            <span>ترجمه</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleAnalysis}
            disabled={localLoading}
            className={cn(
              "h-7 px-2 gap-1.5 text-[11px]",
              localMode === "analysis"
                ? "text-primary bg-primary/10"
                : analysis
                  ? "text-primary"
                  : "text-muted-foreground hover:text-primary",
            )}
            title="ترجمه + پردازش لغت‌ها و عبارت‌ها"
            aria-label="ترجمه و پردازش"
            aria-pressed={localMode === "analysis"}
          >
            {localLoading && localMode !== "fa" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span>ترجمه + پردازش</span>
          </Button>
        </div>
      )}

      {showAnalysisCard && (
        <ParagraphAnalysisCard
          bookId={bookId}
          chapterIndex={chapterIndex}
          paragraph={text}
          initial={analysis}
          onAnalyzed={handleAnalysisUpdate}
          onClose={handleCloseCard}
          sourceKind={sourceKind}
          sourceTitle={sourceTitle}
          hideTranslation
        />
      )}

      <ParagraphActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        text={text}
        faText={fa || undefined}
        bookId={bookId}
        chapterIndex={chapterIndex}
        starred={starred}
        onToggleStar={toggleStar}
        onTranslate={handleTranslateAction}
      />
    </div>
  );
});

export { Paragraph };

type Annotation =
  | { text: string; kind: "highlight"; color: HighlightColor }
  | { text: string; kind: "idiom" }
  | { text: string; kind: "target" };

type Segment =
  | { text: string; kind: "plain" }
  | { text: string; kind: "highlight"; color: HighlightColor }
  | { text: string; kind: "idiom" }
  | { text: string; kind: "target" };

/**
 * Split a paragraph into non-overlapping runs annotated by either a highlight
 * (with colour), a target item, or an idiom phrase. When two annotations
 * overlap the longer one wins; for equal lengths, highlights > targets > idioms.
 */
function splitByAnnotations(text: string, annotations: Annotation[]): Segment[] {
  if (annotations.length === 0) return [{ text, kind: "plain" }];

  const lower = text.toLowerCase();
  type Match = { start: number; end: number; ann: Annotation };
  const matches: Match[] = [];

  for (const ann of annotations) {
    const needle = ann.text.toLowerCase();
    if (!needle) continue;
    let from = 0;
    while (from <= lower.length - needle.length) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1) break;
      matches.push({ start: idx, end: idx + needle.length, ann });
      from = idx + needle.length;
    }
  }

  if (matches.length === 0) return [{ text, kind: "plain" }];

  const priority = (k: Annotation["kind"]) => (k === "highlight" ? 0 : k === "target" ? 1 : 2);

  matches.sort((a, b) => {
    const lenDiff = b.end - b.start - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    const pDiff = priority(a.ann.kind) - priority(b.ann.kind);
    if (pDiff !== 0) return pDiff;
    return a.start - b.start;
  });

  const taken: Match[] = [];
  for (const m of matches) {
    if (taken.some((t) => m.start < t.end && m.end > t.start)) continue;
    taken.push(m);
  }
  taken.sort((a, b) => a.start - b.start);

  const out: Segment[] = [];
  let cursor = 0;
  for (const m of taken) {
    if (m.start > cursor) out.push({ text: text.slice(cursor, m.start), kind: "plain" });
    const slice = text.slice(m.start, m.end);
    if (m.ann.kind === "highlight") {
      out.push({ text: slice, kind: "highlight", color: m.ann.color });
    } else if (m.ann.kind === "target") {
      out.push({ text: slice, kind: "target" });
    } else {
      out.push({ text: slice, kind: "idiom" });
    }
    cursor = m.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), kind: "plain" });
  return out;
}
