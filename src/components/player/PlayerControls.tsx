import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Maximize,
  Minimize,
  Settings2,
  Gauge,
} from "lucide-react";

interface PlayerControlsProps {
  videoEl: HTMLVideoElement | null;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  onToggleSettings?: () => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function PlayerControls({
  videoEl,
  onToggleFullscreen,
  isFullscreen,
  onToggleSettings,
}: PlayerControlsProps) {
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [scrub, setScrub] = useState<number | null>(null);

  useEffect(() => {
    const v = videoEl;
    if (!v) return;

    const sync = () => {
      setTime(v.currentTime ?? 0);
      setDuration(Number.isFinite(v.duration) ? v.duration : 0);
      setPaused(v.paused);
      setVolume(v.volume);
      setMuted(v.muted);
      setSpeed(v.playbackRate || 1);
    };

    sync();
    const events: (keyof HTMLMediaElementEventMap)[] = [
      "timeupdate",
      "play",
      "pause",
      "volumechange",
      "ratechange",
      "loadedmetadata",
      "durationchange",
      "canplay",
    ];
    events.forEach((e) => v.addEventListener(e, sync));
    return () => events.forEach((e) => v.removeEventListener(e, sync));
  }, [videoEl]);

  const formatTime = (t: number) => {
    if (!Number.isFinite(t) || t < 0) return "0:00";
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const v = videoEl;

  const handlePlayPause = () => {
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => undefined);
    } else {
      v.pause();
    }
  };

  const handleSeek = (value: number[]) => {
    if (!v) return;
    const newTime = value[0];
    v.currentTime = newTime;
    setTime(newTime);
  };

  const handleSkipBack = () => {
    if (!v) return;
    v.currentTime = Math.max(0, v.currentTime - 10);
  };

  const handleSkipForward = () => {
    if (!v) return;
    v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10);
  };

  const handleVolume = (value: number[]) => {
    if (!v) return;
    v.volume = value[0];
    if (value[0] > 0 && v.muted) v.muted = false;
  };

  const toggleMute = () => {
    if (!v) return;
    v.muted = !v.muted;
    if (v.muted) v.volume = 0;
    else if (v.volume === 0) v.volume = 1;
  };

  const cycleSpeed = () => {
    if (!v) return;
    const idx = SPEEDS.indexOf(v.playbackRate) || 2;
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    v.playbackRate = next;
  };

  const displayTime = scrub ?? time;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;

  // Don't render interactive controls until we have a real media element.
  if (!v) {
    return (
      <div className="w-full h-12 flex items-center justify-center text-xs text-white/60">
        در حال بارگذاری ویدیو…
      </div>
    );
  }

  return (
    <div className="w-full bg-gradient-to-t from-black/90 to-transparent px-3 py-2 text-white">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white hover:bg-white/10"
          onClick={handlePlayPause}
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white hover:bg-white/10"
          onClick={handleSkipBack}
        >
          <SkipBack className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white hover:bg-white/10"
          onClick={handleSkipForward}
        >
          <SkipForward className="h-4 w-4" />
        </Button>

        <div className="text-xs font-medium tabular-nums min-w-[4.5rem] text-center">
          {formatTime(displayTime)} / {formatTime(duration)}
        </div>

        <div className="flex-1 flex items-center px-2">
          <Slider
            value={[displayTime]}
            min={0}
            max={Math.max(duration || 0, 0.01)}
            step={0.1}
            onValueChange={(val) => setScrub(val[0])}
            onValueCommit={(val) => {
              setScrub(null);
              handleSeek(val);
            }}
            className="cursor-pointer"
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white hover:bg-white/10"
          onClick={toggleMute}
        >
          {muted || volume === 0 ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>

        <div className="w-20 hidden sm:block">
          <Slider
            value={[muted ? 0 : volume]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={handleVolume}
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-white hover:bg-white/10 gap-1"
          onClick={cycleSpeed}
        >
          <Gauge className="h-3.5 w-3.5" />
          {speed}x
        </Button>

        {onToggleSettings && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/10"
            onClick={onToggleSettings}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white hover:bg-white/10"
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </Button>
      </div>

      <div className="w-full bg-white/20 h-1 mt-1 rounded overflow-hidden">
        <div
          className="bg-primary h-full transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export default PlayerControls;
