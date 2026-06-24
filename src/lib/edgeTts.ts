/** Stable Persian/English MP3 TTS via the `edge-tts` backend function.
 *
 * Microsoft Edge's public Read Aloud endpoint blocks cloud servers, so the
 * backend uses the managed Lovable AI TTS gateway while keeping the old engine
 * name for UI/backwards compatibility. This module adds client-side MP3
 * caching so repeated paragraphs/chapters play offline and don't regenerate.
 */
import { supabase } from '@/integrations/supabase/client';

export interface EdgeTtsVoiceOpt {
  id: string;
  label: string;
  lang: 'fa' | 'en';
}

export const EDGE_TTS_VOICES: EdgeTtsVoiceOpt[] = [
  { id: 'fa-IR-DilaraNeural', label: 'Dilara — فارسی (زن)', lang: 'fa' },
  { id: 'fa-IR-FaridNeural', label: 'Farid — فارسی (مرد)', lang: 'fa' },
  { id: 'en-US-AriaNeural', label: 'Aria — English (US, F)', lang: 'en' },
  { id: 'en-US-GuyNeural', label: 'Guy — English (US, M)', lang: 'en' },
  { id: 'en-US-JennyNeural', label: 'Jenny — English (US, F)', lang: 'en' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia — English (UK, F)', lang: 'en' },
  { id: 'en-GB-RyanNeural', label: 'Ryan — English (UK, M)', lang: 'en' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha — English (AU, F)', lang: 'en' },
];

export class EdgeTtsError extends Error {
  constructor(public code: 'network' | 'quota' | 'other', msg: string) {
    super(msg);
  }
}

const DB_NAME = 'llvp-edge-tts-cache';
const DB_VERSION = 1;
const STORE = 'mp3_blobs';
const MAX_CHARS_PER_CHUNK = 2800;

let dbPromise: Promise<IDBDatabase> | null = null;

function openCacheDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function cacheGet(key: string): Promise<Blob | null> {
  try {
    const db = await openCacheDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function cachePut(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Cache is an optimization; synthesis should still work if storage fails.
  }
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function chunkTextForMp3(text: string, maxChars = MAX_CHARS_PER_CHUNK): string[] {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  if (!clean) return [];
  const blocks = clean.split(/\n{2,}/g).map((b) => b.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };
  const pushPiece = (piece: string) => {
    const p = piece.trim();
    if (!p) return;
    if (p.length > maxChars) {
      flush();
      const words = p.match(/\S+/g) ?? [];
      let buf = '';
      for (const word of words) {
        if ((buf + ' ' + word).trim().length > maxChars) {
          if (buf) chunks.push(buf.trim());
          buf = word;
        } else {
          buf = buf ? `${buf} ${word}` : word;
        }
      }
      if (buf) chunks.push(buf.trim());
      return;
    }
    if (current && (current + ' ' + p).trim().length > maxChars) flush();
    current = current ? `${current} ${p}` : p;
  };
  for (const block of blocks) {
    const sentences = block.match(/[^.!?؟。]+[.!?؟。]+|[^.!?؟。]+$/g) ?? [block];
    for (const sentence of sentences) pushPiece(sentence);
    flush();
  }
  flush();
  return chunks;
}

function rateToEdge(rate: number | undefined): string {
  const r = typeof rate === 'number' && Number.isFinite(rate) ? rate : 1;
  const pct = Math.round((r - 1) * 100);
  const clamped = Math.max(-50, Math.min(100, pct));
  return clamped >= 0 ? `+${clamped}%` : `${clamped}%`;
}

export async function synthesizeWithEdgeTts(params: {
  text: string;
  voice: string;
  rate?: number;
  force?: boolean;
}): Promise<Blob> {
  const { text, voice } = params;
  if (!text?.trim()) throw new EdgeTtsError('other', 'متن خالی است.');
  if (!voice?.trim()) throw new EdgeTtsError('other', 'صدا انتخاب نشده است.');
  const normalizedRate = typeof params.rate === 'number' && Number.isFinite(params.rate) ? params.rate : 1;
  const cacheKey = `full:v2:${await sha256(`${voice}|${normalizedRate}|${text.trim()}`)}`;
  if (!params.force) {
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;
  }

  const rate = rateToEdge(normalizedRate);
  const chunks = chunkTextForMp3(text);
  if (chunks.length === 0) throw new EdgeTtsError('other', 'متن خالی است.');
  const blobs: Blob[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkKey = `chunk:v2:${await sha256(`${voice}|${normalizedRate}|${chunk}`)}`;
    let blob = params.force ? null : await cacheGet(chunkKey);
    if (!blob) {
      blob = await synthesizeEdgeTtsChunk({ text: chunk, voice, rate });
      await cachePut(chunkKey, blob);
    }
    blobs.push(blob);
  }

  const merged = new Blob(blobs, { type: 'audio/mpeg' });
  await cachePut(cacheKey, merged);
  return merged;
}

async function synthesizeEdgeTtsChunk(params: {
  text: string;
  voice: string;
  rate: string;
}): Promise<Blob> {
  const { text, voice, rate } = params;
  const { data, error } = await supabase.functions.invoke('edge-tts', {
    body: { text, voice, rate, pitch: '+0Hz' },
  });
  if (error) {
    const msg = error.message || 'Edge TTS ناموفق';
    if (/429|rate/i.test(msg)) throw new EdgeTtsError('quota', msg);
    if (/network|fetch/i.test(msg)) throw new EdgeTtsError('network', msg);
    throw new EdgeTtsError('other', msg);
  }
  if (!data) throw new EdgeTtsError('other', 'Edge TTS پاسخی برنگرداند.');
  // supabase.functions.invoke returns Blob for non-JSON content-types
  if (data instanceof Blob) return data;
  if (data instanceof ArrayBuffer) return new Blob([data], { type: 'audio/mpeg' });
  // Fallback: server might have returned JSON error as object
  if (typeof data === 'object' && (data as { error?: string }).error) {
    throw new EdgeTtsError('other', (data as { error: string }).error);
  }
  throw new EdgeTtsError('other', 'پاسخ نامعتبر از Edge TTS.');
}
