/**
 * Hugging Face Inference API — Text-to-Speech.
 * Defaults to facebook/mms-tts-fas (Persian) / facebook/mms-tts-eng (English).
 * Returns a Blob (audio/flac or audio/wav depending on model).
 */
export class HuggingFaceTtsError extends Error {
  constructor(
    public code: "auth" | "cold" | "quota" | "other",
    msg: string,
  ) {
    super(msg);
  }
}

export const HUGGINGFACE_VOICES = [
  { id: "facebook/mms-tts-fas", label: "MMS-TTS — فارسی", lang: "fa" as const },
  { id: "facebook/mms-tts-eng", label: "MMS-TTS — English", lang: "en" as const },
  { id: "suno/bark-small", label: "Bark Small — EN multi", lang: "en" as const },
];

export async function synthesizeWithHuggingFace(params: {
  apiKey: string;
  text: string;
  model: string;
}): Promise<Blob> {
  const { apiKey, text, model } = params;
  if (!apiKey?.trim()) throw new HuggingFaceTtsError("auth", "HF API key نیست.");
  if (!text?.trim()) throw new HuggingFaceTtsError("other", "متن خالی است.");
  const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "audio/flac, audio/wav, audio/mpeg",
    },
    body: JSON.stringify({ inputs: text }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403)
      throw new HuggingFaceTtsError("auth", `HF 401: ${txt}`);
    if (res.status === 503)
      throw new HuggingFaceTtsError(
        "cold",
        "مدل HF در حال warm-up است؛ چند ثانیه بعد دوباره امتحان کن.",
      );
    if (res.status === 429) throw new HuggingFaceTtsError("quota", "محدودیت HF.");
    throw new HuggingFaceTtsError("other", `HF ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.blob();
}
