/**
 * Shared constants and types for the ChapterTTSPlayer module.
 * Extracted to keep the main component file small.
 */

export const ENGINE_KEY = "llvp-tts-engine";
export const VOICE_KEY = "llvp-tts-voice";
export const BROWSER_VOICE_KEY = "llvp-tts-browser-voice";
export const BROWSER_LANG_KEY = "llvp-tts-browser-lang";
export const ELEVEN_VOICE_KEY = "llvp-tts-eleven-voice";
export const ELEVEN_MODEL_KEY = "llvp-tts-eleven-model";
export const TTS_LANG_KEY = "llvp-tts-lang";
export const RATE_KEY = "llvp-tts-rate";

export type Engine =
  | "browser"
  | "gemini"
  | "elevenlabs"
  | "azure"
  | "huggingface"
  | "playht"
  | "opentts";

export const ENGINES: readonly Engine[] = [
  "browser",
  "gemini",
  "elevenlabs",
  "azure",
  "huggingface",
  "playht",
  "opentts",
];

export function isEngine(v: unknown): v is Engine {
  return typeof v === "string" && (ENGINES as readonly string[]).includes(v);
}

/** Format seconds as M:SS. */
export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
