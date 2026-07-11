import { useEffect, useState } from "react";
import { Volume2, ExternalLink, Plus, Loader2, Check, GraduationCap, EyeOff } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SubtitleCue } from "@/types";
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

interface Props {
  cue: SubtitleCue;
  /** Current playback time in ms (used to highlight the active word). */
  currentMs: number;
  className?: string;
  videoId?: string;
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

function clean(w: string): string {
  return w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
}

/**
 * Renders a subtitle line with per-word karaoke highlight.
 * Each word is clickable → Leitner popover (translation + add).
 * Requires `cue.words` (Whisper word-level timestamps).
 */
export function KaraokeSubtitle({ cue, currentMs, className, videoId }: Props) {
  const words = cue.words ?? [];
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [anchorRect, setAnchorRect] = useState<{ x: number; y: number } | null>(null);

  const settings = useSettingsStore((s) => s.settings);
  const online = useOnline();
  const holdPlayback = useVideoStore((s) => s.holdPlayback);
  const releasePlayback = useVideoStore((s) => s.releasePlayback);
  const addCard = useLeitnerStore((s) => s.addCard);
  const findByFront = useLeitnerStore((s) => s.findByFront);
  const cards = useLeitnerStore((s) => s.cards);
  void cards;

  const [translation, setTranslation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Pause underlying media while popover is open; resume on close.
  useEffect(() => {
    if (!open) return;
    holdPlayback();
    return () => releasePlayback();
  }, [open, holdPlayback, releasePlayback]);

  const activeWord = activeIdx >= 0 ? (words[activeIdx]?.text ?? "") : "";
  const cleaned = clean(activeWord);
  const inLeitner = !!findByFront(cleaned);
  const hasKey = !!getApiKeyFor(settings.translateModel, settings);

  // Determine which word is currently being spoken (by playback time).
  const playingIdx = (() => {
    if (!words.length) return -1;
    for (let i = 0; i < words.length; i++) {
      if (currentMs >= words[i].startMs && currentMs <= words[i].endMs) return i;
    }
    // No exact match — find last word whose end is past
    for (let i = words.length - 1; i >= 0; i--) {
      if (currentMs >= words[i].endMs) return -1;
    }
    return -1;
  })();

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
      const choice = settings.translateModel;
      if (!getApiKeyFor(choice, settings) || !online) return;
      setLoading(true);
      try {
        const t = await runTranslate(cleaned, choice, settings, cue.text);
        if (cancelled) return;
        const trimmed = t.trim().replace(/^["'`]|["'`]$/g, "");
        setTranslation(trimmed);
        void saveWordTranslation(cleaned, trimmed);
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

  const handleAdd = async () => {
    if (!cleaned) return;
    const back = translation ?? "";
    if (!back) {
      toast.error("No translation yet.");
      return;
    }
    const result = await addCard(cleaned, back, videoId, cue.id);
    if (result === "duplicate") {
      toast(`Already in Leitner: ${cleaned}`);
    } else {
      toast.success(`Added to Leitner: ${cleaned}`);
    }
  };

  const statusMap = useAllWordStatus();
  const { status: activeStatus, cycle: cycleStatus, setStatus } = useWordStatus(cleaned);

  return (
    <>
      <span className={className}>
        {words.map((w, i) => {
          const isPlaying = i === playingIdx;
          const isPast = playingIdx >= 0 && i < playingIdx;
          const wKey = clean(w.text).toLowerCase();
          const st = statusMap[wKey] ?? "new";
          return (
            <span key={i}>
              <button
                type="button"
                onClick={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setAnchorRect({ x: r.left + r.width / 2, y: r.bottom });
                  setActiveIdx(i);
                  setOpen(true);
                }}
                className={cn(
                  "inline-block rounded px-0.5 transition-colors duration-100 cursor-pointer hover:bg-primary/25",
                  statusColorClass(st),
                  isPlaying && "bg-primary text-primary-foreground font-semibold scale-105",
                  !isPlaying && isPast && "opacity-70",
                )}
              >
                {w.text}
              </button>
              {i < words.length - 1 && " "}
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
                  Add Gemini or Groq key in Settings.
                </span>
              ) : !online ? (
                <span className="text-xs text-muted-foreground">Offline.</span>
              ) : (
                <span className="text-xs text-muted-foreground">No translation yet.</span>
              )}
            </div>
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
                title="Toggle ignore"
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
                href={`https://translate.google.com/?sl=en&tl=fa&text=${encodeURIComponent(cleaned || activeWord)}&op=translate`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center text-xs rounded-md h-8 px-2 hover:bg-accent text-muted-foreground"
                title="Open in Google Translate"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
