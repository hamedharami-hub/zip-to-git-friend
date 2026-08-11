import { create } from "zustand";
import type { AppSettings } from "@/types";
import { getSettings, saveSettings } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { DEFAULT_REWRITE_VOICE } from "@/lib/news";

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  cloudSyncing: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  syncWithCloud: () => Promise<void>;
}

const DEFAULTS: AppSettings = {
  theme: "dark",
  fontSize: "md",
  displayMode: "outside",
  autoShowAnalysis: false,
  blindListen: false,
  autoPauseAtCueEnd: false,
  autoImmersiveOnLandscape: false,
  showInlineTranslation: true,
  simplifyLevel: "a2-b1",
  defaultSimplifyArticles: false,
  defaultRewriteVoice: DEFAULT_REWRITE_VOICE,
  geminiApiKey: "",
  groqApiKey: "",
  geminiTtsApiKey: "",
  elevenLabsApiKey: "",
  azureTtsApiKey: "",
  azureTtsRegion: "westeurope",
  huggingFaceApiKey: "",
  playHtUserId: "",
  playHtApiKey: "",
  openTtsUrl: "",
  geminiModel: "gemini-3-flash-preview",
  analyzeModel: { provider: "gemini", model: "gemini-3-flash-preview" },
  translateModel: { provider: "gemini", model: "gemini-3.1-flash-lite-preview" },
  batchModel: { provider: "gemini", model: "gemini-3.1-flash-lite-preview" },
  wordMeaningModel: { provider: "gemini", model: "gemini-3.1-flash-lite-preview" },
  transcribeModel: "whisper-large-v3-turbo",
  bookAnalysisModel: "google/gemini-3-flash-preview",
  bookSingleAnalysisModel: "google/gemini-3-flash-preview",
  bookBatchAnalysisModel: "google/gemini-3.1-flash-lite-preview",
  bookRewriteModel: "google/gemini-3-flash-preview",
  paragraphAnalysisModelRef: { provider: "gateway", model: "google/gemini-3-flash-preview" },
  paragraphBatchModelRef: { provider: "gateway", model: "google/gemini-3.1-flash-lite-preview" },
  rewriteModelRef: { provider: "gateway", model: "google/gemini-3-flash-preview" },
  bookSingleAnalysisModelRef: { provider: "gateway", model: "google/gemini-3-flash-preview" },
  bookBatchAnalysisModelRef: { provider: "gateway", model: "google/gemini-3.1-flash-lite-preview" },
  newsBatchAnalysisModelRef: { provider: "gateway", model: "google/gemini-3.1-flash-lite-preview" },
  newsRewriteModelRef: { provider: "gateway", model: "google/gemini-3-flash-preview" },
  htmlFilenameModelRef: { provider: "gateway", model: "google/gemini-3.1-flash-lite-preview" },
  bookRewriteModelRef: { provider: "gateway", model: "google/gemini-3-flash-preview" },
  paragraphGestures: false,
  paragraphTextAlign: "start",
};

// Shallow equality for settings objects (avoids no-op re-renders).
function settingsEqual(a: AppSettings, b: AppSettings): boolean {
  const keys = Object.keys(a) as Array<keyof AppSettings>;
  for (const k of keys) {
    if ((a[k] as unknown) !== (b[k] as unknown)) return false;
  }
  return true;
}

// Smart merge: cloud value wins when present & non-empty; otherwise local fills it.
function smartMerge(local: AppSettings, cloud: Partial<AppSettings>): AppSettings {
  const merged = { ...local } as Record<string, unknown>;
  for (const k of Object.keys(cloud) as Array<keyof AppSettings>) {
    const cv = cloud[k] as unknown;
    const lv = local[k] as unknown;
    const cloudEmpty = cv === undefined || cv === null || cv === "";
    const localEmpty = lv === undefined || lv === null || lv === "";
    if (!cloudEmpty) merged[k as string] = cv;
    else if (!localEmpty) merged[k as string] = lv;
  }
  return merged as unknown as AppSettings;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePush(settings: AppSettings) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("user_settings")
        .upsert(
          { user_id: user.id, settings: settings as unknown as Json },
          { onConflict: "user_id" },
        );
    } catch (e) {
      console.warn("[settings] cloud push failed", e);
    }
  }, 800);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,
  cloudSyncing: false,
  load: async () => {
    const s = await getSettings();
    let theme = s.theme;
    try {
      const persistedTheme = localStorage.getItem("llvp-theme");
      if (persistedTheme === "dark" || persistedTheme === "light") {
        theme = persistedTheme;
      }
    } catch {
      /* ignore localStorage errors */
    }
    set({ settings: s, loaded: true });
    if (theme !== s.theme) {
      set((state) => ({ settings: { ...state.settings, theme } }));
    }
    applyTheme(theme);
  },
  update: async (patch) => {
    const current = get().settings;
    const next = { ...current, ...patch };
    if (settingsEqual(current, next)) return;
    set({ settings: next });
    await saveSettings(next);
    if (patch.theme) applyTheme(patch.theme);
    schedulePush(next);
  },
  syncWithCloud: async () => {
    try {
      set({ cloudSyncing: true });
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("user_settings")
        .select("settings")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      const local = get().settings;
      const cloud = (data?.settings ?? {}) as Partial<AppSettings>;
      const merged = smartMerge(local, cloud);
      if (settingsEqual(local, merged)) return;
      set({ settings: merged });
      await saveSettings(merged);
      applyTheme(merged.theme);
      // Push merged back so cloud also gets any local-only values.
      await supabase
        .from("user_settings")
        .upsert(
          { user_id: user.id, settings: merged as unknown as Json },
          { onConflict: "user_id" },
        );
    } catch (e) {
      console.warn("[settings] cloud sync failed", e);
    } finally {
      set({ cloudSyncing: false });
    }
  },
}));

function applyTheme(theme: "dark" | "light") {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  try {
    localStorage.setItem("llvp-theme", theme);
  } catch {
    /* ignore localStorage errors */
  }
}
