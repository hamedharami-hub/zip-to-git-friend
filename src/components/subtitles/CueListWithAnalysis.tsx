import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { SubtitleCue } from "@/types";
import { InteractiveSubtitle } from "@/components/ai/InteractiveSubtitle";
import { LazyAnalysisPanel } from "@/components/ai/LazyAnalysisPanel";
import { useVideoStore } from "@/store/videoStore";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  videoId: string;
  cues: SubtitleCue[];
  /** Active cue from playback (for highlighting). */
  activeCueId?: string | null;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface CueRowProps {
  cue: SubtitleCue;
  videoId: string;
  isActive: boolean;
  isSelected: boolean;
  onSelect: (cue: SubtitleCue) => void;
  onReplay: (cue: SubtitleCue) => void;
  setRowRef: (id: string, el: HTMLDivElement | null) => void;
}

const CueRow = memo(function CueRow({
  cue,
  videoId,
  isActive,
  isSelected,
  onSelect,
  onReplay,
  setRowRef,
}: CueRowProps) {
  const handleClick = useCallback(() => onSelect(cue), [cue, onSelect]);
  const handleReplay = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onReplay(cue);
    },
    [cue, onReplay],
  );

  return (
    <div ref={(el) => setRowRef(cue.id, el)} className="border-b border-border/50 last:border-b-0">
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "w-full text-left px-3 py-2 text-sm transition-colors flex gap-3 items-start",
          isSelected
            ? "bg-primary/15 text-foreground"
            : isActive
              ? "bg-primary/10 text-foreground"
              : "hover:bg-muted/50 focus-visible:bg-muted/50",
        )}
        aria-current={isActive ? "true" : undefined}
        aria-expanded={isSelected}
        aria-label={`Jump to cue at ${formatTime(cue.startMs)}`}
      >
        <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-12 pt-0.5">
          {formatTime(cue.startMs)}
        </span>
        <span className="line-clamp-2 flex-1">{cue.text}</span>
      </button>

      {isSelected && (
        <div className="px-3 pb-3 pt-1 bg-primary/5 border-t border-primary/10 space-y-3">
          <div className="flex items-start gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 mt-0.5"
              onClick={handleReplay}
              aria-label="Replay this cue"
              title="Replay this cue"
            >
              <Volume2 className="h-4 w-4" />
            </Button>
            <InteractiveSubtitle
              text={cue.text}
              videoId={videoId}
              cueId={cue.id}
              context={cue.text}
              className="text-base leading-relaxed font-medium flex-1"
            />
          </div>
          <LazyAnalysisPanel videoId={videoId} cue={cue} autoRun={true} showTranslate />
        </div>
      )}
    </div>
  );
});

/**
 * Cue list where clicking a cue:
 *  - Seeks the video to that cue's start time and plays it.
 *  - Reveals an inline panel directly UNDER that cue with:
 *      • the interactive English subtitle (clickable words → Persian + Leitner)
 *      • the AnalysisPanel (Persian translation + vocabulary + idioms with "Add to Leitner")
 *
 * Designed for typical subtitle sizes (a few hundred cues). Large transcripts still render
 * fine because each row is cheap; only the *expanded* row mounts the analysis panel.
 */
export function CueListWithAnalysis({ videoId, cues, activeCueId }: Props) {
  const requestSeek = useVideoStore((s) => s.requestSeek);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleSelect = useCallback(
    (cue: SubtitleCue) => {
      setSelectedId(cue.id);
      requestSeek(cue.startMs / 1000, true);
    },
    [requestSeek],
  );

  const handleReplay = useCallback(
    (cue: SubtitleCue) => {
      requestSeek(cue.startMs / 1000, true);
    },
    [requestSeek],
  );

  const setRowRef = useCallback((id: string, el: HTMLDivElement | null) => {
    rowRefs.current[id] = el;
  }, []);

  // Auto-scroll the active playback cue into view (only when nothing is manually selected).
  useEffect(() => {
    if (selectedId || !activeCueId) return;
    const el = rowRefs.current[activeCueId];
    if (el && containerRef.current) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeCueId, selectedId]);

  if (cues.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">No cues to show.</p>;
  }

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto rounded border border-border"
      style={{ maxHeight: 480 }}
    >
      {cues.map((cue) => (
        <CueRow
          key={cue.id}
          cue={cue}
          videoId={videoId}
          isActive={activeCueId === cue.id}
          isSelected={selectedId === cue.id}
          onSelect={handleSelect}
          onReplay={handleReplay}
          setRowRef={setRowRef}
        />
      ))}
    </div>
  );
}
