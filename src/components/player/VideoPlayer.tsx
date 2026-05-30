import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useVideoStore } from '@/store/videoStore';
import { useSubtitleStore } from '@/store/subtitleStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useLoopStore } from '@/store/loopStore';
import { useActiveCues } from '@/hooks/useVideoSync';
import { usePlayerHotkeys } from '@/hooks/useHotkeys';
import { useLoop } from '@/hooks/useLoop';
import { useAutoPauseAtCueEnd } from '@/hooks/useAutoPauseAtCueEnd';
import { useListeningTracker } from '@/hooks/useListeningTracker';
import { PlayerControls } from './PlayerControls';
import { LoopControls } from './LoopControls';
import { BlindListenBar } from './BlindListenBar';
import { useBlindListen } from '@/hooks/useBlindListen';
import { SubtitleRenderer } from '@/components/subtitles/SubtitleRenderer';
import { AnalysisPanel } from '@/components/ai/AnalysisPanel';
import { ShadowingPanel } from '@/components/player/ShadowingPanel';
import { Repeat, ChevronLeft, ChevronRight, Play, Pause, Maximize2, PauseCircle, Loader2 } from 'lucide-react';
import { useMediaSession } from '@/hooks/useMediaSession';

interface VideoPlayerProps {
  videoId?: string;
  onEnterImmersive?: () => void;
}

export function VideoPlayer({ videoId, onEnterImmersive }: VideoPlayerProps = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const current = useVideoStore((s) => s.current);
  const setCurrentTime = useVideoStore((s) => s.setCurrentTime);
  const setIsPlaying = useVideoStore((s) => s.setIsPlaying);
  const updateCurrent = useVideoStore((s) => s.updateCurrent);
  const seekRequest = useVideoStore((s) => s.seekRequest);
  const registerMedia = useVideoStore((s) => s.registerMedia);
  const primary = useSubtitleStore((s) => s.primary);
  const secondary = useSubtitleStore((s) => s.secondary);
  const displayMode = useSettingsStore((s) => s.settings.displayMode);
  const autoShowAnalysis = useSettingsStore((s) => s.settings.autoShowAnalysis);
  const autoPauseAtCueEnd = useSettingsStore((s) => s.settings.autoPauseAtCueEnd);
  const updateSettings = useSettingsStore((s) => s.update);
  const loopEnabled = useLoopStore((s) => s.config.enabled);
  const loopVisibility = useLoopStore((s) => s.visibility);
  const loopIter = useLoopStore((s) => s.config.currentIteration);
  const loopMax = useLoopStore((s) => s.config.maxIterations);
  const stopLoop = useLoopStore((s) => s.stopLoop);

  const [controlsVisible, setControlsVisible] = useState(true);
  const [feedback, setFeedback] = useState<'play' | 'pause' | 'prev' | 'next' | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const tapTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; zone: 'left' | 'mid' | 'right' } | null>(null);
  const lastTimeEmitRef = useRef(0);
  /** Pending external seek (seconds) — applied once metadata is loaded. */
  const pendingSeekRef = useRef<{ time: number; play: boolean } | null>(null);

  const { activePrimary, activeSecondary } = useActiveCues(videoRef.current, primary, secondary);
  useLoop(videoRef);
  // Auto-pause at cue end (suppressed when loop is running so loop owns playback).
  useAutoPauseAtCueEnd(videoRef.current, activePrimary, {
    enabled: autoPauseAtCueEnd,
    suppressed: loopEnabled,
  });
  const blind = useBlindListen(videoRef.current, activePrimary, primary?.cues ?? []);
  useListeningTracker(videoRef.current);

  // Mask cues based on loop visibility for the current iteration.
  const showPrimary = !loopEnabled || loopVisibility === 'both' || loopVisibility === 'primary';
  const showSecondary = !loopEnabled || loopVisibility === 'both' || loopVisibility === 'secondary';
  const visiblePrimary = showPrimary ? activePrimary : null;
  const visibleSecondary = showSecondary ? activeSecondary : null;
  const hideSubtitleText = blind.enabled && !blind.isRevealed;

  // Initialize from saved state
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !current) return;
    v.volume = current.volume;
    v.playbackRate = current.playbackSpeed;
    if (current.lastPosition && current.lastPosition < (current.duration || Infinity)) {
      try {
        v.currentTime = current.lastPosition;
      } catch {}
    }
  }, [current?.id]);

  // Initial controls hint — show for 2.5s on mount so first-time users see them.
  useEffect(() => {
    setControlsVisible(true);
    const t = window.setTimeout(() => setControlsVisible(false), 2500);
    return () => window.clearTimeout(t);
  }, [current?.id]);

  // Buffering / error listeners — surface a spinner and toast bad files.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onCanPlay = () => {
      setIsBuffering(false);
      // Apply any seek the user requested before metadata was ready.
      const pending = pendingSeekRef.current;
      if (pending) {
        try { v.currentTime = pending.time; } catch {}
        if (pending.play) v.play().catch(() => {});
        pendingSeekRef.current = null;
      }
    };
    const onSeeking = () => setIsBuffering(true);
    const onSeeked = () => setIsBuffering(false);
    const onStalled = () => setIsBuffering(true);
    const onError = () => {
      setIsBuffering(false);
      const err = v.error;
      const code = err?.code;
      let msg = 'فایل ویدیو قابل پخش نیست.';
      if (code === 2) msg = 'خطای شبکه هنگام بارگذاری ویدیو.';
      else if (code === 3) msg = 'فایل ویدیو خراب یا قابل decode نیست.';
      else if (code === 4) msg = 'فرمت ویدیو پشتیبانی نمی‌شود.';
      toast.error(msg);
    };
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('canplay', onCanPlay);
    v.addEventListener('seeking', onSeeking);
    v.addEventListener('seeked', onSeeked);
    v.addEventListener('stalled', onStalled);
    v.addEventListener('error', onError);
    return () => {
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('canplay', onCanPlay);
      v.removeEventListener('seeking', onSeeking);
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('stalled', onStalled);
      v.removeEventListener('error', onError);
    };
  }, [current?.id]);

  // Register the active media element so popovers can pause/resume it globally.
  useEffect(() => {
    registerMedia(videoRef.current);
    return () => registerMedia(null);
  }, [registerMedia, current?.id]);

  // Wire OS lock-screen / Bluetooth / AirPods controls so audio keeps
  // playing in the background even when the screen is off.
  useMediaSession(
    videoRef.current,
    current
      ? {
          title: current.title,
          artist: current.mediaType === 'audio' ? 'Podcast' : 'Video',
          album: 'Language Learning Player',
        }
      : null,
    {
      onPlay: () => videoRef.current?.play().catch(() => {}),
      onPause: () => videoRef.current?.pause(),
      onSeekBackward: (s) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = Math.max(0, v.currentTime - Math.max(5, s));
      },
      onSeekForward: (s) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = Math.min(v.duration || 0, v.currentTime + Math.max(5, s));
      },
      onPreviousTrack: () => {
        const v = videoRef.current;
        const cues = primary?.cues ?? [];
        if (!v || cues.length === 0) return;
        const tMs = v.currentTime * 1000;
        let target = cues[0];
        for (let i = cues.length - 1; i >= 0; i--) {
          if (cues[i].startMs < tMs - 600) {
            target = cues[i];
            break;
          }
        }
        try {
          v.currentTime = target.startMs / 1000;
        } catch {}
      },
      onNextTrack: () => {
        const v = videoRef.current;
        const cues = primary?.cues ?? [];
        if (!v || cues.length === 0) return;
        const tMs = v.currentTime * 1000;
        const target = cues.find((c) => c.startMs > tMs + 50);
        if (!target) return;
        try {
          v.currentTime = target.startMs / 1000;
        } catch {}
      },
    },
    !!current,
  );

  // Periodic save (every 5s) + immediate flush on pause / tab-hide / unload
  // so the last position is never more than a few seconds stale even if the
  // user kills the tab or backgrounds the app.
  useEffect(() => {
    if (!current) return;
    const flush = () => {
      const v = videoRef.current;
      if (!v) return;
      updateCurrent({
        lastPosition: v.currentTime,
        volume: v.volume,
        playbackSpeed: v.playbackRate,
      });
    };
    const id = window.setInterval(flush, 5000);
    const v = videoRef.current;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    v?.addEventListener('pause', flush);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      clearInterval(id);
      v?.removeEventListener('pause', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [current?.id, updateCurrent]);

  // Respond to external seek requests (e.g. clicking a cue in the list).
  // If metadata isn't ready yet, defer until `canplay` fires.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !seekRequest) return;
    if (v.readyState < 1) {
      pendingSeekRef.current = { time: Math.max(0, seekRequest.time), play: !!seekRequest.play };
      return;
    }
    try {
      v.currentTime = Math.max(0, seekRequest.time);
    } catch {}
    if (seekRequest.play) {
      safePlay(v);
    }
  }, [seekRequest?.token]);

  // Hotkeys
  usePlayerHotkeys({
    togglePlay: () => {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) safePlay(v);
      else v.pause();
    },
    seekBy: (delta) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + delta));
    },
    changeVolume: (delta) => {
      const v = videoRef.current;
      if (!v) return;
      v.volume = Math.max(0, Math.min(1, v.volume + delta));
    },
  });

  // Sync fullscreen state with browser events (handles ESC, system gesture, swipe-down on Android).
  useEffect(() => {
    const onChange = () => {
      const fsEl =
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
      setIsFullscreen(!!fsEl);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange as EventListener);
    };
  }, []);

  // Toggle fullscreen — MUST be called synchronously from a user gesture
  // (onClick). Android Chrome / Windows: fullscreen the container so the
  // controls stay visible. iOS Safari fallback: fullscreen the video element.
  const toggleFullscreen = () => {
    const el = containerRef.current;
    const v = videoRef.current;
    const docAny = document as Document & {
      webkitExitFullscreen?: () => Promise<void>;
      webkitFullscreenElement?: Element | null;
    };
    const fsEl = document.fullscreenElement || docAny.webkitFullscreenElement;
    if (fsEl) {
      const exit = document.exitFullscreen?.bind(document) || docAny.webkitExitFullscreen?.bind(docAny);
      try { Promise.resolve(exit?.()).catch(() => {}); } catch {}
      // Unlock orientation on exit (Android).
      const orientation = (screen as Screen & {
        orientation?: ScreenOrientation & { unlock?: () => void };
      }).orientation;
      try { orientation?.unlock?.(); } catch {}
      return;
    }
    if (el) {
      const req =
        (el as HTMLElement & { requestFullscreen?: () => Promise<void> }).requestFullscreen?.bind(el) ||
        (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen?.bind(el);
      if (req) {
        try {
          Promise.resolve(req()).then(() => {
            // Try to lock to landscape on Android once fullscreen is established.
            const orientation = (screen as Screen & {
              orientation?: ScreenOrientation & { lock?: (o: string) => Promise<void> };
            }).orientation;
            try { orientation?.lock?.('landscape').catch(() => {}); } catch {}
          }).catch(() => {});
          return;
        } catch {}
      }
    }
    // iOS Safari fallback — only the <video> can go fullscreen.
    const vAny = v as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    try { vAny?.webkitEnterFullscreen?.(); } catch {}
  };

  if (!current) return null;

  const onLoaded = () => {
    const v = videoRef.current;
    if (!v) return;
    if (!current.duration && v.duration) {
      updateCurrent({ duration: v.duration });
    }
  };

  const showControlsTemporarily = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 2800);
  };

  const flashFeedback = (kind: 'play' | 'pause' | 'prev' | 'next') => {
    setFeedback(kind);
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 500);
  };

  const jumpToCue = (direction: 'prev' | 'next') => {
    const v = videoRef.current;
    const cues = primary?.cues ?? [];
    if (!v || cues.length === 0) return;
    const tMs = v.currentTime * 1000;
    let target: typeof cues[number] | undefined;
    if (direction === 'next') {
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
      } catch {}
    }
  };

  const togglePlayPause = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      safePlay(v);
      flashFeedback('play');
    } else {
      v.pause();
      flashFeedback('pause');
    }
  };

  // Tap behavior:
  //  - middle zone: single tap toggles play IMMEDIATELY (no 280ms wait).
  //  - left/right zones: single tap only reveals controls; double tap jumps cue.
  // This removes the laggy play/pause feel on Android.
  const handleVideoTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const zone: 'left' | 'mid' | 'right' =
      ratio < 0.25 ? 'left' : ratio > 0.75 ? 'right' : 'mid';

    const now = Date.now();
    const last = lastTapRef.current;
    showControlsTemporarily();

    // Edge zones: keep double-tap detection for cue jump.
    if (zone !== 'mid') {
      if (last && now - last.time < 300 && last.zone === zone) {
        if (tapTimerRef.current) {
          window.clearTimeout(tapTimerRef.current);
          tapTimerRef.current = null;
        }
        lastTapRef.current = null;
        if (zone === 'right') {
          jumpToCue('next');
          flashFeedback('next');
        } else {
          jumpToCue('prev');
          flashFeedback('prev');
        }
        return;
      }
      lastTapRef.current = { time: now, zone };
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = window.setTimeout(() => {
        lastTapRef.current = null;
        tapTimerRef.current = null;
      }, 280);
      return;
    }

    // Middle zone: instant play/pause toggle.
    lastTapRef.current = null;
    if (tapTimerRef.current) {
      window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
    togglePlayPause();
  };

  const isAudio = current.mediaType === 'audio';

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={containerRef}
        className={`relative bg-black sm:rounded-lg overflow-hidden group ${isAudio ? 'aspect-[5/2] sm:aspect-[7/2]' : 'aspect-video'} ${isFullscreen ? '!aspect-auto w-screen h-screen sm:rounded-none' : ''}`}
        onMouseMove={showControlsTemporarily}
        onMouseLeave={() => setControlsVisible(false)}
      >
        {isAudio && (
          <div className="absolute inset-0 z-0 flex flex-col items-center justify-center text-white/70 bg-gradient-to-br from-primary/30 via-black to-black">
            <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center mb-2">
              <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" aria-hidden>
                <path
                  d="M3 12a3 3 0 0 1 3-3v6a3 3 0 0 1-3-3Zm15-3a3 3 0 0 1 3 3 3 3 0 0 1-3 3V9ZM6 9a6 6 0 1 1 12 0v6a6 6 0 1 1-12 0V9Z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <p className="text-sm font-medium truncate max-w-[90%]">{current.title}</p>
            <p className="text-xs text-white/50 mt-0.5">Audio • {current.fileName}</p>
          </div>
        )}
        <video
          ref={videoRef}
          src={current.blobUrl}
          className={`w-full h-full ${isAudio ? 'opacity-0 pointer-events-none' : ''}`}
          onLoadedMetadata={onLoaded}
          onTimeUpdate={(e) => {
            // Throttle global store updates to ~4Hz to avoid re-rendering
            // every subscriber on each native timeupdate tick (~15Hz).
            const now = performance.now();
            if (now - lastTimeEmitRef.current < 250) return;
            lastTimeEmitRef.current = now;
            setCurrentTime((e.target as HTMLVideoElement).currentTime);
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          preload="metadata"
        />

        {/* Tap layer for gesture handling. Sits above the video but below controls/subtitles. */}
        <div
          className="absolute inset-0 z-10 touch-manipulation select-none"
          onClick={handleVideoTap}
          aria-label="Video gesture area"
        />

        {/* Buffering / loading spinner */}
        {isBuffering && !isAudio && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="rounded-full bg-black/55 p-3">
              <Loader2 className="h-8 w-8 text-white animate-spin" />
            </div>
          </div>
        )}

        {/* Subtitle overlay — non-interactive (overlay variant has no clickable words),
            so it must not block the underlying tap layer. */}
        {(displayMode === 'inside' || displayMode === 'hybrid') && (
          <div className="absolute inset-x-0 bottom-16 px-4 pointer-events-none z-20">
            <SubtitleRenderer
              primaryCue={visiblePrimary}
              secondaryCue={displayMode === 'hybrid' ? null : visibleSecondary}
              variant="overlay"
              videoId={videoId}
              hideText={hideSubtitleText}
            />
          </div>
        )}

        {/* Loop badge */}
        {loopEnabled && (
          <div className="absolute top-3 left-3 z-30 inline-flex items-center gap-1.5 rounded-md bg-primary/90 text-primary-foreground px-2 py-1 text-xs font-medium">
            <Repeat className="h-3 w-3" />
            Loop {loopIter}/{loopMax}
            <button
              onClick={stopLoop}
              className="ml-1 underline underline-offset-2 hover:opacity-80"
              aria-label="Stop loop"
            >
              stop
            </button>
          </div>
        )}

        {/* Expand to immersive study mode (top-right). */}
        {onEnterImmersive && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEnterImmersive();
            }}
            className={`absolute top-3 right-3 z-30 inline-flex items-center justify-center h-9 w-9 rounded-md bg-black/55 text-white hover:bg-black/75 transition-opacity ${
              controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            aria-label="Enter immersive study mode"
            title="Immersive study mode"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        )}

        {/* Gesture feedback flash */}
        {feedback && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <div className="rounded-full bg-black/55 text-white p-4 animate-in fade-in zoom-in duration-150">
              {feedback === 'play' && <Play className="h-8 w-8" />}
              {feedback === 'pause' && <Pause className="h-8 w-8" />}
              {feedback === 'next' && <ChevronRight className="h-8 w-8" />}
              {feedback === 'prev' && <ChevronLeft className="h-8 w-8" />}
            </div>
          </div>
        )}

        {/* Controls overlay — fades in on tap / hover. */}
        <div
          className={`absolute inset-x-0 bottom-0 z-30 px-2 pb-2 transition-opacity duration-200 ${
            controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="bg-gradient-to-t from-black/80 via-black/50 to-transparent rounded-md pt-6">
            <PlayerControls
              videoRef={videoRef}
              variant="overlay"
              onToggleFullscreen={toggleFullscreen}
              isFullscreen={isFullscreen}
            />
          </div>
        </div>
      </div>

      {/* Persian sentence + vocab/idioms — sits IMMEDIATELY under the video for tight visual link.
          Fixed min-height so the panel doesn't open/close between cues and strain the eyes. */}
      {videoId && (
        <div className="mx-3 sm:mx-0 rounded-lg bg-card border border-border p-3 space-y-2 min-h-[88px] flex flex-col justify-center">
          {activePrimary ? (
            displayMode === 'inside' ? (
              // Inside mode: only the English line under the video (no Persian, no inline translation).
              <SubtitleRenderer
                primaryCue={visiblePrimary}
                secondaryCue={null}
                variant="panel"
                interactivePrimary
                videoId={videoId}
                hideText={hideSubtitleText}
              />
            ) : (
              <SubtitleRenderer
                primaryCue={displayMode === 'hybrid' ? null : visiblePrimary}
                secondaryCue={visibleSecondary}
                variant="panel"
                interactivePrimary
                videoId={videoId}
                hideText={hideSubtitleText}
              />
            )
          ) : (
            <p className="text-center text-xs text-muted-foreground/60 select-none">— no subtitle —</p>
          )}
          <BlindListenBar
            enabled={blind.enabled}
            revealed={blind.isRevealed}
            onReveal={blind.reveal}
            onNext={blind.next}
          />
        </div>
      )}

      {videoId && (
        <div className="mx-3 sm:mx-0 rounded-lg border border-primary/20 bg-card/50 p-3 min-h-[120px]">
          {activePrimary ? (
            <AnalysisPanel
              videoId={videoId}
              cue={activePrimary}
              autoRun={autoShowAnalysis}
              showTranslate={!activeSecondary}
            />
          ) : (
            <p className="text-center text-xs text-muted-foreground/60 select-none py-6">
              — waiting for a subtitle —
            </p>
          )}
        </div>
      )}

      {/* Loop controls live below the analysis. */}
      {videoId && activePrimary && (
        <div className="mx-3 sm:mx-0 rounded-lg border border-border bg-card/30 p-2 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Current cue
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => updateSettings({ autoPauseAtCueEnd: !autoPauseAtCueEnd })}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                autoPauseAtCueEnd
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={autoPauseAtCueEnd}
              title="Auto-pause at the end of every subtitle line"
            >
              <PauseCircle className="h-3.5 w-3.5" />
              Auto-pause
            </button>
            <LoopControls cue={activePrimary} />
          </div>
        </div>
      )}

      {/* Shadowing study panel — record yourself & compare. */}
      {videoId && activePrimary && (
        <div className="mx-3 sm:mx-0">
          <ShadowingPanel videoId={videoId} cue={activePrimary} />
        </div>
      )}
    </div>
  );
}

/** Play with friendly error messages for autoplay-block / decode failures. */
function safePlay(v: HTMLVideoElement) {
  const p = v.play();
  if (p && typeof p.catch === 'function') {
    p.catch((err: unknown) => {
      const name = (err as { name?: string } | null)?.name;
      if (name === 'NotAllowedError') {
        toast.error('برای پخش، یک‌بار روی صفحه ضربه بزنید (autoplay مسدود است).');
      } else if (name === 'AbortError') {
        // Benign — happens when we pause/seek right after play.
      } else {
        toast.error('پخش ویدیو با خطا متوقف شد.');
      }
    });
  }
}
