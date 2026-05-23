/**
 * Extract a short audio clip from a video/audio source URL between two
 * timestamps (ms), upload it to the private `leitner-audio` bucket,
 * and return a long-lived signed URL for playback.
 *
 * Pure browser code — uses WebAudio decoding (works on the same blob URLs
 * stored in IndexedDB). Falls back gracefully when sources aren't available.
 */
import { supabase } from '@/integrations/supabase/client';
import { getVideoBlob } from '@/lib/db';

const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year

async function blobFromMedia(videoId: string): Promise<Blob | null> {
  const b = await getVideoBlob(videoId);
  return b ?? null;
}

/** Decode the source media to a mono Float32Array at its native sample rate. */
async function decode(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const buf = await blob.arrayBuffer();
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    const ch0 = decoded.getChannelData(0);
    const out = new Float32Array(ch0.length);
    out.set(ch0);
    return { samples: out, sampleRate: decoded.sampleRate };
  } finally {
    void ctx.close();
  }
}

/** Encode mono samples to a 16-bit PCM WAV. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataLen = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  v.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, 'data');
  v.setUint32(40, dataLen, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export interface ExtractInput {
  /** Video/audio id (looked up in IndexedDB blob store). */
  videoId: string;
  startMs: number;
  endMs: number;
  /** Stable card id used to namespace the storage path. */
  cardId: string;
  /** Hard cap (ms). Default 5000. Padding added to start/end. */
  maxDurationMs?: number;
  /** Padding (ms) added before start / after end. Default 200. */
  paddingMs?: number;
}

/**
 * Extract a clip and upload to `leitner-audio` bucket.
 * Returns a signed URL or `null` on failure (silent — the card just keeps TTS).
 */
export async function extractAndUploadClip(input: ExtractInput): Promise<string | null> {
  const {
    videoId,
    startMs,
    endMs,
    cardId,
    maxDurationMs = 5000,
    paddingMs = 200,
  } = input;
  if (endMs <= startMs) return null;

  try {
    const blob = await blobFromMedia(videoId);
    if (!blob) return null;

    const { samples, sampleRate } = await decode(blob);
    const safeStart = Math.max(0, startMs - paddingMs);
    const safeEnd = Math.min(samples.length / sampleRate * 1000, endMs + paddingMs);
    const duration = Math.min(maxDurationMs, safeEnd - safeStart);
    if (duration <= 100) return null;

    const startSample = Math.floor((safeStart / 1000) * sampleRate);
    const endSample = Math.floor((safeStart + duration) / 1000 * sampleRate);
    const slice = samples.subarray(startSample, endSample);
    const wav = encodeWav(slice, sampleRate);

    // Resolve user id for storage path (RLS expects {uid}/...).
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return null;

    const path = `${uid}/${cardId}.wav`;
    const { error: upErr } = await supabase.storage
      .from('leitner-audio')
      .upload(path, wav, { contentType: 'audio/wav', upsert: true });
    if (upErr) {
      console.error('clip upload failed', upErr);
      return null;
    }
    const { data: signed } = await supabase.storage
      .from('leitner-audio')
      .createSignedUrl(path, SIGNED_URL_TTL);
    return signed?.signedUrl ?? null;
  } catch (e) {
    console.error('extractAndUploadClip failed', e);
    return null;
  }
}
