/**
 * In-memory cache of the user's sentence flags so podcast/drill UIs
 * can render the flag badge instantly and toggle it optimistically.
 */
import { create } from 'zustand';
import {
  fetchAllFlags,
  upsertFlag,
  removeFlag,
  type SentenceFlag,
  type FlagColor,
} from '@/lib/sentenceFlags';

interface FlagState {
  flags: Record<string, SentenceFlag>;
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  setFlag: (sentenceId: string, color: FlagColor, label?: string | null) => Promise<void>;
  clearFlag: (sentenceId: string) => Promise<void>;
  get: (sentenceId: string) => SentenceFlag | undefined;
}

export const useSentenceFlagStore = create<FlagState>((set, get) => ({
  flags: {},
  loaded: false,
  loading: false,

  async load() {
    if (get().loading) return;
    set({ loading: true });
    try {
      const list = await fetchAllFlags();
      const map: Record<string, SentenceFlag> = {};
      for (const f of list) map[f.sentenceId] = f;
      set({ flags: map, loaded: true, loading: false });
    } catch (e) {
      console.error('[flagStore] load failed', e);
      set({ loading: false });
    }
  },

  async setFlag(sentenceId, color, label) {
    // optimistic
    const existing = get().flags[sentenceId];
    const optimistic: SentenceFlag = {
      id: existing?.id ?? `tmp-${sentenceId}`,
      sentenceId,
      color,
      label: label ?? existing?.label ?? null,
      note: existing?.note ?? null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set({ flags: { ...get().flags, [sentenceId]: optimistic } });
    try {
      const saved = await upsertFlag({ sentenceId, color, label });
      if (saved) set({ flags: { ...get().flags, [sentenceId]: saved } });
    } catch (e) {
      console.error('[flagStore] setFlag failed', e);
    }
  },

  async clearFlag(sentenceId) {
    const next = { ...get().flags };
    delete next[sentenceId];
    set({ flags: next });
    try {
      await removeFlag(sentenceId);
    } catch (e) {
      console.error('[flagStore] clearFlag failed', e);
    }
  },

  get(sentenceId) {
    return get().flags[sentenceId];
  },
}));
