/**
 * Scrollable list of generated/cached paragraph audio chunks.
 * Extracted from ChapterTTSPlayer for clarity.
 */
import { Play, Pause } from "lucide-react";

export interface ReadyChunk {
  index: number;
  total: number;
  text: string;
  url: string;
  cached: boolean;
}

interface Props {
  chunks: ReadyChunk[];
  playingIndex: number | null;
  onPlay: (index: number, url: string) => void;
}

export function ParagraphChunkList({ chunks, playingIndex, onPlay }: Props) {
  if (chunks.length === 0) return null;
  const total = chunks[0]?.total ?? chunks.length;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2 space-y-1 max-h-[180px] overflow-y-auto">
      <div className="text-[11px] text-muted-foreground px-1">
        {chunks.length} از {total} پاراگراف آماده — برای پخش روی هرکدام بزن
      </div>
      <div className="space-y-1">
        {chunks.map((c) => {
          const isPlaying = playingIndex === c.index;
          const preview = c.text.trim().slice(0, 70) + (c.text.length > 70 ? "…" : "");
          return (
            <button
              key={c.index}
              type="button"
              onClick={() => onPlay(c.index, c.url)}
              className={
                "w-full flex items-center gap-2 text-left rounded-md px-2 py-1.5 text-xs transition-colors " +
                (isPlaying
                  ? "bg-primary/15 text-foreground"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground")
              }
              title={c.text}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background border border-border">
                {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              </span>
              <span className="tabular-nums text-[10px] opacity-70 shrink-0">{c.index}.</span>
              <span className="truncate flex-1">{preview}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
