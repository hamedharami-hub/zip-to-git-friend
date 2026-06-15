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
  simplifyLevel: 'a2-b1',
  defaultSimplifyArticles: false,
  geminiApiKey: '',
  groqApiKey: '',
  geminiTtsApiKey: '',
  elevenLabsApiKey: '',
  azureTtsApiKey: '',
  azureTtsRegion: 'westeurope',
  huggingFaceApiKey: '',
  playHtUserId: '',
  playHtApiKey: '',
  openTtsUrl: '',
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
  newsBatchAnalysisModelRef: { provider: 'gateway', model: 'google/gemini-3.1-flash-lite-preview' },
  newsRewriteModelRef: { provider: 'gateway', model: 'google/gemini-3-flash-preview' },
  bookRewriteModelRef: { provider: 'gateway', model: 'google/gemini-3-flash-preview' },
  paragraphGestures: false,
  paragraphTextAlign: 'start',
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,
  load: async () => {
    const s = await getSettings();
    let theme = s.theme;
    try {
      const persistedTheme = localStorage.getItem('llvp-theme');
      if (persistedTheme === 'dark' || persistedTheme === 'light') {
        theme = persistedTheme;
      }
    } catch {}
    set({ settings: s, loaded: true });
    if (theme !== s.theme) {
      set((state) => ({ settings: { ...state.settings, theme } }));
    }
    applyTheme(theme);
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
