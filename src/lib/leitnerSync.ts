import { supabase } from "@/integrations/supabase/client";
import type { LeitnerCard } from "@/types";
import { useLeitnerStore } from "@/store/leitnerStore";
import { useLeitnerFolderStore } from "@/store/leitnerFolderStore";
import {
  saveLeitnerCard,
  deleteLeitnerCard,
  getAllLeitnerCards,
  saveLeitnerFolder,
} from "@/lib/db";
import { normalizeFront, nextReviewFor } from "@/lib/leitner";
import { setFolderSyncUser, pullFolders } from "@/lib/leitnerFolderSync";
import { toast } from "sonner";

/**
 * App identifier — change per project (e.g., "video", "news").
 * Cards from different apps live in the same table and merge per-user.
 */
export const SOURCE_APP = "video";

interface RemoteRow {
  id: string;
  user_id: string;
  front: string;
  front_normalized: string;
  back: string;
  box: number;
  next_review: string;
  last_reviewed: string | null;
  source_app: string;
  source_ref: string | null;
  source_cue_id: string | null;
  client_id: string | null;
  created_at: string;
  updated_at: string;
  example_sentence: string | null;
  audio_url: string | null;
  image_url: string | null;
  folder_id: string | null;
  source_start_ms: number | null;
  source_end_ms: number | null;
  source_url: string | null;
  source_title: string | null;
  last_interval_ms: number | null;
  lapse_count: number | null;
  ease_factor: number | null;
  review_log: unknown;
  cefr: string | null;
  part_of_speech: string | null;
  starred: boolean | null;
  synonyms: string[] | null;
  antonyms: string[] | null;
}

function rowToCard(r: RemoteRow): LeitnerCard {
  return {
    id: r.client_id || r.id,
    front: r.front,
    back: r.back,
    box: Math.min(5, Math.max(1, r.box)) as 1 | 2 | 3 | 4 | 5,
    nextReview: new Date(r.next_review).getTime(),
    lastReviewed: r.last_reviewed ? new Date(r.last_reviewed).getTime() : undefined,
    sourceVideoId: r.source_ref ?? undefined,
    sourceCueId: r.source_cue_id ?? undefined,
    createdAt: new Date(r.created_at).getTime(),
    exampleSentence: r.example_sentence ?? undefined,
    audioUrl: r.audio_url ?? undefined,
    imageUrl: r.image_url ?? undefined,
    folderId: r.folder_id ?? undefined,
    sourceStartMs: r.source_start_ms ?? undefined,
    sourceEndMs: r.source_end_ms ?? undefined,
    sourceUrl: r.source_url ?? undefined,
    sourceTitle: r.source_title ?? undefined,
    sourceKind: (r.source_app as LeitnerCard["sourceKind"]) ?? undefined,
    lastIntervalMs: r.last_interval_ms ?? undefined,
    lapseCount: r.lapse_count ?? 0,
    easeFactor: typeof r.ease_factor === "number" ? r.ease_factor : 2.0,
    reviewLog: Array.isArray(r.review_log) ? (r.review_log as LeitnerCard["reviewLog"]) : [],
    cefr: (r.cefr as LeitnerCard["cefr"]) ?? undefined,
    partOfSpeech: r.part_of_speech ?? undefined,
    starred: r.starred ?? false,
    synonyms: Array.isArray(r.synonyms) ? r.synonyms : [],
    antonyms: Array.isArray(r.antonyms) ? r.antonyms : [],
  };
}

function cardToRow(card: LeitnerCard, userId: string) {
  return {
    user_id: userId,
    front: card.front,
    front_normalized: normalizeFront(card.front),
    back: card.back,
    box: card.box,
    next_review: new Date(card.nextReview).toISOString(),
    last_reviewed: card.lastReviewed ? new Date(card.lastReviewed).toISOString() : null,
    source_app: card.sourceKind ?? SOURCE_APP,
    source_ref: card.sourceVideoId ?? null,
    source_cue_id: card.sourceCueId ?? null,
    client_id: card.id,
    example_sentence: card.exampleSentence ?? null,
    audio_url: card.audioUrl ?? null,
    image_url: card.imageUrl ?? null,
    folder_id: card.folderId ?? null,
    source_start_ms: card.sourceStartMs ?? null,
    source_end_ms: card.sourceEndMs ?? null,
    source_url: card.sourceUrl ?? null,
    source_title: card.sourceTitle ?? null,
    last_interval_ms: card.lastIntervalMs ?? null,
    lapse_count: card.lapseCount ?? 0,
    ease_factor: card.easeFactor ?? 2.0,
    review_log: (card.reviewLog ?? []) as unknown as object[],
    cefr: card.cefr ?? null,
    part_of_speech: card.partOfSpeech ?? null,
    starred: card.starred ?? false,
    synonyms: card.synonyms ?? [],
    antonyms: card.antonyms ?? [],
  };
}

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let currentUserId: string | null = null;

/** Pull-merge: fetch remote cards and reconcile with local IndexedDB. */
export async function pullAndMerge(userId: string): Promise<void> {
  const { data, error } = await supabase.from("leitner_cards").select("*").eq("user_id", userId);
  if (error) {
    console.error("pullAndMerge failed", error);
    toast.error("Sync failed — could not fetch your cards.");
    return;
  }
  const remoteRows = (data ?? []) as RemoteRow[];
  const localCards = await getAllLeitnerCards();

  // Build maps by normalized front
  const remoteByKey = new Map<string, RemoteRow>();
  for (const r of remoteRows) remoteByKey.set(r.front_normalized, r);

  const localByKey = new Map<string, LeitnerCard>();
  for (const c of localCards) localByKey.set(normalizeFront(c.front), c);

  // 1. Push local cards missing remotely
  const toUpsert: ReturnType<typeof cardToRow>[] = [];
  for (const c of localCards) {
    const key = normalizeFront(c.front);
    if (!remoteByKey.has(key)) {
      toUpsert.push(cardToRow(c, userId));
    }
  }
  if (toUpsert.length > 0) {
    const { error: upErr } = await supabase
      .from("leitner_cards")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(toUpsert as any, { onConflict: "user_id,front_normalized" });
    if (upErr) console.error("pushNew failed", upErr);
  }

  // 2. Pull remote cards into local IndexedDB (latest wins by updated_at vs local lastReviewed/createdAt)
  for (const r of remoteRows) {
    const local = localByKey.get(r.front_normalized);
    const remoteCard = rowToCard(r);
    if (!local) {
      await saveLeitnerCard(remoteCard);
    } else {
      const remoteTs = new Date(r.updated_at).getTime();
      const localTs = local.lastReviewed ?? local.createdAt;
      if (remoteTs >= localTs) {
        // Remote is newer — overwrite local but keep local id stability when client_id matches
        await saveLeitnerCard({ ...remoteCard, id: local.id });
      }
    }
  }

  // Refresh in-memory store
  const fresh = await getAllLeitnerCards();
  useLeitnerStore.setState({ cards: fresh });
}

/** Push a single card (insert or update) to cloud. Safe to call without auth (no-op). */
export async function pushCard(card: LeitnerCard): Promise<void> {
  if (!currentUserId) return;
  const row = cardToRow(card, currentUserId);
  const { error } = await supabase
    .from("leitner_cards")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(row as any, { onConflict: "user_id,front_normalized" });
  if (error) console.error("pushCard failed", error);
}

/** Delete a card on the cloud (by client_id). */
export async function deleteRemoteCard(clientId: string): Promise<void> {
  if (!currentUserId) return;
  const { error } = await supabase
    .from("leitner_cards")
    .delete()
    .eq("user_id", currentUserId)
    .eq("client_id", clientId);
  if (error) console.error("deleteRemoteCard failed", error);
}

/** Subscribe to realtime updates for the current user. */
function subscribeRealtime(userId: string) {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase
    .channel(`leitner-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "leitner_cards", filter: `user_id=eq.${userId}` },
      async (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as Partial<RemoteRow>;
          const id = (old.client_id as string) || (old.id as string);
          if (id) {
            await deleteLeitnerCard(id).catch(() => undefined);
            useLeitnerStore.setState({
              cards: useLeitnerStore.getState().cards.filter((c) => c.id !== id),
            });
          }
        } else {
          const r = payload.new as RemoteRow;
          const card = rowToCard(r);
          await saveLeitnerCard(card);
          const cards = useLeitnerStore.getState().cards;
          const idx = cards.findIndex((c) => normalizeFront(c.front) === r.front_normalized);
          if (idx >= 0) {
            const next = [...cards];
            next[idx] = card;
            useLeitnerStore.setState({ cards: next });
          } else {
            useLeitnerStore.setState({ cards: [...cards, card] });
          }
        }
      },
    )
    .subscribe();
}

/** Start sync for a user — pull-merge + realtime. */
export async function startSync(userId: string): Promise<void> {
  const isFirstStart = currentUserId !== userId;
  currentUserId = userId;
  setFolderSyncUser(userId);
  const before = (await getAllLeitnerCards()).length;
  await pullAndMerge(userId);

  // Pull folders into local store
  try {
    const remoteFolders = await pullFolders(userId);
    for (const f of remoteFolders) await saveLeitnerFolder(f);
    await useLeitnerFolderStore.getState().load();
  } catch (e) {
    console.error("folder sync failed", e);
  }

  subscribeRealtime(userId);
  if (isFirstStart) {
    const after = (await getAllLeitnerCards()).length;
    const diff = after - before;
    if (diff > 0) {
      toast.success(`Synced ${diff} card${diff === 1 ? "" : "s"} from your account.`);
    } else {
      toast.success("Cards synced.");
    }
  }
}

/** Stop sync (on sign out). */
export async function stopSync(): Promise<void> {
  currentUserId = null;
  setFolderSyncUser(null);
  if (realtimeChannel) {
    await supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

export function isSyncActive(): boolean {
  return currentUserId !== null;
}

// Re-export for convenience
export { nextReviewFor };
