import type { SubtitleCue } from '@/types';

export class GroqError extends Error {
  code: 'missing_key' | 'rate_limit' | 'auth' | 'invalid_response' | 'network' | 'unknown';
  constructor(code: GroqError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'GroqError';
  }
}

const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  words?: WhisperWord[];
}

interface WhisperResponse {
  segments?: WhisperSegment[];
  words?: WhisperWord[];
  text?: string;
}

export async function transcribeWithGroq(
  file: File | Blob,
  apiKey: string,
  language: string = 'en',
  model: string = 'whisper-large-v3-turbo',
  /** Seconds to add to each segment time — for chunked uploads. */
  timeOffsetSec: number = 0,
  /** Starting cue index — for chunked uploads. */
  indexOffset: number = 0,
): Promise<SubtitleCue[]> {
  if (!apiKey) throw new GroqError('missing_key', 'Groq API key is not set.');

  const filename = (file as File).name ?? 'audio.wav';
  const form = new FormData();
  form.append('file', file, filename);
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('language', language);
  // Request both segment and word level timestamps for karaoke highlighting.
  form.append('timestamp_granularities[]', 'segment');
  form.append('timestamp_granularities[]', 'word');

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch {
    throw new GroqError('network', 'Network error while contacting Groq.');
  }

  if (res.status === 429) throw new GroqError('rate_limit', 'Groq rate limit hit.');
  if (res.status === 401 || res.status === 403)
    throw new GroqError('auth', 'Groq rejected the API key.');
  if (res.status === 413)
    throw new GroqError('unknown', 'Audio chunk too large for Groq (max 25 MB).');
  if (!res.ok) throw new GroqError('unknown', `Groq error (${res.status}).`);

  let data: WhisperResponse;
  try {
    data = await res.json();
  } catch {
    throw new GroqError('invalid_response', 'Groq returned non-JSON.');
  }

  const segments = data.segments ?? [];
  const flatWords = data.words ?? [];

  if (!segments.length) throw new GroqError('invalid_response', 'No transcription segments.');

  return segments
    .map((s, i) => {
      // Prefer per-segment words; otherwise slice from the flat word list by time.
      let segWords = s.words;
      if ((!segWords || !segWords.length) && flatWords.length) {
        segWords = flatWords.filter((w) => w.start >= s.start - 0.05 && w.end <= s.end + 0.05);
      }
      const words = (segWords ?? [])
        .map((w) => ({
          text: (w.word ?? '').trim(),
          startMs: Math.round((w.start + timeOffsetSec) * 1000),
          endMs: Math.round((w.end + timeOffsetSec) * 1000),
        }))
        .filter((w) => w.text);

      return {
        id: uuid(),
        index: indexOffset + i + 1,
        startMs: Math.round((s.start + timeOffsetSec) * 1000),
        endMs: Math.round((s.end + timeOffsetSec) * 1000),
        text: (s.text ?? '').trim(),
        words: words.length ? words : undefined,
      };
    })
    .filter((c) => c.text && c.endMs > c.startMs);
}

export async function pingGroq(apiKey: string): Promise<boolean> {
  if (!apiKey) throw new GroqError('missing_key', 'Groq API key is not set.');
  // Tiny silent wav (44 bytes RIFF header) — request tiny transcription
  const silent = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
    0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x40, 0x1f, 0x00, 0x00, 0x80, 0x3e, 0x00, 0x00,
    0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
  ]);
  const blob = new Blob([silent], { type: 'audio/wav' });
  const form = new FormData();
  form.append('file', blob, 'ping.wav');
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'json');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (res.status === 401 || res.status === 403) throw new GroqError('auth', 'Invalid Groq key.');
  if (res.status === 429) throw new GroqError('rate_limit', 'Groq rate limit.');
  if (!res.ok && res.status !== 400) {
    // 400 means the audio was rejected but auth worked — still a successful "ping"
    throw new GroqError('unknown', `Groq error (${res.status}).`);
  }
  return true;
}
