/**
 * Wires the browser's Media Session API to a media element so the OS
 * lock-screen, notification shade, AirPods play/pause buttons and Bluetooth
 * remotes can control playback even when the screen is off.
 *
 * Works for <video>, <audio> and our custom Web Speech / TTS players (in
 * which case `mediaRef` can be null and the caller wires play/pause manually).
 *
 * IMPORTANT: To keep audio alive on iOS / Android when the screen turns off,
 * the underlying media element must be a real <audio>/<video> tag (Media
 * Session itself doesn't keep audio playing — the element does). For our
 * book TTS we already use <audio src=blobUrl>, so the OS will continue
 * decoding audio in the background.
 */
import { useEffect, useRef } from "react";

export interface MediaSessionMeta {
  title: string;
  artist?: string;
  album?: string;
  artwork?: string; // url or data URL
}

export interface MediaSessionHandlers {
  onPlay?: () => void;
  onPause?: () => void;
  onSeekBackward?: (offsetSec: number) => void;
  onSeekForward?: (offsetSec: number) => void;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
  onStop?: () => void;
}

export function useMediaSession(
  mediaEl: HTMLMediaElement | null,
  meta: MediaSessionMeta | null,
  handlers: MediaSessionHandlers = {},
  active = true,
) {
  // Keep the latest handlers accessible without tearing down the media-session
  // registration every time the caller re-creates the handler object.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  // Push metadata + action handlers.
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!meta) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: meta.title,
        artist: meta.artist ?? "",
        album: meta.album ?? "",
        artwork: meta.artwork
          ? [
              { src: meta.artwork, sizes: "512x512", type: "image/png" },
              { src: meta.artwork, sizes: "256x256", type: "image/png" },
              { src: meta.artwork, sizes: "128x128", type: "image/png" },
            ]
          : [],
      });
    } catch {
      /* MediaMetadata not supported */
    }

    const setHandler = (
      action: MediaSessionAction,
      handler: ((d?: MediaSessionActionDetails) => void) | null,
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* unsupported on this UA */
      }
    };

    setHandler("play", () => handlersRef.current.onPlay?.());
    setHandler("pause", () => handlersRef.current.onPause?.());
    setHandler("seekbackward", (d) => handlersRef.current.onSeekBackward?.(d?.seekOffset ?? 10));
    setHandler("seekforward", (d) => handlersRef.current.onSeekForward?.(d?.seekOffset ?? 10));
    setHandler("previoustrack", () => handlersRef.current.onPreviousTrack?.());
    setHandler("nexttrack", () => handlersRef.current.onNextTrack?.());
    setHandler("stop", () => handlersRef.current.onStop?.());

    return () => {
      const allActions: MediaSessionAction[] = [
        "play",
        "pause",
        "seekbackward",
        "seekforward",
        "previoustrack",
        "nexttrack",
        "stop",
      ];
      for (const a of allActions) setHandler(a, null);
    };
  }, [active, meta]);

  // Mirror the media element's playback state so the OS shows the right icon.
  // Throttle `setPositionState` calls to avoid hammering the OS on every
  // timeupdate tick.
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!mediaEl) return;

    let lastPositionState = 0;
    const sync = () => {
      try {
        navigator.mediaSession.playbackState = mediaEl.paused ? "paused" : "playing";
      } catch {
        /* noop */
      }
      try {
        if (Number.isFinite(mediaEl.duration) && mediaEl.duration > 0) {
          const now = performance.now();
          // Limit position-state pushes to ~4 per second.
          if (now - lastPositionState < 250) return;
          lastPositionState = now;
          navigator.mediaSession.setPositionState({
            duration: mediaEl.duration,
            playbackRate: mediaEl.playbackRate || 1,
            position: Math.min(mediaEl.currentTime || 0, mediaEl.duration),
          });
        }
      } catch {
        /* setPositionState may throw on stale state — ignore */
      }
    };
    sync();
    const events: (keyof HTMLMediaElementEventMap)[] = [
      "play",
      "pause",
      "ratechange",
      "durationchange",
      "ended",
    ];
    // timeupdate fires often; throttle inside the handler instead of adding/removing.
    const onTimeUpdate = () => sync();
    mediaEl.addEventListener("timeupdate", onTimeUpdate);
    events.forEach((e) => mediaEl.addEventListener(e, sync));
    return () => {
      mediaEl.removeEventListener("timeupdate", onTimeUpdate);
      events.forEach((e) => mediaEl.removeEventListener(e, sync));
    };
  }, [active, mediaEl]);
}

/**
 * Soft "keep-awake" hint via the Screen Wake Lock API. Some browsers will
 * ignore this or release it on tab blur — we re-acquire on visibilitychange.
 * Returns nothing; safe no-op when unsupported.
 */
export function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined") return;
    const anyNav = navigator as unknown as {
      wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> };
    };
    if (!anyNav.wakeLock) return;

    let lock: { release(): Promise<void> } | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        lock = await anyNav.wakeLock!.request("screen");
      } catch {
        /* user gesture / permission missing */
      }
    };
    void acquire();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !lock && !cancelled) {
        void acquire();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      lock?.release().catch(() => undefined);
      lock = null;
    };
  }, [active]);
}
