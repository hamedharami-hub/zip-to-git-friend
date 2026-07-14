/**
 * Thin wrapper around the Web Speech API (SpeechRecognition).
 *
 * Used by Podcast Mode > Shadowing to capture the user's spoken
 * repetition of the target sentence. Free, offline-capable on Chrome
 * Android (server-assisted on desktop Chrome), no API key needed.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
type SR = typeof window extends { SpeechRecognition: infer T } ? T : any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
function getSpeechRecognition(): any {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return !!getSpeechRecognition();
}

export interface RecognitionHandle {
  stop: () => void;
  abort: () => void;
}

export interface RecognitionOptions {
  lang?: string;
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (err: string) => void;
  onEnd?: () => void;
}

export function startRecognition(opts: RecognitionOptions): RecognitionHandle | null {
  const SR = getSpeechRecognition();
  if (!SR) {
    opts.onError?.("Speech recognition not supported in this browser");
    return null;
  }
  const rec = new SR();
  rec.lang = opts.lang ?? "en-US";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalText = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
  rec.onresult = (event: any) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) {
        finalText += r[0].transcript;
      } else {
        interim += r[0].transcript;
      }
    }
    if (interim) opts.onPartial?.(interim);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
  rec.onerror = (e: any) => {
    opts.onError?.(e?.error ?? "unknown");
  };

  rec.onend = () => {
    opts.onFinal(finalText.trim());
    opts.onEnd?.();
  };

  try {
    rec.start();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
  } catch (e: any) {
    opts.onError?.(e?.message ?? "Failed to start");
    return null;
  }

  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* no-op */
      }
    },
    abort: () => {
      try {
        rec.abort();
      } catch {
        /* no-op */
      }
    },
  };
}
