import { create } from 'zustand';
import type { LeitnerCard, LeitnerRating, LeitnerSourceKind } from '@/types';
import {
  getAllLeitnerCards,
  saveLeitnerCard,
  deleteLeitnerCard as dbDeleteCard,
} from '@/lib/db';
import { applyAnswer, applyReview, normalizeFront, nextReviewFor, sortDue } from '@/lib/leitner';
import { pushCard, deleteRemoteCard } from '@/lib/leitnerSync';
import { extractAndUploadClip } from '@/lib/audioClip';
import { applyDailyLimits } from '@/lib/leitnerLimits';

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export interface BoxStats {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
  total: number;
  due: number;
}

export interface AddCardInput {
  front: string;
  back: string;
  sourceVideoId?: string;
  sourceCueId?: string;
  exampleSentence?: string;
  audioUrl?: string;
  imageUrl?: string;
  folderId?: string;
  sourceStartMs?: number;
  sourceEndMs?: number;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceKind?: LeitnerSourceKind;
}

interface LeitnerState {
  cards: LeitnerCard[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Returns 'added' or 'duplicate'.
   *  Accepts either the new structured AddCardInput or the legacy positional
   *  signature `(front, back, sourceVideoId?, sourceCueId?)` for backwards
   *  compatibility with existing call sites. */
  addCard: {
    (input: AddCardInput): Promise<'added' | 'duplicate'>;
    (front: string, back: string, sourceVideoId?: string, sourceCueId?: string): Promise<'added' | 'duplicate'>;
  };
  /** Patch arbitrary fields on a card (front/back/example/image/audio/folder…). */
  updateCard: (id: string, patch: Partial<LeitnerCard>) => Promise<void>;
  /** Legacy 2-button review: maps boolean → 'good'/'again'. */
  reviewCard: (id: string, correct: boolean) => Promise<void>;
  /** Modern 4-rating review (Again / Hard / Good / Easy).
   *  When `ephemeral` is true (Cram mode), the schedule is NOT persisted —
   *  the rating is only used for queue ordering and gamification XP. */
  rateCard: (id: string, rating: LeitnerRating, opts?: { ephemeral?: boolean }) => Promise<void>;
  /** Restore the most recent card snapshot (Undo). Returns the card id, or null. */
  undoLastReview: () => Promise<string | null>;
  /** Snapshot of the previous card state, populated by rateCard. */
  lastReviewSnapshot: LeitnerCard | null;
  deleteCard: (id: string) => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
  getDueCards: (now?: number, folderId?: string) => LeitnerCard[];
  /** Build a queue of cards for a study profile. */
  getProfileQueue: (
    profile: 'due' | 'quick' | 'cram' | 'listening' | 'starred',
    folderId?: string,
    limit?: number,
  ) => LeitnerCard[];
  getBoxStats: (now?: number, folderId?: string) => BoxStats;
  findByFront: (front: string) => LeitnerCard | undefined;
  cardsInFolder: (folderId?: string) => LeitnerCard[];
}

export const useLeitnerStore = create<LeitnerState>((set, get) => ({
  cards: [],
  loaded: false,
  load: async () => {
    const cards = await getAllLeitnerCards();
    set({ cards, loaded: true });
  },
  addCard: (async (
    arg1: AddCardInput | string,
    back?: string,
    sourceVideoId?: string,
    sourceCueId?: string,
  ) => {
    const input: AddCardInput =
      typeof arg1 === 'string'
        ? { front: arg1, back: back ?? '', sourceVideoId, sourceCueId }
        : arg1;
    const key = normalizeFront(input.front);
    const existing = get().cards.find((c) => normalizeFront(c.front) === key);
    if (existing) {
      // Backfill missing rich fields onto existing card so re-adds don't lose context.
      const patch: Partial<LeitnerCard> = {};
      if (input.exampleSentence && !existing.exampleSentence) patch.exampleSentence = input.exampleSentence;
      if (input.audioUrl && !existing.audioUrl) patch.audioUrl = input.audioUrl;
      if (input.imageUrl && !existing.imageUrl) patch.imageUrl = input.imageUrl;
      if (input.folderId && !existing.folderId) patch.folderId = input.folderId;
      if (input.sourceStartMs != null && existing.sourceStartMs == null) patch.sourceStartMs = input.sourceStartMs;
      if (input.sourceEndMs != null && existing.sourceEndMs == null) patch.sourceEndMs = input.sourceEndMs;
      if (input.sourceUrl && !existing.sourceUrl) patch.sourceUrl = input.sourceUrl;
      if (input.sourceTitle && !existing.sourceTitle) patch.sourceTitle = input.sourceTitle;
      if (input.sourceKind && !existing.sourceKind) patch.sourceKind = input.sourceKind;
      if (Object.keys(patch).length > 0) {
        await get().updateCard(existing.id, patch);
      }
      return 'duplicate';
    }
    const now = Date.now();
    const card: LeitnerCard = {
      id: uuid(),
      front: input.front.trim(),
      back: input.back.trim(),
      box: 1,
      nextReview: nextReviewFor(1, now),
      sourceVideoId: input.sourceVideoId,
      sourceCueId: input.sourceCueId,
      createdAt: now,
      exampleSentence: input.exampleSentence?.trim() || undefined,
      audioUrl: input.audioUrl,
      imageUrl: input.imageUrl,
      folderId: input.folderId,
      sourceStartMs: input.sourceStartMs,
      sourceEndMs: input.sourceEndMs,
      sourceUrl: input.sourceUrl,
      sourceTitle: input.sourceTitle,
      sourceKind: input.sourceKind ?? 'video',
    };
    await saveLeitnerCard(card);
    set({ cards: [...get().cards, card] });
    pushCard(card).catch(() => {});

    // Background: extract a short audio clip when we have video + range and no audioUrl yet.
    if (
      !card.audioUrl &&
      card.sourceVideoId &&
      typeof card.sourceStartMs === 'number' &&
      typeof card.sourceEndMs === 'number' &&
      card.sourceEndMs > card.sourceStartMs
    ) {
      void (async () => {
        try {
          const url = await extractAndUploadClip({
            videoId: card.sourceVideoId!,
            startMs: card.sourceStartMs!,
            endMs: card.sourceEndMs!,
            cardId: card.id,
          });
          if (url) await get().updateCard(card.id, { audioUrl: url });
        } catch (e) {
          console.warn('auto clip extract failed', e);
        }
      })();
    }
    return 'added';
  }) as LeitnerState['addCard'],
  updateCard: async (id, patch) => {
    const card = get().cards.find((c) => c.id === id);
    if (!card) return;
    const updated = { ...card, ...patch };
    await saveLeitnerCard(updated);
    set({ cards: get().cards.map((c) => (c.id === id ? updated : c)) });
    pushCard(updated).catch(() => {});
  },
  reviewCard: async (id, correct) => {
    const card = get().cards.find((c) => c.id === id);
    if (!card) return;
    const updated = applyReview(card, correct);
    await saveLeitnerCard(updated);
    set({ cards: get().cards.map((c) => (c.id === id ? updated : c)) });
    pushCard(updated).catch(() => {});
  },
  rateCard: async (id, rating, opts) => {
    const card = get().cards.find((c) => c.id === id);
    if (!card) return;
    // Snapshot for undo (deep clone the bits that change)
    set({ lastReviewSnapshot: { ...card, reviewLog: [...(card.reviewLog ?? [])] } });
    if (opts?.ephemeral) {
      // Cram: don't persist the schedule, just remember snapshot for undo parity.
      return;
    }
    const updated = applyAnswer(card, rating);
    await saveLeitnerCard(updated);
    set({ cards: get().cards.map((c) => (c.id === id ? updated : c)) });
    pushCard(updated).catch(() => {});
  },
  lastReviewSnapshot: null,
  undoLastReview: async () => {
    const snap = get().lastReviewSnapshot;
    if (!snap) return null;
    await saveLeitnerCard(snap);
    set({
      cards: get().cards.map((c) => (c.id === snap.id ? snap : c)),
      lastReviewSnapshot: null,
    });
    pushCard(snap).catch(() => {});
    return snap.id;
  },
  deleteCard: async (id) => {
    await dbDeleteCard(id);
    set({ cards: get().cards.filter((c) => c.id !== id) });
    deleteRemoteCard(id).catch(() => {});
  },
  toggleStar: async (id) => {
    const card = get().cards.find((c) => c.id === id);
    if (!card) return;
    const updated = { ...card, starred: !card.starred };
    await saveLeitnerCard(updated);
    set({ cards: get().cards.map((c) => (c.id === id ? updated : c)) });
    pushCard(updated).catch(() => {});
  },
  getDueCards: (now = Date.now(), folderId) => {
    const base = folderId
      ? get().cards.filter((c) => c.folderId === folderId)
      : get().cards;
    return sortDue(base.filter((c) => c.nextReview <= now));
  },
  getProfileQueue: (profile, folderId, limit) => {
    const now = Date.now();
    const base = folderId
      ? get().cards.filter((c) => c.folderId === folderId)
      : get().cards;
    let list: LeitnerCard[];
    switch (profile) {
      case 'starred':
        list = sortDue(base.filter((c) => c.starred));
        break;
      case 'cram':
        // Ignore SRS schedule — review everything in scope.
        list = sortDue(base);
        break;
      case 'listening':
        list = sortDue(base.filter((c) => c.audioUrl));
        break;
      case 'quick': {
        const due = sortDue(base.filter((c) => c.nextReview <= now));
        list = due.slice(0, limit ?? 10);
        break;
      }
      case 'due':
      default: {
        const due = sortDue(base.filter((c) => c.nextReview <= now));
        list = applyDailyLimits(due, get().cards, { now });
      }
    }
    return typeof limit === 'number' ? list.slice(0, limit) : list;
  },
  getBoxStats: (now = Date.now(), folderId) => {
    const stats: BoxStats = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, total: 0, due: 0 };
    const list = folderId
      ? get().cards.filter((c) => c.folderId === folderId)
      : get().cards;
    for (const c of list) {
      stats[c.box] += 1;
      stats.total += 1;
      if (c.nextReview <= now) stats.due += 1;
    }
    return stats;
  },
  findByFront: (front) => {
    const key = normalizeFront(front);
    return get().cards.find((c) => normalizeFront(c.front) === key);
  },
  cardsInFolder: (folderId) =>
    folderId
      ? get().cards.filter((c) => c.folderId === folderId)
      : get().cards,
}));
