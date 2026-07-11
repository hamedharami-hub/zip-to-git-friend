import { create } from "zustand";
import type { SubtitleTrack } from "@/types";
import { saveTrack as dbSaveTrack, getTracks } from "@/lib/db";

interface SubtitleState {
  primary: SubtitleTrack | null;
  secondary: SubtitleTrack | null;
  loadForVideo: (videoId: string) => Promise<void>;
  setTrack: (track: SubtitleTrack) => Promise<void>;
  updateTrack: (
    role: "primary" | "secondary",
    patch: Partial<Pick<SubtitleTrack, "delayMs" | "speedMultiplier">>,
  ) => Promise<void>;
  reset: () => void;
}

export const useSubtitleStore = create<SubtitleState>((set, get) => ({
  primary: null,
  secondary: null,
  loadForVideo: async (videoId) => {
    const tracks = await getTracks(videoId);
    const primary = tracks.find((t) => t.role === "primary") ?? null;
    const secondary = tracks.find((t) => t.role === "secondary") ?? null;
    set({ primary, secondary });
  },
  setTrack: async (track) => {
    await dbSaveTrack(track);
    set(track.role === "primary" ? { primary: track } : { secondary: track });
  },
  updateTrack: async (role, patch) => {
    const cur = role === "primary" ? get().primary : get().secondary;
    if (!cur) return;
    const next = { ...cur, ...patch };
    await dbSaveTrack(next);
    set(role === "primary" ? { primary: next } : { secondary: next });
  },
  reset: () => set({ primary: null, secondary: null }),
}));
