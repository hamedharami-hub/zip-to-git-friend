/**
 * ElevenLabs synthesis helper + error mapping. Extracted from
 * ChapterTTSPlayer to keep that component small.
 */
import { ElevenLabsTtsError, synthesizeWithElevenLabs } from "@/lib/elevenLabsTts";

export interface LoadElevenLabsParams {
  apiKey: string;
  text: string;
  voiceId: string;
  modelId: string;
  language: "en" | "fa";
}

export async function loadElevenLabsBlob(p: LoadElevenLabsParams): Promise<Blob> {
  return synthesizeWithElevenLabs({
    apiKey: p.apiKey,
    text: p.text,
    voiceId: p.voiceId,
    modelId: p.modelId,
    language: p.language,
  });
}

export function elevenLabsErrorMessage(e: unknown): string {
  if (e instanceof ElevenLabsTtsError) {
    if (e.code === "auth") return "ElevenLabs کلید را رد کرد.";
    if (e.code === "quota") return "محدودیت اعتبار ElevenLabs.";
    return `خطا: ${e.message}`;
  }
  return "ElevenLabs ناموفق.";
}
