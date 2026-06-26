/**
 * Dispatcher for the "other" TTS engines (Azure / HuggingFace /
 * Play.ht / OpenTTS). Returns a Blob ready to be turned into an object URL.
 */
import { AzureTtsError, synthesizeWithAzure } from '@/lib/azureTts';
import { HuggingFaceTtsError, synthesizeWithHuggingFace } from '@/lib/huggingFaceTts';
import { PlayHtTtsError, synthesizeWithPlayHt } from '@/lib/playHtTts';
import { OpenTtsError, synthesizeWithOpenTts } from '@/lib/openTts';

export type OtherEngine = 'azure' | 'huggingface' | 'playht' | 'opentts';

export interface SynthesizeOtherParams {
  engine: OtherEngine;
  text: string;
  rate: number;
  ttsLang: 'en' | 'fa';
  force?: boolean;
  azureKey: string;
  azureRegion: string;
  azureVoice: string;
  hfKey: string;
  hfVoice: string;
  playHtUser: string;
  playHtKey: string;
  playHtVoice: string;
  openTtsUrl: string;
  openTtsVoice: string;
}

export async function synthesizeOther(p: SynthesizeOtherParams): Promise<Blob> {
  if (p.engine === 'azure') {
    return synthesizeWithAzure({
      apiKey: p.azureKey, region: p.azureRegion, text: p.text,
      voice: p.azureVoice, rate: p.rate,
    });
  }
  if (p.engine === 'huggingface') {
    return synthesizeWithHuggingFace({ apiKey: p.hfKey, text: p.text, model: p.hfVoice });
  }
  if (p.engine === 'playht') {
    return synthesizeWithPlayHt({
      userId: p.playHtUser, apiKey: p.playHtKey, text: p.text,
      voice: p.playHtVoice, lang: p.ttsLang,
    });
  }
  return synthesizeWithOpenTts({ baseUrl: p.openTtsUrl, text: p.text, voice: p.openTtsVoice });
}

/** Convert any thrown error from the "other" engines into a user-facing string. */
export function otherEngineErrorMessage(e: unknown): string {
  if (
    e instanceof AzureTtsError ||
    e instanceof HuggingFaceTtsError ||
    e instanceof PlayHtTtsError ||
    e instanceof OpenTtsError
  ) {
    return e.message;
  }
  return e instanceof Error ? e.message : 'TTS ناموفق';
}
