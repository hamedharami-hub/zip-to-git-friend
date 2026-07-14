import { useCallback, useEffect, useRef, useState } from "react";
import {
  Volume2,
  ExternalLink,
  Plus,
  Loader2,
  Check,
  Languages,
  GraduationCap,
  EyeOff,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settingsStore";
import { useLeitnerStore } from "@/store/leitnerStore";
import { useVideoStore } from "@/store/videoStore";
import { useOnline } from "@/hooks/useOnline";
import { runTranslate, aiErrorMessage, getApiKeyFor } from "@/lib/ai";
import { getWordTranslation, saveWordTranslation } from "@/lib/db";
import {
  useAllWordStatus,
  useWordStatus,
  statusColorClass,
  statusLabel,
} from "@/hooks/useWordStatus";
import { toast } from "sonner";
import { useLeitnerKeys } from "@/hooks/useLeitnerKeys";
import { normalizeFront } from "@/lib/leitner";
import { ensureAutoFolder } from "@/lib/leitnerAutoFolder";

interface Props {
  text: string;
  className?: string;
  /** Word click handler, in case parent wants to react. */
  onWord?: (word: string) => void;
  /** For Leitner card source-tracking. */
  videoId?: string;
  cueId?: string;
  /** Sentence context to bias translations (defaults to `text`). */
  context?: string;
}

/** Splits a string into tokens preserving whitespace and punctuation. */
function tokenize(text: string): Array<{ token: string; isWord: boolean }> {
  const parts = text.split(/(\s+|[^\w'’-]+)/u);
  return parts
    .filter((p) => p.length > 0)
    .map((token) => ({
      token,
      isWord: /[A-Za-z]/.test(token),
    }));
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

function cleanWord(w: string): string {
  return w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
}

/**
 * Renders a subtitle line where each word is a clickable span.
 * Clicking a word opens a popover with AI Persian translation (cached) and
 * a one-click "Add to Leitner" button.
 */
export function InteractiveSubtitle({ text, className, onWord, videoId, cueId, context }: Props) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [activeWord, setActiveWord] = useState<string>("");
  const [anchorRect, setAnchorRect] = useState<{ x: number; y: number } | null>(null);

  const settings = useSettingsStore((s) => s.settings);
  const online = useOnline();
  const holdPlayback = useVideoStore((s) => s.holdPlayback);
  const releasePlayback = useVideoStore((s) => s.releasePlayback);
  const addCard = useLeitnerStore((s) => s.addCard);
  const findByFront = useLeitnerStore((s) => s.findByFront);
  // Subscribe to cards so re-renders happen when adding
  const cards = useLeitnerStore((s) => s.cards);
  void cards;

  const [translation, setTranslation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const cleaned = cleanWord(activeWord);
  const inLeitner = !!findByFront(cleaned);

  // Pause underlying media while popover is open; resume on close / add.
  useEffect(() => {
    if (!open) return;
    holdPlayback();
    return () => releasePlayback();
  }, [open, holdPlayback, releasePlayback]);

  // When a new word is selected, look up cached translation and fetch if missing.
  useEffect(() => {
    if (!open || !cleaned) return;
    let cancelled = false;
    setTranslation(null);
    setLoading(false);
    (async () => {
      const cached = await getWordTranslation(cleaned);
      if (cancelled) return;
      if (cached) {
        setTranslation(cached);
        return;
      }
      // Fetch from AI
      const choice = settings.wordMeaningModel ?? settings.translateModel;
      if (!getApiKeyFor(choice, settings)) {
        return; // Silent — UI shows a hint to add key
      }
      if (!online) return;
      setLoading(true);
      try {
        const t = await runTranslate(cleaned, choice, settings, context ?? text);
        if (cancelled) return;
        const trimmed = t.trim().replace(/^["'`]|["'`]$/g, "");
        setTranslation(trimmed);
        // Cache only when no context (since contextual translations vary).
        if (!context && cleaned === text.trim().toLowerCase()) {
          void saveWordTranslation(cleaned, trimmed);
        } else if (!context) {
          void saveWordTranslation(cleaned, trimmed);
        }
      } catch (e) {
        if (!cancelled) toast.error(aiErrorMessage(e, "Translation failed."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cleaned]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      const target = e.target as HTMLElement;
      const wordEl = target.closest("[data-word]") as HTMLElement | null;
      if (!wordEl) return;
      const word = wordEl.dataset.word ?? "";
      if (!word) return;
      const r = wordEl.getBoundingClientRect();
      setAnchorRect({ x: r.left + r.width / 2, y: r.bottom });
      setActiveWord(word);
      setOpen(true);
      onWord?.(word);
    },
    [onWord],
  );

  const handleAdd = async () => {
    if (!cleaned) return;
    const back = translation ?? "";
    if (!back) {
      toast.error("No translation yet.");
      return;
    }
    const folderId = await ensureAutoFolder({ kind: "video", sourceRef: videoId });
    const result = await addCard({
      front: cleaned,
      back,
      sourceVideoId: videoId,
      sourceCueId: cueId,
      folderId,
      sourceKind: "video",
      exampleSentence: context ?? text,
    });
    if (result === "duplicate") {
      toast(`Already in Leitner: ${cleaned}`);
    } else {
      toast.success(`Added to Leitner: ${cleaned}`);
    }
  };

  const tokens = tokenize(text);
  const activeWordModel = settings.wordMeaningModel ?? settings.translateModel;
  const hasKey = !!getApiKeyFor(activeWordModel, settings);
  const statusMap = useAllWordStatus();
  const leitnerKeys = useLeitnerKeys();
  const { status: activeStatus, cycle: cycleStatus, setStatus } = useWordStatus(cleaned);

  // Find character ranges of multi-word Leitner phrases inside this text so
  // each token that falls inside one gets the yellow highlight too.
  const phraseRanges = (() => {
    const ranges: Array<[number, number]> = [];
    const lower = text.toLowerCase();
    for (const k of leitnerKeys) {
      if (!k.includes(" ")) continue;
      let from = 0;
      while (from <= lower.length - k.length) {
        const idx = lower.indexOf(k, from);
        if (idx === -1) break;
        ranges.push([idx, idx + k.length]);
        from = idx + k.length;
      }
    }
    return ranges;
  })();
  const isInPhraseRange = (start: number, end: number) =>
    phraseRanges.some(([s, e]) => start < e && end > s);

  let cursor = 0;

  return (
    <>
      <span ref={containerRef} className={className} onClick={handleClick}>
        {tokens.map((t, i) => {
          const start = cursor;
          const end = cursor + t.token.length;
          cursor = end;
          if (!t.isWord) return <span key={i}>{t.token}</span>;
          const key = cleanWord(t.token).toLowerCase();
          const st = statusMap[key] ?? "new";
          const inLeitner = leitnerKeys.has(normalizeFront(key)) || isInPhraseRange(start, end);
          return (
            <span
              key={i}
              data-word={t.token}
              data-leitner={inLeitner ? "true" : undefined}
              className={cn(
                "cursor-pointer rounded hover:bg-primary/20 transition-colors px-0.5",
                inLeitner && "leitner-mark",
                statusColorClass(st),
              )}
              title={inLeitner ? "In your Leitner deck" : undefined}
            >
              {t.token}
            </span>
          );
        })}
      </span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            style={{
              position: "fixed",
              left: anchorRect?.x ?? 0,
              top: anchorRect?.y ?? 0,
              width: 0,
              height: 0,
              opacity: 0,
              pointerEvents: "none",
            }}
          />
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="center" side="bottom">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold truncate">{cleaned || activeWord}</p>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => speak(cleaned || activeWord)}
                aria-label="Pronounce"
                title="Pronounce"
              >
                <Volume2 className="h-4 w-4" />
              </Button>
            </div>

            <div
              dir="auto"
              className="min-h-[2.25rem] rounded-md bg-muted/40 px-2 py-1.5 text-sm flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Translating…</span>
                </>
              ) : translation ? (
                <span className="text-primary">{translation}</span>
              ) : !hasKey ? (
                <span className="text-xs text-muted-foreground">
                  Add Gemini or Groq key in Settings to translate.
                </span>
              ) : !online ? (
                <span className="text-xs text-muted-foreground">
                  Offline — cannot translate now.
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">No translation yet.</span>
              )}
            </div>

            {/* Word knowledge state */}
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-muted-foreground mr-auto">
                Status:{" "}
                <span className="text-foreground font-medium">{statusLabel(activeStatus)}</span>
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px] gap-1"
                onClick={cycleStatus}
                title="Cycle: New → Learning → Known"
              >
                <GraduationCap className="h-3 w-3" />
                Cycle
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground"
                onClick={() => setStatus(activeStatus === "ignored" ? "new" : "ignored")}
                title="Toggle ignore (proper noun, name…)"
              >
                <EyeOff className="h-3 w-3" />
                {activeStatus === "ignored" ? "Unignore" : "Ignore"}
              </Button>
            </div>

            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="flex-1"
                onClick={handleAdd}
                disabled={inLeitner || !translation}
                title={inLeitner ? "Already in Leitner" : "Add to Leitner"}
              >
                {inLeitner ? (
                  <>
                    <Check className="h-4 w-4 mr-1.5" /> In Leitner
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1.5" /> Add to Leitner
                  </>
                )}
              </Button>
              <a
                href={`https://translate.google.com/?sl=en&tl=fa&text=${encodeURIComponent(
                  cleaned || activeWord,
                )}&op=translate`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex items-center justify-center text-xs rounded-md h-8 px-2 hover:bg-accent text-muted-foreground",
                )}
                title="Open in Google Translate"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            {translation && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Languages className="h-3 w-3" />
                via {activeWordModel.provider === "gemini" ? "Gemini" : "Groq"} ·{" "}
                {activeWordModel.model}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
