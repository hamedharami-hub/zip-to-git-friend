import { memo } from "react";
import { Link } from "react-router-dom";
import {
  Loader2,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Download,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { GeminiVoicePicker } from "./GeminiVoicePicker";
import type { GeminiTtsVoice } from "@/lib/geminiTts";
import { ParagraphChunkList, type ReadyChunk } from "./ParagraphChunkList";

interface Props {
  apiKey: string | null;
  text: string;
  voice: string;
  setVoice: (v: string) => void;
  loading: boolean;
  chunkInfo: { done: number; total: number } | null;
  progress: number;
  readyChunks: ReadyChunk[];
  playingChunk: number | null;
  playChunk: (idx: number, url: string) => void;
  audioUrl: string | null;
  audioRef: React.RefObject<HTMLAudioElement>;
  current: number;
  duration: number;
  rate: number;
  playing: boolean;
  onRate: (r: number) => void;
  onSeek: (v: number[]) => void;
  togglePlay: () => void;
  seekRel: (s: number) => void;
  setDuration: (d: number) => void;
  setCurrent: (c: number) => void;
  setPlaying: (p: boolean) => void;
  loadOrSynthesize: (force?: boolean) => void | Promise<void>;
  handleDownload: () => void;
  handleClear: () => void;
  fmt: (s: number) => string;
}

export const GeminiTtsPanel = memo(function GeminiTtsPanel({
  apiKey,
  text,
  voice,
  setVoice,
  loading,
  chunkInfo,
  progress,
  readyChunks,
  playingChunk,
  playChunk,
  audioUrl,
  audioRef,
  current,
  duration,
  rate,
  playing,
  onRate,
  onSeek,
  togglePlay,
  seekRel,
  setDuration,
  setCurrent,
  setPlaying,
  loadOrSynthesize,
  handleDownload,
  handleClear,
  fmt,
}: Props) {
  if (!apiKey) {
    return (
      <div className="text-sm text-muted-foreground">
        Gemini TTS needs an API key.{" "}
        <Link to="/settings" className="text-primary underline underline-offset-2">
          Add it in Settings → AI
        </Link>
        .
      </div>
    );
  }

  return (
    <>
      {!audioUrl ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <GeminiVoicePicker voice={voice} onChange={setVoice} size="lg" />
            <Button onClick={() => loadOrSynthesize(false)} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {loading ? "Generating…" : "Listen"}
            </Button>
          </div>
          {loading && chunkInfo && (
            <div className="space-y-1">
              <Progress value={progress * 100} />
              <p className="text-xs text-muted-foreground">
                پاراگراف {chunkInfo.done} از {chunkInfo.total} — {Math.round(progress * 100)}٪
              </p>
            </div>
          )}
          {readyChunks.length > 0 && (
            <ParagraphChunkList
              chunks={readyChunks}
              playingIndex={playingChunk}
              onPlay={playChunk}
            />
          )}
          <p className="text-xs text-muted-foreground">
            ~{Math.ceil(text.length / 1000)}k نویسه · هر پاراگراف بلافاصله بعد از ساخت قابل پخش است
            و در حافظهٔ آفلاین می‌ماند.
          </p>
        </div>
      ) : (
        <>
          {readyChunks.length > 0 && (
            <ParagraphChunkList
              chunks={readyChunks}
              playingIndex={playingChunk}
              onPlay={playChunk}
            />
          )}
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="metadata"
            onLoadedMetadata={(e) => {
              const a = e.currentTarget;
              setDuration(a.duration || 0);
              a.playbackRate = rate;
            }}
            onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />

          <Slider
            value={[duration ? current / duration : 0]}
            min={0}
            max={1}
            step={0.001}
            onValueChange={onSeek}
            aria-label="Seek"
          />
          <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
            <span>{fmt(current)}</span>
            <span>{fmt(duration)}</span>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => seekRel(-15)}
                aria-label="Back 15s"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button size="icon" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => seekRel(15)}
                aria-label="Forward 15s"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Select value={String(rate)} onValueChange={(v) => onRate(Number(v))}>
                <SelectTrigger className="h-8 w-[78px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                    <SelectItem key={r} value={String(r)}>
                      {r}×
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <GeminiVoicePicker voice={voice} onChange={setVoice} size="sm" />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDownload}
                aria-label="Download audio"
                title="Download .wav"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => loadOrSynthesize(true)}
                disabled={loading}
                aria-label="Re-generate"
                title="Re-generate"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClear}
                aria-label="Delete cached audio"
                title="Delete cached audio"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
});
