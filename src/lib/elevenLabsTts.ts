/**
 * Browser-side helper for calling our `elevenlabs-tts` edge function.
 * Returns an MP3 Blob which can be fed straight into <audio src=...>.
 */
import { supabase } from '@/integrations/supabase/client';

export interface ElevenLabsVoiceOpt {
  id: string;
  label: string;
  /** Locale hint shown in the picker. */
  lang: 'multi' | 'en' | 'fa';
}

/** Curated subset of well-known multilingual voices. */
export const ELEVENLABS_VOICES: ElevenLabsVoiceOpt[] = [
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah — clear female', lang: 'multi' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George — warm male', lang: 'multi' },
  { id: 'cgSgspJ2msm6clMCkdW9', label: 'Jessica — friendly female', lang: 'multi' },
  { id: 'IKne3meq5aSn9XLyUdCD', label: 'Charlie — natural male', lang: 'multi' },
  { id: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda — soft female', lang: 'multi' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', label: 'Liam — bright male', lang: 'multi' },
  { id: 'nPczCjzI2devNBz1zQrb', label: 'Brian — deep narrator', lang: 'multi' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', label: 'Laura — upbeat female', lang: 'multi' },
];

export const ELEVENLABS_MODELS = [
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2 (EN + فارسی)' },
  { id: 'eleven_turbo_v2_5', label: 'Turbo v2.5 (fast)' },
] as const;

export class ElevenLabsTtsError extends Error {
  constructor(public code: 'auth' | 'quota' | 'network' | 'other', msg: string) {
    super(msg);
  }
}

export async function synthesizeWithElevenLabs(params: {
  apiKey: string;
  text: string;
  voiceId: string;
  modelId?: string;
  language?: 'en' | 'fa';
}): Promise<Blob> {
  const { apiKey, text, voiceId, modelId, language } = params;
  if (!apiKey?.trim()) throw new ElevenLabsTtsError('auth', 'Missing ElevenLabs key.');
  if (!text?.trim()) throw new ElevenLabsTtsError('other', 'Empty text.');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ apiKey, text, voiceId, modelId, language }),
  });
  if (!res.ok) {
    let msg = `ElevenLabs ${res.status}`;
    try { const j = await res.json(); msg = j.error ?? msg; } catch {/* */}
    if (res.status === 401) throw new ElevenLabsTtsError('auth', msg);
    if (res.status === 429) throw new ElevenLabsTtsError('quota', msg);
    throw new ElevenLabsTtsError('other', msg);
  }
  return res.blob();
}
