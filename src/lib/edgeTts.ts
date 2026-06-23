/**
 * Microsoft Edge "Read Aloud" TTS via the `edge-tts` Supabase Edge Function.
 * Free, no API key needed. Great Persian quality (fa-IR-DilaraNeural / FaridNeural).
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
}): Promise<Blob> {
  const { text, voice } = params;
  if (!text?.trim()) throw new EdgeTtsError('other', 'متن خالی است.');
  if (!voice?.trim()) throw new EdgeTtsError('other', 'صدا انتخاب نشده است.');
  const rate = rateToEdge(params.rate);
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
