/**
 * ElevenLabs sub-panel for the chapter TTS player. Renders the voice/model
 * pickers + Listen button, and once an audio URL exists, the transport bar
 * (slider, play/pause/seek, rate, download, re-generate).
 *
 * State lives in the parent ChapterTTSPlayer — this is a pure presentational
 * component that just wires callbacks. Extracted to shrink the parent file.
 */
import { Link } from "react-router-dom";
import { Download, Loader2, Pause, Play, RefreshCw, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ELEVENLABS_MODELS, ELEVENLABS_VOICES } from "@/lib/elevenLabsTts";
import { memo } from "react";
import { fmtTime as fmt } from "./constants";

interface Props {
  elevenKey: string;
  audioUrl: string | null;
  elevenVoice: string;
  setElevenVoice: (v: string) => void;
  elevenModel: string;
  setElevenModel: (v: string) => void;
  elevenLoading: boolean;
  textLength: number;
  load: () => void;
  download: () => void;

  audioRef: React.RefObject<HTMLAudioElement>;
  rate: number;
  onRate: (r: number) => void;
  onSeek: (v: number[]) => void;
  current: number;
  duration: number;
  setDuration: (d: number) => void;
  setCurrent: (c: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  togglePlay: () => void;
  seekRel: (delta: number) => void;
}

export const ElevenLabsPanel = memo(function ElevenLabsPanel(p: Props) {
  if (!p.elevenKey) {
    return (
      <div className="text-sm text-muted-foreground">
        ElevenLabs نیاز به API key دارد.{" "}
        <Link to="/settings" className="text-primary underline underline-offset-2">
          در تنظیمات → AI اضافه کن
        </Link>
        .
      </div>
    );
  }
  if (!p.audioUrl) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={p.elevenVoice} onValueChange={p.setElevenVoice}>
            <SelectTrigger className="h-9 w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ELEVENLABS_VOICES.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={p.elevenModel} onValueChange={p.setElevenModel}>
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ELEVENLABS_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={p.load} disabled={p.elevenLoading}>
            {p.elevenLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {p.elevenLoading ? "در حال ساخت…" : "Listen"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          ~{Math.ceil(p.textLength / 1000)}k نویسه · multilingual_v2 از انگلیسی و فارسی پشتیبانی
          می‌کند.
        </p>
      </div>
    );
  }
  return (
    <>
      <audio
        ref={p.audioRef}
        src={p.audioUrl}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const a = e.currentTarget;
          p.setDuration(a.duration || 0);
          a.playbackRate = p.rate;
        }}
        onTimeUpdate={(e) => p.setCurrent(e.currentTarget.currentTime)}
        onPlay={() => p.setPlaying(true)}
        onPause={() => p.setPlaying(false)}
        onEnded={() => p.setPlaying(false)}
      />
      <Slider
        value={[p.duration ? p.current / p.duration : 0]}
        min={0}
        max={1}
        step={0.001}
        onValueChange={p.onSeek}
        aria-label="Seek"
      />
      <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
        <span>{fmt(p.current)}</span>
        <span>{fmt(p.duration)}</span>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => p.seekRel(-15)} aria-label="Back 15s">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button size="icon" onClick={p.togglePlay} aria-label={p.playing ? "Pause" : "Play"}>
            {p.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => p.seekRel(15)}
            aria-label="Forward 15s"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(p.rate)} onValueChange={(v) => p.onRate(Number(v))}>
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
          <Button
            variant="ghost"
            size="icon"
            onClick={p.download}
            aria-label="Download"
            title="Download .mp3"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={p.load}
            disabled={p.elevenLoading}
            aria-label="Re-generate"
            title="Re-generate"
          >
            {p.elevenLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </>
  );
});
