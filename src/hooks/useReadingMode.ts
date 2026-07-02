/**
 * Shared Zustand store for Reading Mode preferences. Persisted to
 * localStorage so choices survive reloads.
 */
import { create } from 'zustand';

export type EyeComfortPreset = 'off' | 'comfort' | 'sepia' | 'night' | 'contrast';

interface ReadingModeState {
  // Bionic
  bionicEnabled: boolean;
  bionicIntensity: number; // 0.3..0.7
  // Auto-scroll + ruler
  autoScrollEnabled: boolean;
  autoScrollWpm: number;
  rulerEnabled: boolean;
  // Focus
  focusHighlightEnabled: boolean;
  focusBlurEnabled: boolean;
  // Eye comfort
  eyeComfortPreset: EyeComfortPreset;
  blueLightFilter: number; // 0..0.4
  extraLineHeight: number; // 0..0.6 added to base
  set: (patch: Partial<Omit<ReadingModeState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const KEY = 'llvp-reading-mode.v2';

const DEFAULTS = {
  bionicEnabled: false,
  bionicIntensity: 0.5,
  autoScrollEnabled: false,
  autoScrollWpm: 280,
  rulerEnabled: false,
  focusHighlightEnabled: false,
  focusBlurEnabled: false,
  eyeComfortPreset: 'off' as EyeComfortPreset,
  blueLightFilter: 0,
  extraLineHeight: 0,
};

function load(): typeof DEFAULTS {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(state: typeof DEFAULTS) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* noop */ }
}

export const useReadingMode = create<ReadingModeState>((set) => ({
  ...load(),
  set: (patch) => set((s) => {
    const next = { ...s, ...patch };
    const { set: _s, reset: _r, ...persistable } = next;
    save(persistable as typeof DEFAULTS);
    return next;
  }),
  reset: () => set((s) => {
    save(DEFAULTS);
    return { ...s, ...DEFAULTS };
  }),
}));
