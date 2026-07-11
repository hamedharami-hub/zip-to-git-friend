/**
 * Tiny TTS helper used by the Leitner review UI to pronounce a word
 * or example sentence. Prefers cached audio clips (extracted from the
 * source video/podcast) when available, otherwise falls back to the
 * browser's Web Speech API.
 */
import {
  BrowserTtsController,
  isBrowserTtsSupported,
  listVoices,
  type BrowserTtsVoice,
} from "@/lib/browserTts";

let cachedVoices: BrowserTtsVoice[] | null = null;

async function getVoices(): Promise<BrowserTtsVoice[]> {
  if (cachedVoices) return cachedVoices;
  cachedVoices = await listVoices();
  return cachedVoices;
}

/** Pick the best English voice available on this device. */
async function pickVoiceId(lang = "en"): Promise<string | null> {
  const voices = await getVoices();
  if (voices.length === 0) return null;
  const exact = voices.find(
    (v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()) && v.default,
  );
  if (exact) return exact.id;
  const anyLang = voices.find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
  if (anyLang) return anyLang.id;
  return voices[0]?.id ?? null;
}

let activeController: BrowserTtsController | null = null;
let activeAudio: HTMLAudioElement | null = null;

export function stopAllTts(): void {
  try {
    activeController?.stop();
  } catch {
    /* ignore */
  }
  activeController = null;
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
    activeAudio = null;
  }
}

/**
 * Play a short clip URL. Returns a promise that resolves when playback ends.
 * Used when the card has a stored MP3/WebM clip from the source media.
 */
export function playClip(url: string): Promise<void> {
  stopAllTts();
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    activeAudio = audio;
    audio.onended = () => {
      activeAudio = null;
      resolve();
    };
    audio.onerror = (e) => {
      activeAudio = null;
      reject(e);
    };
    audio.play().catch(reject);
  });
}

/** Speak arbitrary text using the browser TTS engine. */
export async function speak(
  text: string,
  opts: { rate?: number; lang?: string } = {},
): Promise<void> {
  const trimmed = (text ?? "").trim();
  if (!trimmed || !isBrowserTtsSupported()) return;
  stopAllTts();
  const voiceId = await pickVoiceId(opts.lang ?? "en");
  return new Promise((resolve) => {
    const controller = new BrowserTtsController(trimmed, {
      voiceId,
      rate: opts.rate ?? 0.95,
      onEnd: () => {
        activeController = null;
        resolve();
      },
      onError: () => {
        activeController = null;
        resolve();
      },
    });
    activeController = controller;
    controller.start();
  });
}
