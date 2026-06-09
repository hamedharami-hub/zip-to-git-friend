/**
 * Microsoft Azure Speech (Cognitive Services) Text-to-Speech.
 * Direct REST call from the browser using the user's subscription key +
 * region (e.g. "westeurope"). Returns an MP3 Blob.
 *
 * Why Azure? It has native, high-quality Persian voices (fa-IR-DilaraNeural,
 * fa-IR-FaridNeural) — the best fa-IR pronunciation currently available
 * without ElevenLabs' English-accent issue.
 */

export interface AzureVoiceOpt {
  id: string;
  label: string;
  lang: 'fa' | 'en';
}

export const AZURE_VOICES: AzureVoiceOpt[] = [
  { id: 'fa-IR-DilaraNeural', label: 'Dilara — فارسی زن', lang: 'fa' },
  { id: 'fa-IR-FaridNeural', label: 'Farid — فارسی مرد', lang: 'fa' },
  { id: 'en-US-JennyNeural', label: 'Jenny — English female', lang: 'en' },
  { id: 'en-US-GuyNeural', label: 'Guy — English male', lang: 'en' },
  { id: 'en-US-AriaNeural', label: 'Aria — English female', lang: 'en' },
];

export class AzureTtsError extends Error {
  constructor(public code: 'auth' | 'quota' | 'network' | 'other', msg: string) {
    super(msg);
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export async function synthesizeWithAzure(params: {
  apiKey: string;
  region: string;
  text: string;
  voice: string;
  rate?: number; // 0.5–2 multiplier
}): Promise<Blob> {
  const { apiKey, region, text, voice, rate = 1 } = params;
  if (!apiKey?.trim()) throw new AzureTtsError('auth', 'کلید Azure ندارد.');
  if (!region?.trim()) throw new AzureTtsError('auth', 'Region Azure مشخص نیست.');
  if (!text?.trim()) throw new AzureTtsError('other', 'متن خالی است.');

  const lang = voice.slice(0, 5); // e.g. "fa-IR"
  const ratePct = `${Math.round((rate - 1) * 100)}%`;
  const ssml =
    `<speak version="1.0" xml:lang="${lang}">` +
    `<voice name="${voice}"><prosody rate="${ratePct}">${escapeXml(text)}</prosody></voice></speak>`;

  let res: Response;
  try {
    res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
        'User-Agent': 'LLPlayer',
      },
      body: ssml,
    });
  } catch (e) {
    throw new AzureTtsError('network', e instanceof Error ? e.message : 'network');
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) throw new AzureTtsError('auth', `Azure 401: ${txt}`);
    if (res.status === 429) throw new AzureTtsError('quota', 'محدودیت Azure (۴۲۹).');
    throw new AzureTtsError('other', `Azure ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.blob();
}
