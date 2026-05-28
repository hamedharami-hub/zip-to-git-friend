import { create } from 'zustand';
import type { AppSettings } from '@/types';
import { getSettings, saveSettings } from '@/lib/db';

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
}

const DEFAULTS: AppSettings = {
  theme: 'dark',
  fontSize: 'md',
  displayMode: 'outside',
  autoShowAnalysis: false,
  blindListen: false,
  autoPauseAtCueEnd: false,
  autoImmersiveOnLandscape: false,
  showInlineTranslation: true,
  geminiApiKey: '',
  groqApiKey: '',
  geminiTtsApiKey: '',
  elevenLabsApiKey: '',
  geminiModel: 'gemini-3-flash-preview',
  analyzeModel: { provider: 'gemini', model: 'gemini-3-flash-preview' },
  translateModel: { provider: 'gemini', model: 'gemini-3.1-flash-lite-preview' },
  batchModel: { provider: 'gemini', model: 'gemini-3.1-flash-lite-preview' },
  wordMeaningModel: { provider: 'gemini', model: 'gemini-3.1-flash-lite-preview' },
  transcribeModel: 'whisper-large-v3-turbo',
  bookAnalysisModel: 'google/gemini-3-flash-preview',
  bookSingleAnalysisModel: 'google/gemini-3-flash-preview',
  bookBatchAnalysisModel: 'google/gemini-3.1-flash-lite-preview',
  bookRewriteModel: 'google/gemini-3-flash-preview',
  paragraphAnalysisModelRef: { provider: 'gateway', model: 'google/gemini-3-flash-preview' },
  paragraphBatchModelRef: { provider: 'gateway', model: 'google/gemini-3.1-flash-lite-preview' },
  rewriteModelRef: { provider: 'gateway', model: 'google/gemini-3-flash-preview' },
  bookSingleAnalysisModelRef: { provider: 'gateway', model: 'google/gemini-3-flash-preview' },
  bookBatchAnalysisModelRef: { provider: 'gateway', model: 'google/gemini-3.1-flash-lite-preview' },
  bookRewriteModelRef: { provider: 'gateway', model: 'google/gemini-3-flash-preview' },
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,
  load: async () => {
    const s = await getSettings();
    set({ settings: s, loaded: true });
    applyTheme(s.theme);
  },
  update: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    await saveSettings(next);
    if (patch.theme) applyTheme(patch.theme);
  },
}));

function applyTheme(theme: 'dark' | 'light') {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  try {
    localStorage.setItem('llvp-theme', theme);
  } catch {}
}
