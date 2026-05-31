import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Centralized read/write hook for an <video>/<audio> element.
 * Mirrors volume, muted, playbackRate, currentTime, duration, paused, buffering
 * into React state so components can render reactively without scattering
 * direct `videoRef.current.*` access.
 */
export interface VideoElementState {
  volume: number;
  muted: boolean;
  playbackRate: number;
  currentTime: number;
  duration: number;
  paused: boolean;
  buffering: boolean;
}

export interface VideoElementApi extends VideoElementState {
  play: () => Promise<void>;
  pause: () => void;
  togglePlay: () => void;
  seek: (sec: number) => void;
  seekBy: (delta: number) => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  setPlaybackRate: (r: number) => void;
}

export function useVideoElement(
  ref: RefObject<HTMLMediaElement | null>,
): VideoElementApi {
  const [state, setState] = useState<VideoElementState>({
    volume: 1,
    muted: false,
    playbackRate: 1,
    currentTime: 0,
    duration: 0,
    paused: true,
    buffering: false,
  });
  const throttleRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const sync = (patch: Partial<VideoElementState>) =>
      setState((s) => ({ ...s, ...patch }));

    const onVolume = () => sync({ volume: el.volume, muted: el.muted });
    const onRate = () => sync({ playbackRate: el.playbackRate });
    const onTime = () => {
      const now = performance.now();
      if (now - throttleRef.current < 200) return;
      throttleRef.current = now;
      sync({ currentTime: el.currentTime });
    };
    const onDuration = () => sync({ duration: el.duration || 0 });
    const onPlay = () => sync({ paused: false });
    const onPause = () => sync({ paused: true });
    const onWaiting = () => sync({ buffering: true });
    const onPlaying = () => sync({ buffering: false });
    const onCanPlay = () => sync({ buffering: false });

    // Prime state from current element.
    sync({
      volume: el.volume,
      muted: el.muted,
      playbackRate: el.playbackRate,
      currentTime: el.currentTime,
      duration: el.duration || 0,
      paused: el.paused,
    });

    el.addEventListener('volumechange', onVolume);
    el.addEventListener('ratechange', onRate);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('durationchange', onDuration);
    el.addEventListener('loadedmetadata', onDuration);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('canplay', onCanPlay);
    return () => {
      el.removeEventListener('volumechange', onVolume);
      el.removeEventListener('ratechange', onRate);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('durationchange', onDuration);
      el.removeEventListener('loadedmetadata', onDuration);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('canplay', onCanPlay);
    };
  }, [ref]);

  const play = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    try { await el.play(); } catch {}
  }, [ref]);
  const pause = useCallback(() => { ref.current?.pause(); }, [ref]);
  const togglePlay = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) { el.play().catch(() => {}); } else { el.pause(); }
  }, [ref]);
  const seek = useCallback((sec: number) => {
    const el = ref.current;
    if (!el) return;
    if (el.readyState < 1) return;
    try { el.currentTime = Math.max(0, Math.min(el.duration || sec, sec)); } catch {}
  }, [ref]);
  const seekBy = useCallback((delta: number) => {
    const el = ref.current;
    if (!el) return;
    try { el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + delta)); } catch {}
  }, [ref]);
  const setVolume = useCallback((v: number) => {
    const el = ref.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, v));
  }, [ref]);
  const setMuted = useCallback((m: boolean) => {
    const el = ref.current;
    if (!el) return;
    el.muted = m;
  }, [ref]);
  const setPlaybackRate = useCallback((r: number) => {
    const el = ref.current;
    if (!el) return;
    el.playbackRate = r;
  }, [ref]);

  return { ...state, play, pause, togglePlay, seek, seekBy, setVolume, setMuted, setPlaybackRate };
}
