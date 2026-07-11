/**
 * Thin wrapper around the browser's Web Speech Recognition API.
 *
 * Used by Sentence Lab Roleplay for free, in-browser speech-to-text — no
 * server API key required. Works best in Chromium-based browsers; Firefox
 * and iOS Safari have partial / no support and the caller should surface
 * a clear error.
 */

export interface WebSpeechResult {
  /** Final concatenated transcript. */
  transcript: string;
  /** Whether at least one final result was received. */
  isFinal: boolean;
}

export interface WebSpeechController {
  stop: () => Promise<WebSpeechResult>;
  abort: () => void;
}

type AnyRecognition = any;

function getRecognitionCtor(): AnyRecognition | null {
  if (typeof window === "undefined") return null;
  // Chrome/Edge/Safari ship `webkitSpeechRecognition`; spec name is `SpeechRecognition`.
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function isWebSpeechSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export interface WebSpeechOptions {
  lang?: string; // BCP-47, e.g. 'en-US', 'en-AU'
  interimResults?: boolean;
  onInterim?: (text: string) => void;
}

function mergeTranscriptParts(finalText: string, interimText: string): string {
  const finalTrimmed = finalText.trim();
  const interimTrimmed = interimText.trim();
  if (!finalTrimmed) return interimTrimmed;
  if (!interimTrimmed) return finalTrimmed;
  if (interimTrimmed.startsWith(finalTrimmed)) return interimTrimmed;
  if (finalTrimmed.endsWith(interimTrimmed)) return finalTrimmed;
  return `${finalTrimmed} ${interimTrimmed}`.trim();
}

export function __test_mergeTranscriptParts(finalText: string, interimText: string): string {
  return mergeTranscriptParts(finalText, interimText);
}

/**
 * Start a recognition session. Returns a controller you can `stop()` to
 * resolve the final transcript, or `abort()` to discard.
 *
 * Throws synchronously if the browser doesn't support it.
 */
export function startWebSpeech(opts: WebSpeechOptions = {}): WebSpeechController {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    throw new Error("Speech recognition is not supported in this browser. Try Chrome or Edge.");
  }
  const rec: AnyRecognition = new Ctor();
  rec.lang = opts.lang ?? "en-US";
  rec.interimResults = opts.interimResults ?? true;
  rec.continuous = true;
  rec.maxAlternatives = 1;

  let finalText = "";
  let latestInterim = "";
  let stopped = false;
  let resolveStop: ((r: WebSpeechResult) => void) | null = null;
  let rejectStop: ((e: Error) => void) | null = null;

  rec.onresult = (e: any) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const txt = res[0]?.transcript ?? "";
      if (res.isFinal) {
        finalText += (finalText ? " " : "") + txt.trim();
      } else {
        interim += txt;
      }
    }
    latestInterim = interim.trim();
    if (interim && opts.onInterim) opts.onInterim(interim.trim());
  };

  rec.onerror = (e: any) => {
    if (stopped) return;
    const code = e?.error ?? "unknown";
    // 'no-speech' / 'aborted' are routine and shouldn't blow up the UI
    if (code === "no-speech" || code === "aborted") return;
    console.warn("[webSpeech] error", code, e);
    if (code === "not-allowed" || code === "service-not-allowed") {
      if (rejectStop)
        rejectStop(
          new Error(
            'Microphone permission denied. If you are inside the Lovable editor preview, open the published URL or click the "Open in new tab" button — the editor iframe blocks microphone access.',
          ),
        );
      return;
    }
    if (rejectStop) rejectStop(new Error(`Speech recognition error: ${code}`));
  };

  rec.onend = () => {
    const mergedTranscript = mergeTranscriptParts(finalText, latestInterim);
    if (resolveStop) {
      resolveStop({ transcript: mergedTranscript, isFinal: !!finalText.trim() });
      resolveStop = null;
      rejectStop = null;
    }
  };

  try {
    rec.start();
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Could not start speech recognition");
  }

  return {
    stop() {
      return new Promise<WebSpeechResult>((resolve, reject) => {
        if (stopped) {
          const mergedTranscript = mergeTranscriptParts(finalText, latestInterim);
          resolve({ transcript: mergedTranscript, isFinal: !!finalText.trim() });
          return;
        }
        stopped = true;
        resolveStop = resolve;
        rejectStop = reject;
        try {
          rec.stop();
        } catch {
          // Some engines throw if stop is called too soon; trigger onend manually.
          const mergedTranscript = mergeTranscriptParts(finalText, latestInterim);
          resolve({ transcript: mergedTranscript, isFinal: !!finalText.trim() });
        }
      });
    },
    abort() {
      stopped = true;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    },
  };
}
