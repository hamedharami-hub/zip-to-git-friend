import { RefObject, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Rewind,
  FastForward,
  Volume2,
  VolumeX,
  MoreVertical,
  Gauge,
  Maximize,
  Minimize,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  videoRef: RefObject<HTMLVideoElement>;
  /** 'panel' (default) renders inside a card; 'overlay' is transparent for use over video. */
  variant?: "panel" | "overlay";
  /** Optional fullscreen toggle handler (must call requestFullscreen synchronously from the click). */
  onToggleFullscreen?: () => void;
  /** Whether the player is currently in fullscreen — controls the icon. */
  isFullscreen?: boolean;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(s: number): string {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function PlayerControls({
  videoRef,
  variant = "panel",
  onToggleFullscreen,
  isFullscreen,
}: Props) {
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  // While the user drags the scrub bar we hold a local value and only seek on commit
  // — seeking on every micro-move causes janky playback on Android Chrome.
  const [scrub, setScrub] = useState<number | null>(null);
  // Remember whether we were playing before the user grabbed the scrub thumb,
  // so we can pause-while-drag and auto-resume on release.
  const wasPlayingBeforeScrubRef = useRef(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => {
      setTime(v.currentTime);
      setDuration(v.duration || 0);
      setPaused(v.paused);
      setVolume(v.volume);
      setMuted(v.muted);
      setSpeed(v.playbackRate);
    };
    sync();
    const events = ["timeupdate", "play", "pause", "volumechange", "ratechange", "loadedmetadata"];
    events.forEach((e) => v.addEventListener(e, sync));
    return () => events.forEach((e) => v.removeEventListener(e, sync));
  }, [videoRef]);

  const v = videoRef.current;
  const isOverlay = variant === "overlay";

  const iconBtn = isOverlay ? "h-8 w-8 text-white hover:bg-white/15" : "h-9 w-9";

  return (
    <div
      className={
        isOverlay
          ? "flex flex-col gap-1.5 px-2 pb-1 text-white"
          : "rounded-lg bg-card border border-border p-3 flex flex-col gap-3"
      }
      onClick={(e) => e.stopPropagation()}
    >
      <Slider
        value={[scrub ?? time]}
        max={duration || 0}
        step={0.1}
        onValueChange={([val]) => {
          if (scrub === null && v) {
            // First movement of the drag — remember playback state and pause.
            wasPlayingBeforeScrubRef.current = !v.paused;
            if (!v.paused) {
              try {
                v.pause();
              } catch {
                /* no-op */
              }
            }
          }
          setScrub(val);
        }}
        onValueCommit={([val]) => {
          if (v) {
            v.currentTime = val;
            if (wasPlayingBeforeScrubRef.current) {
              v.play().catch(() => undefined);
            }
          }
          wasPlayingBeforeScrubRef.current = false;
          setScrub(null);
        }}
      />

      {/* Single compact row: play / prev / next / time | more */}
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className={iconBtn}
          onClick={() => {
            if (!v) return;
            if (v.paused) v.play();
            else v.pause();
          }}
          aria-label={paused ? "Play" : "Pause"}
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={iconBtn}
          onClick={() => v && (v.currentTime = Math.max(0, v.currentTime - 10))}
          aria-label="Skip back 10s"
        >
          <Rewind className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={iconBtn}
          onClick={() => v && (v.currentTime = Math.min(duration, v.currentTime + 10))}
          aria-label="Skip forward 10s"
        >
          <FastForward className="h-4 w-4" />
        </Button>

        <span
          className={`text-xs tabular-nums ml-1 ${
            isOverlay ? "text-white/85" : "text-muted-foreground"
          }`}
        >
          {formatTime(time)} / {formatTime(duration)}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {onToggleFullscreen && (
            <Button
              size="icon"
              variant="ghost"
              className={iconBtn}
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className={iconBtn}
                aria-label="More controls"
                title="Volume & speed"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="top"
              className="w-60 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Volume row */}
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    if (!v) return;
                    // If the audible volume is 0 (either muted or slider at 0),
                    // un-muting alone is silent — also restore a sensible volume.
                    const audible = !v.muted && v.volume > 0;
                    if (audible) {
                      v.muted = true;
                    } else {
                      v.muted = false;
                      if (v.volume === 0) v.volume = 0.7;
                    }
                  }}
                  aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </Button>
                <Slider
                  value={[muted ? 0 : volume]}
                  max={1}
                  step={0.01}
                  onValueChange={([val]) => {
                    if (!v) return;
                    v.volume = val;
                    if (val > 0 && v.muted) v.muted = false;
                  }}
                />
              </div>
              {/* Speed row */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Gauge className="h-3.5 w-3.5" />
                    Speed
                  </span>
                  <span className="font-medium tabular-nums text-foreground">{speed}×</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {SPEEDS.map((sp) => (
                    <Button
                      key={sp}
                      size="sm"
                      variant={speed === sp ? "default" : "outline"}
                      className="h-7 px-1 text-xs"
                      onClick={() => {
                        if (v) v.playbackRate = sp;
                      }}
                    >
                      {sp}×
                    </Button>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
