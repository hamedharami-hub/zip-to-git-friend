/**
 * Play.ht v2 streaming TTS. Needs user id + secret. Persian support is via
 * the multilingual `PlayHT2.0` voice engine.
 */
export class PlayHtTtsError extends Error {
  constructor(public code: 'auth' | 'quota' | 'other', msg: string) { super(msg); }
}

export const PLAYHT_VOICES = [
  { id: 's3://voice-cloning-zero-shot/d9ff78ba-d016-47f6-b0ef-dd630f59414e/female-cs/manifest.json', label: 'Default Female (multi)', lang: 'fa' as const },
  { id: 's3://voice-cloning-zero-shot/baf1ef41-36b6-428c-9bdf-50ba54682bd8/original/manifest.json', label: 'Default Male (multi)', lang: 'en' as const },
];

export async function synthesizeWithPlayHt(params: {
  userId: string;
  apiKey: string;
  text: string;
  voice: string;
  lang: 'fa' | 'en';
}): Promise<Blob> {
  const { userId, apiKey, text, voice, lang } = params;
  if (!userId?.trim() || !apiKey?.trim()) throw new PlayHtTtsError('auth', 'Play.ht user/key کامل نیست.');
  if (!text?.trim()) throw new PlayHtTtsError('other', 'متن خالی است.');
  const res = await fetch('https://api.play.ht/api/v2/tts/stream', {
    method: 'POST',
    headers: {
      'X-USER-ID': userId,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      voice,
      voice_engine: 'PlayHT2.0',
      output_format: 'mp3',
      language: lang === 'fa' ? 'persian' : 'english',
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) throw new PlayHtTtsError('auth', `Play.ht 401: ${txt}`);
    if (res.status === 429) throw new PlayHtTtsError('quota', 'محدودیت Play.ht.');
    throw new PlayHtTtsError('other', `Play.ht ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.blob();
}
