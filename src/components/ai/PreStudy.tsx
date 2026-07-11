import { useEffect, useMemo, useState } from "react";
import {
  GraduationCap,
  X,
  Loader2,
  Volume2,
  Check,
  EyeOff,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSubtitleStore } from "@/store/subtitleStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useLeitnerStore } from "@/store/leitnerStore";
import { useOnline } from "@/hooks/useOnline";
import { useAllWordStatus, setWordStatusGlobal, statusLabel } from "@/hooks/useWordStatus";
import { runTranslate, aiErrorMessage, getApiKeyFor } from "@/lib/ai";
import { getWordTranslation, saveWordTranslation } from "@/lib/db";
import { toast } from "sonner";
import { ensureAutoFolder } from "@/lib/leitnerAutoFolder";

interface Props {
  videoId: string;
  /** How many top unknown words to surface. */
  limit?: number;
}

interface CandidateWord {
  word: string;
  count: number;
  exampleCue?: string;
}

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "so",
  "if",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "with",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "am",
  "do",
  "does",
  "did",
  "doing",
  "done",
  "have",
  "has",
  "had",
  "having",
  "will",
  "would",
  "shall",
  "should",
  "can",
  "could",
  "may",
  "might",
  "must",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "its",
  "our",
  "their",
  "mine",
  "yours",
  "hers",
  "ours",
  "theirs",
  "this",
  "that",
  "these",
  "those",
  "there",
  "here",
  "where",
  "when",
  "why",
  "how",
  "who",
  "whom",
  "what",
  "which",
  "whose",
  "as",
  "than",
  "then",
  "just",
  "not",
  "no",
  "yes",
  "also",
  "too",
  "s",
  "t",
  "re",
  "ve",
  "ll",
  "d",
  "m",
  "don",
  "doesn",
  "didn",
  "isn",
  "aren",
  "wasn",
  "weren",
  "won",
  "wouldn",
  "shouldn",
  "couldn",
  "haven",
  "hasn",
  "hadn",
  "into",
  "from",
  "by",
  "about",
  "up",
  "down",
  "out",
  "off",
  "over",
  "under",
  "again",
  "further",
  "now",
  "very",
  "all",
  "any",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "only",
  "own",
  "same",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
]);

function cleanWord(w: string): string {
  return w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "").toLowerCase();
}

function speak(word: string) {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-US";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch {
    /* noop */
  }
}

/**
 * Pre-Study: scans the loaded primary subtitle, finds the most-frequent words
 * the user has NOT marked as known/ignored, and walks them through a
 * flashcard-style review (translation + mark known/learning/ignored).
 */
export function PreStudy({ videoId, limit = 25 }: Props) {
  const primary = useSubtitleStore((s) => s.primary);
  const settings = useSettingsStore((s) => s.settings);
  const online = useOnline();
  const addCard = useLeitnerStore((s) => s.addCard);
  const statusMap = useAllWordStatus();
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [translation, setTranslation] = useState<string | null>(null);
  const [loadingT, setLoadingT] = useState(false);

  // Build the candidate list when the modal opens (so it reflects latest status).
  const candidates = useMemo<CandidateWord[]>(() => {
    if (!open || !primary?.cues.length) return [];
    const counts = new Map<string, { count: number; example: string }>();
    for (const cue of primary.cues) {
      const seen = new Set<string>();
      for (const raw of cue.text.split(/\s+/)) {
        const w = cleanWord(raw);
        if (!w || w.length < 3) continue;
        if (STOPWORDS.has(w)) continue;
        if (seen.has(w)) continue;
        seen.add(w);
        const st = statusMap[w] ?? "new";
        if (st === "known" || st === "ignored") continue;
        const cur = counts.get(w);
        if (cur) cur.count += 1;
        else counts.set(w, { count: 1, example: cue.text });
      }
    }
    return [...counts.entries()]
      .map(([word, v]) => ({ word, count: v.count, exampleCue: v.example }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, primary?.id, limit]);

  const current = candidates[idx];

  // Load translation for the current word when it changes.
  useEffect(() => {
    if (!open || !current) {
      setTranslation(null);
      return;
    }
    let cancelled = false;
    setTranslation(null);
    setLoadingT(false);
    (async () => {
      const cached = await getWordTranslation(current.word);
      if (cancelled) return;
      if (cached) {
        setTranslation(cached);
        return;
      }
      const choice = settings.translateModel;
      if (!getApiKeyFor(choice, settings) || !online) return;
      setLoadingT(true);
      try {
        const t = await runTranslate(
          current.word,
          choice,
          settings,
          current.exampleCue ?? current.word,
        );
        if (cancelled) return;
        const trimmed = t.trim().replace(/^["'`]|["'`]$/g, "");
        setTranslation(trimmed);
        void saveWordTranslation(current.word, trimmed);
      } catch (e) {
        if (!cancelled) console.warn("Pre-study translate failed", aiErrorMessage(e));
      } finally {
        if (!cancelled) setLoadingT(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, current?.word, online]);

  const next = () => {
    if (idx + 1 >= candidates.length) {
      toast.success("Pre-study complete!");
      setOpen(false);
      setIdx(0);
    } else {
      setIdx((n) => n + 1);
    }
  };

  const markAndNext = async (status: "learning" | "known" | "ignored") => {
    if (!current) return;
    await setWordStatusGlobal(current.word, status);
    next();
  };

  const addToLeitnerAndNext = async () => {
    if (!current) return;
    if (!translation) {
      toast.error("No translation yet — try again in a moment.");
      return;
    }
    await setWordStatusGlobal(current.word, "learning");
    const folderId = await ensureAutoFolder({ kind: "video", sourceRef: videoId });
    const r = await addCard({
      front: current.word,
      back: translation,
      sourceVideoId: videoId,
      folderId,
      sourceKind: "video",
      exampleSentence: current.exampleCue,
    });
    if (r === "duplicate") toast(`Already in Leitner: ${current.word}`);
    else toast.success(`Added: ${current.word}`);
    next();
  };

  const totalWordsInVideo = useMemo(() => {
    if (!primary?.cues.length) return 0;
    const set = new Set<string>();
    for (const cue of primary.cues) {
      for (const raw of cue.text.split(/\s+/)) {
        const w = cleanWord(raw);
        if (w && w.length >= 3 && !STOPWORDS.has(w)) set.add(w);
      }
    }
    return set.size;
  }, [primary?.id]);

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setOpen(true);
          setIdx(0);
        }}
        disabled={!primary?.cues.length}
        title="Pre-study unfamiliar words from this video"
      >
        <GraduationCap className="h-4 w-4 mr-1.5" />
        Pre-study
      </Button>
    );
  }

  if (!current) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 text-center space-y-4">
          <GraduationCap className="h-10 w-10 text-primary mx-auto" />
          <h3 className="text-lg font-semibold">Nothing to pre-study</h3>
          <p className="text-sm text-muted-foreground">
            Every meaningful word in this video is already marked as Known or Ignored. Great job!
          </p>
          <Button onClick={() => setOpen(false)} className="w-full">
            Close
          </Button>
        </div>
      </div>
    );
  }

  const pct = candidates.length ? Math.round(((idx + 1) / candidates.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-auto">
      <div className="max-w-lg w-full bg-card border border-border rounded-2xl p-5 sm:p-6 space-y-4 my-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Pre-study</h3>
            <span className="text-xs text-muted-foreground">
              {idx + 1} / {candidates.length}
            </span>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Progress value={pct} className="h-1.5" />

        <div className="text-center py-4 space-y-3">
          <div className="flex items-center justify-center gap-2">
            <p className="text-3xl sm:text-4xl font-bold tracking-tight">{current.word}</p>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              onClick={() => speak(current.word)}
            >
              <Volume2 className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Appears <span className="font-semibold text-foreground">{current.count}×</span> in this
            video · {totalWordsInVideo} unique words total
          </p>
          <div className="min-h-[2.5rem] rounded-lg bg-muted/40 px-3 py-2 text-sm" dir="auto">
            {loadingT ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Translating…
              </span>
            ) : translation ? (
              <span className="text-primary font-medium">{translation}</span>
            ) : (
              <span className="text-muted-foreground text-xs">
                {!getApiKeyFor(settings.translateModel, settings)
                  ? "Add an AI API key in Settings to see translations."
                  : !online
                    ? "Offline — translations unavailable."
                    : "No translation yet."}
              </span>
            )}
          </div>
          {current.exampleCue && (
            <p className="text-xs text-muted-foreground italic max-w-md mx-auto">
              "{current.exampleCue}"
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            Current status: {statusLabel(statusMap[current.word] ?? "new")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => markAndNext("known")} variant="outline">
            <Check className="h-4 w-4 mr-1.5 text-green-500" />I know it
          </Button>
          <Button onClick={addToLeitnerAndNext} disabled={!translation}>
            <GraduationCap className="h-4 w-4 mr-1.5" />
            Learn it
          </Button>
          <Button onClick={() => markAndNext("ignored")} variant="ghost" size="sm">
            <EyeOff className="h-3.5 w-3.5 mr-1.5" />
            Ignore
          </Button>
          <Button onClick={next} variant="ghost" size="sm">
            Skip
            <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIdx((n) => Math.max(0, n - 1))}
            disabled={idx === 0}
            className="text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Previous
          </Button>
          <span className="text-[10px] text-muted-foreground">{pct}% through pre-study</span>
        </div>
      </div>
    </div>
  );
}
