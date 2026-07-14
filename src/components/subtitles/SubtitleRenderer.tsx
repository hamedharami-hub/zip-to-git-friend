import type { SubtitleCue } from "@/types";
import { useSettingsStore } from "@/store/settingsStore";
import { useVideoStore } from "@/store/videoStore";
import { useLeitnerStore } from "@/store/leitnerStore";
import { cn } from "@/lib/utils";
import { InteractiveSubtitle } from "@/components/ai/InteractiveSubtitle";
import { KaraokeSubtitle } from "@/components/subtitles/KaraokeSubtitle";
import { useCachedTranslation } from "@/hooks/useCachedTranslation";
import { Button } from "@/components/ui/button";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { useMemo } from "react";

interface Props {
  primaryCue: SubtitleCue | null;
  secondaryCue: SubtitleCue | null;
  variant: "overlay" | "panel";
  /** When true, the primary cue text is rendered with clickable words. */
  interactivePrimary?: boolean;
  /** Source video for Leitner attribution. */
  videoId?: string;
  /** When true, hide the actual subtitle text (blind-listen mode). */
  hideText?: boolean;
}

const FONT_SIZE: Record<string, string> = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-2xl",
  xl: "text-3xl",
};

/** Encode a cue id + start time into the LeitnerCard.sourceCueId field so
 *  clicking the saved card later jumps back to that timestamp. */
function encodeCueRef(cueId: string, startMs: number): string {
  return `${cueId}@${Math.round(startMs)}`;
}

export function SubtitleRenderer({
  primaryCue,
  secondaryCue,
  variant,
  interactivePrimary = false,
  videoId,
  hideText = false,
}: Props) {
  const fontSize = useSettingsStore((s) => s.settings.fontSize);
  const showInlineTranslation = useSettingsStore((s) => s.settings.showInlineTranslation);
  const sizeClass = FONT_SIZE[fontSize];
  const currentTime = useVideoStore((s) => s.currentTime);
  const currentMs = currentTime * 1000;

  const cards = useLeitnerStore((s) => s.cards);
  const addCard = useLeitnerStore((s) => s.addCard);

  const overlayText =
    "inline-block px-3 py-1 rounded subtitle-overlay-bg whitespace-pre-wrap text-center";
  const panelText = "whitespace-pre-wrap text-center";

  const baseClass = variant === "overlay" ? overlayText : panelText;

  // Inline translation from cache: only when no secondary track loaded,
  // user enabled it, and we're showing the primary cue.
  const cachedTranslation = useCachedTranslation(videoId, primaryCue?.id);
  const inlineTranslation =
    showInlineTranslation && !secondaryCue && !hideText && cachedTranslation;

  // Has this cue already been saved as a Leitner card?
  const savedCard = useMemo(() => {
    if (!primaryCue || !videoId) return null;
    return (
      cards.find(
        (c) =>
          c.sourceVideoId === videoId &&
          (c.sourceCueId === primaryCue.id || c.sourceCueId?.startsWith(`${primaryCue.id}@`)),
      ) ?? null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable store refs; dynamic deps handled internally
  }, [cards, primaryCue?.id, videoId]);

  if (!primaryCue && !secondaryCue) {
    if (variant === "panel") {
      return <p className="text-center text-muted-foreground text-sm">— no subtitle —</p>;
    }
    return null;
  }

  const hasWords = !!(primaryCue && primaryCue.words && primaryCue.words.length > 0);

  const maskedText = "•••  •••  •••";

  const handleSaveSentence = async () => {
    if (!primaryCue) return;
    const front = primaryCue.text.trim();
    if (!front) return;
    const back = (cachedTranslation ?? secondaryCue?.text ?? "").trim();
    const result = await addCard(
      front,
      back || "—",
      videoId,
      encodeCueRef(primaryCue.id, primaryCue.startMs),
    );
    if (result === "duplicate") {
      toast.info("Sentence already saved.");
    } else {
      toast.success(
        back ? "Sentence saved with translation." : "Sentence saved (no translation yet).",
      );
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {primaryCue &&
        (hideText ? (
          <div
            className={cn(
              baseClass,
              sizeClass,
              "font-medium tracking-widest text-muted-foreground select-none",
            )}
            aria-label="Subtitle hidden — blind listen mode"
          >
            {maskedText}
          </div>
        ) : interactivePrimary && hasWords ? (
          <KaraokeSubtitle
            cue={primaryCue}
            currentMs={currentMs}
            videoId={videoId}
            className={cn(baseClass, sizeClass, "font-medium")}
          />
        ) : interactivePrimary ? (
          <InteractiveSubtitle
            text={primaryCue.text}
            context={primaryCue.text}
            videoId={videoId}
            cueId={primaryCue.id}
            className={cn(baseClass, sizeClass, "font-medium")}
          />
        ) : (
          <div className={cn(baseClass, sizeClass, "font-medium")}>{primaryCue.text}</div>
        ))}

      {/* Inline cached translation — dual-subtitle line. */}
      {inlineTranslation && (
        <div
          dir="auto"
          className={cn(
            baseClass,
            sizeClass,
            "text-primary/90 italic",
            // Slightly smaller on overlay so it doesn't dominate the frame.
            variant === "overlay" && "text-base sm:text-lg not-italic",
          )}
        >
          {cachedTranslation}
        </div>
      )}

      {secondaryCue && !hideText && (
        <div
          dir="auto"
          className={cn(baseClass, sizeClass, variant === "panel" ? "text-primary" : "")}
        >
          {secondaryCue.text}
        </div>
      )}

      {/* Save-as-flashcard control — only on the panel variant (not overlay). */}
      {variant === "panel" && primaryCue && interactivePrimary && videoId && !hideText && (
        <Button
          type="button"
          size="sm"
          variant={savedCard ? "secondary" : "ghost"}
          className="h-7 text-xs gap-1.5"
          onClick={handleSaveSentence}
          disabled={!!savedCard}
          aria-label={savedCard ? "Sentence already saved" : "Save sentence as flashcard"}
          title={savedCard ? "Saved to Leitner" : "Save sentence to Leitner"}
        >
          {savedCard ? (
            <>
              <BookmarkCheck className="h-3.5 w-3.5" /> Saved
            </>
          ) : (
            <>
              <Bookmark className="h-3.5 w-3.5" /> Save sentence
            </>
          )}
        </Button>
      )}
    </div>
  );
}
