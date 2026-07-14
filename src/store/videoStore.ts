import { create } from "zustand";
import type { Video } from "@/types";
import { saveVideo as dbSaveVideo } from "@/lib/db";

interface SeekRequest {
  /** Time in seconds. */
  time: number;
  /** Whether to autoplay after seeking. */
  play?: boolean;
  /** Monotonic token so the same time can be requested twice. */
  token: number;
}

interface VideoState {
  current: Video | null;
  currentTime: number;
  isPlaying: boolean;
  seekRequest: SeekRequest | null;
  setCurrent: (v: Video | null) => void;
  setCurrentTime: (t: number) => void;
  setIsPlaying: (p: boolean) => void;
  updateCurrent: (patch: Partial<Video>) => Promise<void>;
  /** Request the active <video> to seek (and optionally play) at `seconds`. */
  requestSeek: (seconds: number, play?: boolean) => void;
  /** Register the active media element so global UI can pause/resume it. */
  registerMedia: (el: HTMLMediaElement | null) => void;
  /** Hold playback while popovers are open. Reference-counted. */
  holdPlayback: () => void;
  /** Release a previously-acquired hold. Resumes only when count reaches 0 and was playing before. */
  releasePlayback: () => void;
}

let seekToken = 0;
let mediaEl: HTMLMediaElement | null = null;
let holdCount = 0;
let wasPlayingBeforeHold = false;

export const useVideoStore = create<VideoState>((set, get) => ({
  current: null,
  currentTime: 0,
  isPlaying: false,
  seekRequest: null,
  setCurrent: (v) => set({ current: v, currentTime: v?.lastPosition ?? 0 }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setIsPlaying: (p) => set({ isPlaying: p }),
  updateCurrent: async (patch) => {
    const cur = get().current;
    if (!cur) return;
    const next = { ...cur, ...patch };
    set({ current: next });
    await dbSaveVideo(next);
  },
  requestSeek: (seconds, play = true) => {
    seekToken += 1;
    set({ seekRequest: { time: seconds, play, token: seekToken } });
  },
  registerMedia: (el) => {
    mediaEl = el;
  },
  holdPlayback: () => {
    if (holdCount === 0 && mediaEl) {
      wasPlayingBeforeHold = !mediaEl.paused;
      if (wasPlayingBeforeHold) {
        try {
          mediaEl.pause();
        } catch {
          /* no-op */
        }
      }
    }
    holdCount += 1;
  },
  releasePlayback: () => {
    holdCount = Math.max(0, holdCount - 1);
    if (holdCount === 0 && mediaEl && wasPlayingBeforeHold) {
      try {
        mediaEl.play().catch(() => undefined);
      } catch {
        /* no-op */
      }
      wasPlayingBeforeHold = false;
    }
  },
}));
