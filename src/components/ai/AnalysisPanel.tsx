import { useEffect, useState } from "react";
import { Sparkles, Plus, Loader2, Languages, Check, WifiOff } from "lucide-react";
import type { SubtitleCue, SegmentAnalysis } from "@/types";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/settingsStore";
import { useLeitnerStore } from "@/store/leitnerStore";
import { getAnalysis, saveAnalysis } from "@/lib/db";
import { runAnalyze, runTranslate, aiErrorMessage, getApiKeyFor } from "@/lib/ai";
import { useOnline } from "@/hooks/useOnline";
import { toast } from "sonner";
import { ensureAutoFolder } from "@/lib/leitnerAutoFolder";

interface Props {
  videoId: string;
  cue: SubtitleCue | null;
  /** When true, automatically run analysis when cue changes. */
  autoRun?: boolean;
  /** When true, also offer Quick Translate (no Persian sub available). */
  showTranslate?: boolean;
}

export function AnalysisPanel({ videoId, cue, autoRun = false, showTranslate = false }: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const addCard = useLeitnerStore((s) => s.addCard);
  const findByFront = useLeitnerStore((s) => s.findByFront);
  const leitnerCards = useLeitnerStore((s) => s.cards);
  const online = useOnline();
  const [analysis, setAnalysis] = useState<SegmentAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  const isInLeitner = (front: string) => !!findByFront(front);

  const handleAdd = async (front: string, back: string, kind: "word" | "idiom") => {
    const folderId = await ensureAutoFolder({ kind: "video", sourceRef: videoId });
    const result = await addCard({
      front,
      back,
      sourceVideoId: videoId,
      sourceCueId: cue?.id,
      folderId,
      sourceKind: "video",
      exampleSentence: cue?.text,
    });
    if (result === "duplicate") {
      toast(`Already in Leitner: ${front}`);
    } else {
      toast.success(`Added ${kind}: ${front}`);
    }
  };
  // Reference leitnerCards so re-renders happen on add — read for side-effect.
  void leitnerCards;

  // Reset state when cue changes
  useEffect(() => {
    setAnalysis(null);
    setTranslation(null);
    if (!cue) return;
    let cancelled = false;
    (async () => {
      const cached = await getAnalysis(videoId, cue.id);
      if (cancelled) return;
      if (cached) {
        setAnalysis(cached);
        if (cached.translation) setTranslation(cached.translation);
      } else if (autoRun) {
        runAnalyzeNow(cue, true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue?.id, videoId]);

  const runAnalyzeNow = async (c: SubtitleCue, silent = false) => {
    const choice = settings.analyzeModel;
    if (!getApiKeyFor(choice, settings)) {
      if (!silent)
        toast.error(
          choice.provider === "gemini"
            ? "Add your Gemini API key in Settings."
            : "Add your Groq API key in Settings.",
        );
      return;
    }
    setLoading(true);
    try {
      const cached = await getAnalysis(videoId, c.id);
      if (cached) {
        setAnalysis(cached);
        if (cached.translation) setTranslation(cached.translation);
        return;
      }
      const result = await runAnalyze(c.text, choice, settings);
      // Fallback: if model didn't include translation, fetch it separately.
      let finalResult = result;
      if (!result.translation) {
        try {
          const t = await runTranslate(c.text, settings.translateModel, settings);
          finalResult = { ...result, translation: t.trim() };
        } catch {
          /* keep going without translation */
        }
      }
      await saveAnalysis(videoId, c.id, finalResult);
      setAnalysis(finalResult);
      if (finalResult.translation) setTranslation(finalResult.translation);
    } catch (e) {
      if (!silent) toast.error(aiErrorMessage(e, "Analysis failed."));
    } finally {
      setLoading(false);
    }
  };

  const runTranslateNow = async (c: SubtitleCue) => {
    const choice = settings.translateModel;
    if (!getApiKeyFor(choice, settings)) {
      toast.error(
        choice.provider === "gemini"
          ? "Add your Gemini API key in Settings."
          : "Add your Groq API key in Settings.",
      );
      return;
    }
    setTranslating(true);
    try {
      const t = await runTranslate(c.text, choice, settings);
      setTranslation(t);
    } catch (e) {
      toast.error(aiErrorMessage(e, "Translation failed."));
    } finally {
      setTranslating(false);
    }
  };

  if (!cue) return null;

  const hasContent = !!analysis && (analysis.vocabulary.length > 0 || analysis.idioms.length > 0);

  return (
    <div className="space-y-2">
      {/* Persian sentence translation — shown FIRST, right under the English subtitle */}
      {translation && (
        <div
          dir="auto"
          className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary"
        >
          {translation}
        </div>
      )}

      {analysis && !hasContent && (
        <p className="text-xs text-muted-foreground">No notable vocabulary or idioms.</p>
      )}

      {hasContent && (
        <div className="space-y-3 rounded-md border border-border bg-card/50 p-3">
          {analysis!.vocabulary.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Vocabulary
              </h4>
              <ul className="space-y-1">
                {analysis!.vocabulary.map((v, i) => {
                  const added = isInLeitner(v.word);
                  return (
                    <li key={`v-${i}`} className="flex items-start gap-2 text-sm">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        title={added ? "Already in Leitner" : "Add to Leitner"}
                        onClick={() => handleAdd(v.word, v.translation, "word")}
                        disabled={added}
                      >
                        {added ? (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <span className="font-medium">{v.word}</span>
                      {v.partOfSpeech && (
                        <span className="text-xs text-muted-foreground">({v.partOfSpeech})</span>
                      )}
                      <span className="text-muted-foreground">—</span>
                      <span dir="auto" className="text-primary">
                        {v.translation}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {analysis!.idioms.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Idioms / Phrases
              </h4>
              <ul className="space-y-1">
                {analysis!.idioms.map((it, idx) => {
                  const added = isInLeitner(it.phrase);
                  return (
                    <li key={`i-${idx}`} className="flex items-start gap-2 text-sm">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        title={added ? "Already in Leitner" : "Add to Leitner"}
                        onClick={() => handleAdd(it.phrase, it.meaning, "idiom")}
                        disabled={added}
                      >
                        {added ? (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <span className="font-medium">{it.phrase}</span>
                      <span className="text-muted-foreground">—</span>
                      <span dir="auto" className="text-primary">
                        {it.meaning}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Action buttons live BELOW the Persian translation & analysis,
          so the English subtitle and Persian meaning sit visually adjacent. */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => runAnalyzeNow(cue)}
          disabled={loading || !online}
          aria-label="Analyze subtitle"
          title={!online ? "AI analysis requires an internet connection" : undefined}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          )}
          {analysis ? "Re-analyze" : "Analyze"}
        </Button>
        {showTranslate && !translation && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => runTranslateNow(cue)}
            disabled={translating || !online}
            aria-label="Translate subtitle"
            title={!online ? "Translation requires an internet connection" : undefined}
          >
            {translating ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Languages className="h-3.5 w-3.5 mr-1.5" />
            )}
            Translate
          </Button>
        )}
        {!online && (
          <span
            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            role="status"
          >
            <WifiOff className="h-3 w-3" /> offline — AI features paused
          </span>
        )}
      </div>
    </div>
  );
}
