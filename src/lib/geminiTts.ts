/**
 * Google Gemini Text-to-Speech (client-side).
 *
 * Calls the public REST endpoint
 * `models/gemini-2.5-flash-preview-tts:generateContent` with `responseModalities: ["AUDIO"]`.
 * The response is **raw signed 16-bit PCM @ 24 kHz mono** base64-encoded —
 * we wrap it in a minimal WAV header so the browser `<audio>` element can play it.
 *
 * Audio is cached per-chapter in IndexedDB via `bookDb.saveTTSAudio`.
 */

import {
  getTTSAudio,
  saveTTSAudio,
  ttsKey,
  getTTSChunks,
  saveTTSChunk,
  deleteTTSChunks,
  ttsChunkKey,
} from "./bookDb";
import type { BookTTSAudio, BookTTSChunk } from "@/types";

export const GEMINI_TTS_VOICES = [
  { id: "Kore", label: "Kore — firm female" },
  { id: "Puck", label: "Puck — upbeat male" },
  { id: "Charon", label: "Charon — informative male" },
  { id: "Fenrir", label: "Fenrir — excitable male" },
  { id: "Aoede", label: "Aoede — breezy female" },
  { id: "Leda", label: "Leda — youthful female" },
  { id: "Orus", label: "Orus — firm male" },
  { id: "Zephyr", label: "Zephyr — bright female" },
] as const;

export type GeminiTtsVoice = (typeof GEMINI_TTS_VOICES)[number]["id"];

/** Hard cap on a single TTS request (Gemini limit is roughly 32k tokens). */
const MAX_CHARS_PER_REQUEST = 2200;
const MAX_PARALLEL_TTS = 2;

const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

export class GeminiTtsError extends Error {
  code: "auth" | "quota" | "network" | "no-audio" | "too-long" | "unknown";
  status?: number;
  constructor(code: GeminiTtsError["code"], message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/* ─────────────────────────────────────────── chunking ── */

/** Split text into chunks of ≤ MAX_CHARS_PER_REQUEST, breaking on sentence boundaries. */
export function chunkTextForTts(text: string, maxChars = MAX_CHARS_PER_REQUEST): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return [clean];

  const sentences = clean.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).trim().length > maxChars) {
      if (buf) chunks.push(buf.trim());
      // Sentence longer than the limit on its own — hard split.
      if (s.length > maxChars) {
        for (let i = 0; i < s.length; i += maxChars) {
          chunks.push(s.slice(i, i + maxChars));
        }
        buf = "";
      } else {
        buf = s;
      }
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf) chunks.push(buf.trim());
  return chunks;
}

/* ─────────────────────────────────────────── REST call ── */

interface TtsResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { mimeType?: string; data?: string };
      }>;
    };
  }>;
  error?: { message?: string; status?: string; code?: number };
}

async function generateChunkPcm(
  apiKey: string,
  text: string,
  voice: GeminiTtsVoice,
): Promise<{ pcm: Uint8Array; sampleRate: number }> {
  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
      },
    },
  };

  let lastQuotaMessage = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(ENDPOINT(TTS_MODEL, apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new GeminiTtsError("network", "Network error reaching Gemini TTS.");
    }

    const json = (await res.json().catch(() => ({}))) as TtsResponse;

    if (!res.ok) {
      const msg = json.error?.message ?? `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) {
        throw new GeminiTtsError("auth", `Gemini rejected the TTS key: ${msg}`, res.status);
      }
      if (res.status === 429) {
        lastQuotaMessage = msg;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
          continue;
        }
        throw new GeminiTtsError("quota", `TTS quota / rate limit hit: ${msg}`, res.status);
      }
      throw new GeminiTtsError("unknown", `TTS request failed (${res.status}): ${msg}`, res.status);
    }

    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) {
      throw new GeminiTtsError("no-audio", "Gemini returned no audio for this chunk.");
    }

    const pcm = base64ToBytes(part.inlineData.data);
    const mime = part.inlineData.mimeType ?? "";
    const rateMatch = /rate=(\d+)/i.exec(mime);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    return { pcm, sampleRate };
  }

  throw new GeminiTtsError(
    "quota",
    `TTS quota / rate limit hit: ${lastQuotaMessage || "HTTP 429"}`,
    429,
  );
}

/* ─────────────────────────────────────────── public API ── */

export interface ChunkReady {
  index: number; // 1-based
  total: number;
  text: string;
  blob: Blob; // standalone WAV for THIS chunk
  cached: boolean; // true when restored from IndexedDB on this run
}

export interface SynthesizeOptions {
  /** Called after each chunk completes (1-based index, total). */
  onChunkProgress?: (done: number, total: number) => void;
  /**
   * Called every time a chunk's WAV blob is ready — either because it was
   * freshly generated OR loaded from the per-chunk IndexedDB cache. The UI
   * uses this to render a live list of playable paragraphs while the rest
   * of the chapter is still being synthesized.
   */
  onChunkReady?: (chunk: ChunkReady) => void;
  signal?: AbortSignal;
}

/**
 * Synthesize text to a single WAV `Blob` (PCM 16-bit mono), chunking long inputs
 * automatically and concatenating the resulting audio frames.
 */
export async function synthesizeText(
  apiKey: string,
  text: string,
  voice: GeminiTtsVoice,
  opts: SynthesizeOptions = {},
): Promise<Blob> {
  const { onChunkProgress, onChunkReady, signal } = opts;
  const trimmed = text.trim();
  if (!trimmed) throw new GeminiTtsError("no-audio", "Empty text.");

  const chunks = chunkTextForTts(trimmed);
  const pcmParts: Uint8Array[] = [];
  let sampleRate = 24000;

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new GeminiTtsError("unknown", "Cancelled.");
    const { pcm, sampleRate: sr } = await generateChunkPcm(apiKey, chunks[i], voice);
    pcmParts.push(pcm);
    sampleRate = sr;
    if (onChunkReady) {
      const chunkWav = pcmToWav(pcm, sr, 1, 16);
      const chunkBlob = new Blob([chunkWav.buffer as ArrayBuffer], { type: "audio/wav" });
      onChunkReady({
        index: i + 1,
        total: chunks.length,
        text: chunks[i],
        blob: chunkBlob,
        cached: false,
      });
    }
    onChunkProgress?.(i + 1, chunks.length);
  }

  const merged = concatBytes(pcmParts);
  const wav = pcmToWav(merged, sampleRate, 1, 16);
  return new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" });
}

/**
 * Synthesize a chapter, using IndexedDB cache when available.
 *
 * Cache behaviour:
 *   1. Full-chapter blob hit → return immediately (still emits cached
 *      per-chunk blobs first so the per-paragraph list can render).
 *   2. Otherwise: emit any cached per-chunk blobs found, then generate the
 *      missing chunks one by one. Each new chunk is persisted to the
 *      per-chunk store right away so a refresh mid-generation keeps the
 *      already-done paragraphs available offline.
 */
export async function synthesizeChapter(
  apiKey: string,
  bookId: string,
  chapterIndex: number,
  text: string,
  voice: GeminiTtsVoice,
  opts: SynthesizeOptions & { force?: boolean } = {},
): Promise<{ blob: Blob; cached: boolean }> {
  const { onChunkReady, onChunkProgress, signal, force } = opts;

  // 1) Always replay cached per-chunk blobs first (so the UI list lights up
  //    instantly even when the full blob is available too).
  let cachedChunks: BookTTSChunk[] = [];
  if (!force) {
    try {
      cachedChunks = await getTTSChunks(bookId, chapterIndex, voice);
    } catch {
      cachedChunks = [];
    }
    for (const c of cachedChunks) {
      onChunkReady?.({
        index: c.chunkIndex + 1,
        total: c.total,
        text: c.text,
        blob: c.blob,
        cached: true,
      });
    }
  } else {
    // Force regenerate → wipe per-chunk cache too.
    try {
      await deleteTTSChunks(bookId, chapterIndex, voice);
    } catch {
      /* noop */
    }
  }

  // 2) Full-chapter hit short-circuits actual synthesis.
  if (!force) {
    const hit = await getTTSAudio(bookId, chapterIndex, voice);
    if (hit) {
      // Make sure progress UI shows complete.
      if (cachedChunks.length > 0) {
        onChunkProgress?.(cachedChunks.length, cachedChunks.length);
      }
      return { blob: hit.blob, cached: true };
    }
  }

  // 3) Synthesize missing chunks. We resume from the highest cached index.
  const trimmed = text.trim();
  if (!trimmed) throw new GeminiTtsError("no-audio", "Empty text.");
  const allChunks = chunkTextForTts(trimmed);

  // Build PCM array, filling from cached chunk WAVs where possible.
  const pcmParts: Uint8Array[] = new Array(allChunks.length);
  let sampleRate = 24000;
  for (const c of cachedChunks) {
    if (c.chunkIndex < allChunks.length) {
      try {
        const buf = new Uint8Array(await c.blob.arrayBuffer());
        // Strip 44-byte WAV header to get raw PCM back for concatenation.
        if (buf.length > 44) pcmParts[c.chunkIndex] = buf.subarray(44);
      } catch {
        /* skip */
      }
    }
  }

  // Synthesize missing chunks with a tiny concurrency limit. This makes long
  // Persian narration noticeably faster while keeping requests gentle enough
  // to avoid most rate-limit spikes. Each chunk is still saved immediately.
  let completed = pcmParts.filter(Boolean).length;
  const missing = allChunks.map((_, i) => i).filter((i) => !pcmParts[i]);
  let cursor = 0;
  async function worker() {
    while (cursor < missing.length) {
      const i = missing[cursor++];
      if (signal?.aborted) throw new GeminiTtsError("unknown", "Cancelled.");
      const { pcm, sampleRate: sr } = await generateChunkPcm(apiKey, allChunks[i], voice);
      pcmParts[i] = pcm;
      sampleRate = sr;
      const chunkWav = pcmToWav(pcm, sr, 1, 16);
      const chunkBlob = new Blob([chunkWav.buffer as ArrayBuffer], { type: "audio/wav" });
      try {
        await saveTTSChunk({
          id: ttsChunkKey(bookId, chapterIndex, voice, i),
          bookId,
          chapterIndex,
          voice,
          chunkIndex: i,
          total: allChunks.length,
          text: allChunks[i],
          blob: chunkBlob,
          mimeType: "audio/wav",
          createdAt: Date.now(),
        });
      } catch {
        /* non-fatal */
      }
      onChunkReady?.({
        index: i + 1,
        total: allChunks.length,
        text: allChunks[i],
        blob: chunkBlob,
        cached: false,
      });
      completed += 1;
      onChunkProgress?.(completed, allChunks.length);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(MAX_PARALLEL_TTS, missing.length) }, () => worker()),
  );

  const merged = concatBytes(pcmParts.filter(Boolean) as Uint8Array[]);
  const wav = pcmToWav(merged, sampleRate, 1, 16);
  const blob = new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" });

  const row: BookTTSAudio = {
    id: ttsKey(bookId, chapterIndex, voice),
    bookId,
    chapterIndex,
    voice,
    blob,
    mimeType: blob.type,
    textLength: text.length,
    createdAt: Date.now(),
  };
  await saveTTSAudio(row);
  return { blob, cached: false };
}

/* ─────────────────────────────────────────── helpers ── */

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Wrap raw little-endian PCM in a minimal WAV (RIFF) container. */
function pcmToWav(
  pcm: Uint8Array,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
): Uint8Array {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let p = 0;
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i));
  };
  writeStr("RIFF");
  view.setUint32(p, 36 + dataSize, true);
  p += 4;
  writeStr("WAVE");
  writeStr("fmt ");
  view.setUint32(p, 16, true);
  p += 4; // PCM chunk size
  view.setUint16(p, 1, true);
  p += 2; // format = PCM
  view.setUint16(p, channels, true);
  p += 2;
  view.setUint32(p, sampleRate, true);
  p += 4;
  view.setUint32(p, byteRate, true);
  p += 4;
  view.setUint16(p, blockAlign, true);
  p += 2;
  view.setUint16(p, bitsPerSample, true);
  p += 2;
  writeStr("data");
  view.setUint32(p, dataSize, true);
  p += 4;
  new Uint8Array(buffer, 44).set(pcm);
  return new Uint8Array(buffer);
}
