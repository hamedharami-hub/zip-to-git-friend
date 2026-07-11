/**
 * OpenTTS — self-hosted free TTS server (https://github.com/synesthesiam/opentts).
 * Plain GET endpoint that returns WAV audio.
 *
 * Default voice strings include language prefix, e.g.
 *   coqui-tts:fa_custom (Persian) or larynx:en-us/ek-glow_tts
 */
export class OpenTtsError extends Error {
  constructor(
    public code: "network" | "other",
    msg: string,
  ) {
    super(msg);
  }
}

export async function synthesizeWithOpenTts(params: {
  baseUrl: string;
  text: string;
  voice: string;
}): Promise<Blob> {
  const { baseUrl, text, voice } = params;
  if (!baseUrl?.trim()) throw new OpenTtsError("other", "OpenTTS URL مشخص نیست.");
  if (!text?.trim()) throw new OpenTtsError("other", "متن خالی است.");
  const url = `${baseUrl.replace(/\/$/, "")}/api/tts?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET" });
  } catch (e) {
    throw new OpenTtsError("network", e instanceof Error ? e.message : "network");
  }
  if (!res.ok) throw new OpenTtsError("other", `OpenTTS ${res.status}`);
  return res.blob();
}
