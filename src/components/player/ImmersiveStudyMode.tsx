import { memo, useEffect, useRef, useState } from "react";
import { X, Play, Pause, ChevronLeft, ChevronRight } from "lucide-react";
import { useVideoStore } from "@/store/videoStore";
import { useSubtitleStore } from "@/store/subtitleStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useActiveCues } from "@/hooks/useVideoSync";
import { InteractiveSubtitle } from "@/components/ai/InteractiveSubtitle";
import { KaraokeSubtitle } from "@/components/subtitles/KaraokeSubtitle";
import { AnalysisPanel } from "@/components/ai/AnalysisPanel";
import { Button } from "@/components/ui/button";
import { BlindListenBar } from "./BlindListenBar";
import { useBlindListen } from "@/hooks/useBlindListen";

interface Props {
  videoId: string;
  onExit: () => void;
}

/**
 * Immersive full-screen study mode:
 * - Video fills the background.
 * - Bottom glass bar shows English subtitle (clickable words → Leitner popover),
 *   Persian subtitle, and the AI Analysis panel — scrollable.
 * - Double-tap zones: middle = play/pause, right 25% = next cue, left 25% = previous cue.
 * - A small "X" exits.
 */
export const ImmersiveStudyMode = memo(function ImmersiveStudyMode({ videoId, onExit }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const current = useVideoStore((s) => s.current);
  const setCurrentTime = useVideoStore((s) => s.setCurrentTime);
  const setIsPlaying = useVideoStore((s) => s.setIsPlaying);
  const updateCurrent = useVideoStore((s) => s.updateCurrent);
  const registerMedia = useVideoStore((s) => s.registerMedia);
  const primary = useSubtitleStore((s) => s.primary);
  const secondary = useSubtitleStore((s) => s.secondary);
  const autoShowAnalysis = useSettingsStore((s) => s.settings.autoShowAnalysis);

  const { activePrimary, activeSecondary } = useActiveCues(videoRef.current, primary, secondary);
  const blind = useBlindListen(videoRef.current, activePrimary, primary?.cues ?? []);
  const hideSubtitleText = blind.enabled && !blind.isRevealed;

  const [feedback, setFeedback] = useState<"play" | "pause" | "prev" | "next" | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const feedbackTimerRef = useRef<number | null>(null);
  const tapTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; zone: "left" | "mid" | "right" } | null>(null);

  // Initialize from saved state.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !current) return;
    v.volume = current.volume;
    v.playbackRate = current.playbackSpeed;
    if (current.lastPosition && current.lastPosition < (current.duration || Infinity)) {
      try {
        v.currentTime = current.lastPosition;
      } catch {
        /* no-op */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable store refs; dynamic deps handled internally
  }, [current?.id]);

  // Register media globally so popovers can pause/resume it.
  useEffect(() => {
    registerMedia(videoRef.current);
    return () => registerMedia(null);
  }, [registerMedia, current?.id]);

  // Periodic save.
  useEffect(() => {
    if (!current) return;
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (!v) return;
      updateCurrent({
        lastPosition: v.currentTime,
        volume: v.volume,
        playbackSpeed: v.playbackRate,
      });
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable store refs; dynamic deps handled internally
  }, [current?.id, updateCurrent]);

  // Lock body scroll while immersive.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!current) return null;

  const flashFeedback = (kind: "play" | "pause" | "prev" | "next") => {
    setFeedback(kind);
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 500);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => undefined);
      flashFeedback("play");
    } else {
      v.pause();
      flashFeedback("pause");
    }
  };

  const jumpToCue = (direction: "prev" | "next") => {
    const v = videoRef.current;
    const cues = primary?.cues ?? [];
    if (!v || cues.length === 0) return;
    const tMs = v.currentTime * 1000;
    let target: (typeof cues)[number] | undefined;
    if (direction === "next") {
      target = cues.find((c) => c.startMs > tMs + 50);
    } else {
      for (let i = cues.length - 1; i >= 0; i--) {
        if (cues[i].startMs < tMs - 600) {
          target = cues[i];
          break;
        }
      }
      if (!target) target = cues[0];
    }
    if (target) {
      try {
        v.currentTime = target.startMs / 1000;
      } catch {
        /* no-op */
      }
    }
  };

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const zone: "left" | "mid" | "right" = ratio < 0.25 ? "left" : ratio > 0.75 ? "right" : "mid";

    const now = Date.now();
    const last = lastTapRef.current;

    if (last && now - last.time < 300 && last.zone === zone) {
      // Double tap.
      if (tapTimerRef.current) {
        window.clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      lastTapRef.current = null;
      if (zone === "mid") togglePlay();
      else if (zone === "right") {
        jumpToCue("next");
        flashFeedback("next");
      } else {
        jumpToCue("prev");
        flashFeedback("prev");
      }
      return;
    }
    lastTapRef.current = { time: now, zone };
    if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    tapTimerRef.current = window.setTimeout(() => {
      lastTapRef.current = null;
      tapTimerRef.current = null;
    }, 280);
  };

  // Reserve a fixed strip at the bottom for ~4 lines of EN+FA subtitles.
  // Using flex column so the video does NOT extend behind the subtitle area;
  // it sits in the top region with object-contain and proper aspect ratio,
  // while subtitles get a dedicated, full-width compact bar below.

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden flex flex-col">
      {/* ── Top: video region ── */}
      <div className="relative flex-1 min-h-0 bg-black">
        <video
          ref={videoRef}
          src={current.blobUrl}
          className="absolute inset-0 w-full h-full object-contain"
          onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          playsInline
        />

        {/* Tap layer covers the video only (bottom strip stays interactive). */}
        <div
          className="absolute inset-0 z-10"
          onClick={handleTap}
          aria-label="Video gesture area"
        />

        {/* Exit button */}
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2 right-2 z-30 text-white hover:bg-white/15 h-9 w-9"
          onClick={onExit}
          aria-label="Exit immersive mode"
        >
          <X className="h-5 w-5" />
        </Button>

        {/* Gesture feedback flash */}
        {feedback && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="rounded-full bg-black/55 text-white p-4 animate-in fade-in zoom-in duration-150">
              {feedback === "play" && <Play className="h-8 w-8" />}
              {feedback === "pause" && <Pause className="h-8 w-8" />}
              {feedback === "next" && <ChevronRight className="h-8 w-8" />}
              {feedback === "prev" && <ChevronLeft className="h-8 w-8" />}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom: dedicated subtitle strip (≈4 lines) ── */}
      <div className="shrink-0 bg-black/85 backdrop-blur-md border-t border-white/10 text-white">
        <div className="px-3 py-2 w-full max-w-none space-y-1">
          {activePrimary ? (
            hideSubtitleText ? (
              <p className="text-center tracking-widest text-white/50 text-base select-none leading-tight">
                ••• ••• •••
              </p>
            ) : activePrimary.words && activePrimary.words.length > 0 ? (
              <KaraokeSubtitle
                cue={activePrimary}
                currentMs={(videoRef.current?.currentTime ?? 0) * 1000}
                videoId={videoId}
                className="block text-center text-[15px] sm:text-base font-medium leading-tight tracking-tight"
              />
            ) : (
              <InteractiveSubtitle
                text={activePrimary.text}
                context={activePrimary.text}
                videoId={videoId}
                cueId={activePrimary.id}
                className="block text-center text-[15px] sm:text-base font-medium leading-tight tracking-tight"
              />
            )
          ) : (
            <p className="text-center text-white/50 text-xs leading-tight">— no subtitle —</p>
          )}

          {activeSecondary && !hideSubtitleText && (
            <p
              dir="auto"
              className="text-center text-[14px] sm:text-[15px] leading-tight tracking-tight"
              style={{ color: "hsl(var(--primary))" }}
            >
              {activeSecondary.text}
            </p>
          )}
        </div>

        {/* Compact action row: blind-listen + analyse toggle */}
        <div className="px-3 pb-1.5 flex items-center gap-2 justify-between">
          <div className="flex-1 min-w-0">
            <BlindListenBar
              enabled={blind.enabled}
              revealed={blind.isRevealed}
              onReveal={blind.reveal}
              onNext={blind.next}
              variant="overlay"
            />
          </div>
          {activePrimary && !hideSubtitleText && (
            <button
              type="button"
              onClick={() => setAnalysisOpen((v) => !v)}
              className="text-[11px] text-white/80 hover:text-white px-2 py-0.5 rounded border border-white/15 shrink-0"
            >
              {analysisOpen ? "بستن تحلیل" : "تحلیل"}
            </button>
          )}
        </div>

        {/* Optional collapsible analysis (does not steal subtitle space). */}
        {analysisOpen && activePrimary && !hideSubtitleText && (
          <div className="border-t border-white/10 max-h-[35vh] overflow-y-auto px-3 py-2">
            <div className="rounded-md bg-white/5 border border-white/10 p-2.5">
              <AnalysisPanel
                videoId={videoId}
                cue={activePrimary}
                autoRun={autoShowAnalysis}
                showTranslate={!activeSecondary}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
