/**
 * TTS caching service for Sentence Lab.
 *
 * Order of operations (per sentence + language):
 *  1. In-memory map (this page session)
 *  2. HEAD on public Supabase Storage URL  ← shared cache, no API call
 *  3. Generate locally with Gemini TTS (user's key from settings)
 *     and upload via the `sentence-tts-upload` edge function so every
 *     other user benefits from the cache too.
 *
 * The bucket is public, so once any user has generated audio for a sentence,
 * everyone — and every future session — gets it via a plain HTTP GET.
 */

import { supabase } from "@/integrations/supabase/client";
import { useSettingsStore } from "@/store/settingsStore";
import { synthesizeText, type GeminiTtsVoice } from "@/lib/geminiTts";
import { getOfflineAudioUrl, saveOfflineAudio, downloadAndCache } from "@/lib/audioOfflineCache";

const BUCKET = "sentence-audio";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

/** In-memory cache of resolved URLs (per page session). */
const memCache = new Map<string, string>();
/** De-dupes concurrent requests for the same (id, lang). */
const inflight = new Map<string, Promise<string>>();

const DEFAULT_VOICE: Record<string, GeminiTtsVoice> = {
  en: "Charon",
  fa: "Aoede",
};

function key(sentenceId: string, lang: string): string {
  return `${sentenceId}::${lang}`;
}

function safe(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function publicUrlFor(sentenceId: string, lang: string): string {
  const path = `${safe(sentenceId)}_${safe(lang)}.wav`;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** HEAD probe — confirms the cached file is actually downloadable. */
async function existsInBucket(sentenceId: string, lang: string): Promise<boolean> {
  try {
    const res = await fetch(publicUrlFor(sentenceId, lang), { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function uploadToCache(sentenceId: string, lang: string, blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("sentenceId", sentenceId);
  form.append("lang", lang);
  form.append("file", blob, `${safe(sentenceId)}_${safe(lang)}.wav`);
  const { data, error } = await supabase.functions.invoke("sentence-tts-upload", {
    body: form,
  });
  if (error) throw new Error(error.message ?? "Upload failed");
  const url = (data as { url?: string })?.url;
  if (!url) throw new Error("Upload returned no URL");
  return url;
}

export interface GetSentenceAudioOptions {
  voice?: GeminiTtsVoice;
  /** Force regenerate even if cached. */
  force?: boolean;
}

/**
 * Resolve a playable URL for a sentence's audio in the requested language.
 * Generates + uploads only when the shared cache misses.
 */
export async function getSentenceAudio(
  sentenceId: string,
  lang: "en" | "fa" | string,
  text: string,
  opts: GetSentenceAudioOptions = {},
): Promise<string> {
  const k = key(sentenceId, lang);

  if (!opts.force) {
    const mem = memCache.get(k);
    if (mem) return mem;
    const pending = inflight.get(k);
    if (pending) return pending;
  }

  const task = (async () => {
    // Step 1.5 — IndexedDB offline cache (works without network)
    if (!opts.force) {
      const offline = await getOfflineAudioUrl(sentenceId, lang);
      if (offline) {
        memCache.set(k, offline);
        return offline;
      }
    }

    // Step 2 — shared bucket cache (download + persist offline for next time)
    if (!opts.force && (await existsInBucket(sentenceId, lang))) {
      const remote = publicUrlFor(sentenceId, lang);
      try {
        const blobUrl = await downloadAndCache(sentenceId, lang, remote);
        memCache.set(k, blobUrl);
        return blobUrl;
      } catch {
        memCache.set(k, remote);
        return remote;
      }
    }

    // Step 3 — generate locally with the user's Gemini key
    const settings = useSettingsStore.getState().settings;
    const apiKey = settings.geminiTtsApiKey || settings.geminiApiKey;
    if (!apiKey) {
      throw new Error(
        "No Gemini API key configured. Add one in Settings → AI to enable Podcast Mode.",
      );
    }
    const voice = opts.voice ?? DEFAULT_VOICE[lang] ?? "Charon";
    const blob = await synthesizeText(apiKey, text, voice);

    // Save to offline cache regardless of upload outcome
    void saveOfflineAudio(sentenceId, lang, blob);

    // Upload to shared cache (best-effort — fall back to a local blob URL).
    try {
      const url = await uploadToCache(sentenceId, lang, blob);
      memCache.set(k, url);
      return url;
    } catch (e) {
      console.warn("[sentenceAudio] upload failed, using local blob", e);
      const url = URL.createObjectURL(blob);
      memCache.set(k, url);
      return url;
    }
  })();

  inflight.set(k, task);
  try {
    return await task;
  } finally {
    inflight.delete(k);
  }
}

/** Pre-warm the cache for a list of sentences (sequential, fire-and-forget). */
export async function warmSentenceAudio(
  items: Array<{ id: string; lang: string; text: string }>,
  opts: GetSentenceAudioOptions = {},
): Promise<void> {
  for (const it of items) {
    try {
      await getSentenceAudio(it.id, it.lang, it.text, opts);
    } catch (e) {
      console.warn("[sentenceAudio] warm failed", it.id, it.lang, e);
    }
  }
}

export function clearSentenceAudioCache(): void {
  memCache.clear();
}
