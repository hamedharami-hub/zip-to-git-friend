/**
 * Lightweight zustand store for gamification HUD: XP, streak, hearts, combo.
 * Combo lives only in memory (resets on page reload / wrong answer).
 */
import { create } from "zustand";
import { toast } from "sonner";
import {
  getOrCreateState,
  recordGrade,
  ensureDailyQuests,
  claimQuest,
  type GamificationState,
  type DailyQuest,
} from "@/lib/gamification";

interface GamificationStore {
  state: GamificationState | null;
  quests: DailyQuest[];
  combo: number;
  loading: boolean;
  load: () => Promise<void>;
  loadQuests: () => Promise<void>;
  grade: (grade: "again" | "hard" | "good" | "easy") => Promise<void>;
  claim: (questId: string) => Promise<void>;
  resetCombo: () => void;
}

export const useGamificationStore = create<GamificationStore>((set, get) => ({
  state: null,
  quests: [],
  combo: 0,
  loading: false,

  async load() {
    if (get().loading) return;
    set({ loading: true });
    try {
      const s = await getOrCreateState();
      set({ state: s, loading: false });
    } catch (e) {
      console.warn("[gamification] load failed", e);
      set({ loading: false });
    }
  },

  async loadQuests() {
    try {
      const q = await ensureDailyQuests();
      set({ quests: q });
    } catch (e) {
      console.warn("[gamification] loadQuests failed", e);
    }
  },

  async grade(grade) {
    const prevCombo = get().combo;
    const newCombo = grade === "again" ? 0 : prevCombo + 1;
    set({ combo: newCombo });
    try {
      const res = await recordGrade({ grade, combo: newCombo });
      if (res.state) set({ state: res.state });
      if (res.xpEarned > 0) {
        const mult = newCombo >= 10 ? " ×3" : newCombo >= 5 ? " ×2" : "";
        toast.success(`+${res.xpEarned} XP${mult}`, { duration: 1200 });
      }
      if (res.leveledUp) {
        toast.success(`🎉 Level ${res.state?.level}!`, { duration: 2500 });
      }
      if (res.lostHeart) {
        toast.error("💔 یک قلب از دست دادی", { duration: 1600 });
      }
      // Refresh quests so HUD shows progress
      void get().loadQuests();
    } catch (e) {
      console.warn("[gamification] grade failed", e);
    }
  },

  async claim(questId) {
    try {
      const s = await claimQuest(questId);
      if (s) set({ state: s });
      await get().loadQuests();
      toast.success("🎁 جایزه دریافت شد!");
    } catch (e) {
      console.warn("[gamification] claim failed", e);
    }
  },

  resetCombo() {
    set({ combo: 0 });
  },
}));
