import { create } from "zustand";
import type { LoopConfig, SubtitleCue } from "@/types";

const DEFAULT_PATTERN: LoopConfig["visibilityPattern"] = ["primary", "both", "secondary"];

interface LoopState {
  config: LoopConfig;
  cue: SubtitleCue | null;
  /** Frozen visibility for the *current* iteration. */
  visibility: "both" | "primary" | "secondary" | "none";
  startLoop: (
    cue: SubtitleCue,
    options?: Partial<
      Pick<LoopConfig, "maxIterations" | "pauseBetweenMs" | "visibilityPattern" | "chainNext">
    >,
  ) => void;
  /** Advance to the next cue while preserving the current loop options. */
  advanceTo: (cue: SubtitleCue) => void;
  stopLoop: () => void;
  setIteration: (n: number) => void;
  setVisibility: (v: LoopState["visibility"]) => void;
  updateConfig: (patch: Partial<LoopConfig>) => void;
}

const EMPTY: LoopConfig = {
  enabled: false,
  cueId: null,
  currentIteration: 0,
  maxIterations: 3,
  pauseBetweenMs: 1000,
  visibilityPattern: DEFAULT_PATTERN,
  chainNext: true,
};

export const useLoopStore = create<LoopState>((set, get) => ({
  config: EMPTY,
  cue: null,
  visibility: "both",
  startLoop: (cue, options = {}) => {
    const maxIterations = options.maxIterations ?? 3;
    const pauseBetweenMs = options.pauseBetweenMs ?? 1000;
    const visibilityPattern =
      options.visibilityPattern && options.visibilityPattern.length > 0
        ? options.visibilityPattern
        : DEFAULT_PATTERN.slice(0, maxIterations);
    const chainNext = options.chainNext ?? true;
    set({
      cue,
      visibility: visibilityPattern[0] ?? "both",
      config: {
        enabled: true,
        cueId: cue.id,
        currentIteration: 1,
        maxIterations,
        pauseBetweenMs,
        visibilityPattern,
        chainNext,
      },
    });
  },
  advanceTo: (cue) => {
    const cur = get().config;
    set({
      cue,
      visibility: cur.visibilityPattern[0] ?? "both",
      config: { ...cur, enabled: true, cueId: cue.id, currentIteration: 1 },
    });
  },
  stopLoop: () => set({ config: EMPTY, cue: null, visibility: "both" }),
  setIteration: (n) => set({ config: { ...get().config, currentIteration: n } }),
  setVisibility: (v) => set({ visibility: v }),
  updateConfig: (patch) => set({ config: { ...get().config, ...patch } }),
}));

export { DEFAULT_PATTERN };
