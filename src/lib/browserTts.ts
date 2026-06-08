/**
 * Browser-native Text-to-Speech using the Web Speech API
 * (`window.speechSynthesis`). Free, offline, no API key required.
 *
 * Designed to mirror the parts of `geminiTts.ts` that the chapter player
 * needs, but with a streaming utterance-by-utterance approach instead of
 * pre-rendering a single audio blob (Web Speech doesn't expose audio
 * buffers — the engine speaks directly).
 *
 * Caveats:
 *  - Voices vary wildly by OS/browser. We expose `listVoices()` so the UI
 *    can let the user pick.
 *  - Background playback works on Android Chrome and desktop. iOS Safari
 *    pauses speech when the screen turns off (platform limitation — for
 *    true lock-screen audio the user should use the Gemini TTS option).
 *  - Speech can't be "scrubbed". We support pause/resume and skip-by-chunk.
 */

export interface BrowserTtsVoice {
  /** Stable identifier we use to recall the user's choice. */
  id: string;
  name: string;
  lang: string;
  /** True when the engine ships with the OS (vs. cloud / network voice). */
  localService: boolean;
  /** True when the browser flagged it as the default voice for its locale. */
  default: boolean;
}

export function isBrowserTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** List installed voices. Some engines populate them lazily; we wait once. */
export function listVoices(): Promise<BrowserTtsVoice[]> {
  return new Promise((resolve) => {
    if (!isBrowserTtsSupported()) {
      resolve([]);
      return;
    }
    const synth = window.speechSynthesis;
    const collect = () => {
      const v = synth.getVoices().map<BrowserTtsVoice>((it) => ({
        id: `${it.name}__${it.lang}`,
        name: it.name,
        lang: it.lang,
        localService: it.localService,
        default: it.default,
      }));
      resolve(v);
    };
    const initial = synth.getVoices();
    if (initial.length > 0) {
      collect();
      return;
    }
    // Voices may load async — wait one event, then resolve regardless.
    synth.addEventListener('voiceschanged', collect, { once: true });
    setTimeout(collect, 1500);
  });
}

/** Find the underlying SpeechSynthesisVoice from our serializable id. */
function lookupVoice(id: string | null): SpeechSynthesisVoice | null {
  if (!id || !isBrowserTtsSupported()) return null;
  const list = window.speechSynthesis.getVoices();
  return list.find((v) => `${v.name}__${v.lang}` === id) ?? null;
}

/** Split text into utterance-sized chunks (~250 chars).
 *  Respects double-newline block boundaries FIRST so headings (which often
 *  don't end in a period) get spoken as their own chunk instead of being
 *  merged with the next paragraph. Inside each block we then split at
 *  sentence boundaries. */
function chunkText(text: string, maxLen = 250): string[] {
  const cleaned = (text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!cleaned) return [];
  const blocks = cleaned.split(/\n{2,}/g).map((b) => b.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out: string[] = [];
  for (const block of blocks) {
    // Short blocks (typically headings) stay as a single chunk so they're
    // spoken in isolation and the UI can scroll/highlight them on their own.
    if (block.length <= maxLen) {
      out.push(block);
      continue;
    }
    const sentences = block.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [block];
    let buf = '';
    for (const s of sentences) {
      const trimmed = s.trim();
      if (!trimmed) continue;
      if ((buf + ' ' + trimmed).trim().length > maxLen && buf) {
        out.push(buf.trim());
        buf = trimmed;
      } else {
        buf = buf ? `${buf} ${trimmed}` : trimmed;
      }
    }
    if (buf) out.push(buf.trim());
  }
  return out;
}


export interface BrowserTtsOptions {
  voiceId?: string | null;
  lang?: string;
  rate?: number; // 0.1–10 (1 = normal)
  pitch?: number; // 0–2 (1 = normal)
  volume?: number; // 0–1 (1 = full)
  /** Called as each chunk starts speaking (1-indexed). */
  onChunkStart?: (idx: number, total: number) => void;
  /** Called when the entire queue finishes (or after stop()). */
  onEnd?: () => void;
  /** Called on speech engine errors. */
  onError?: (err: SpeechSynthesisErrorEvent) => void;
}

/**
 * Tiny stateful controller around `speechSynthesis`. One instance per
 * "session" (e.g. one chapter playback). The controller queues all chunks
 * up-front so pause/resume work natively.
 */
export class BrowserTtsController {
  private chunks: string[] = [];
  private utterances: SpeechSynthesisUtterance[] = [];
  private finished = false;
  private currentIndex = 0;

  constructor(private text: string, private opts: BrowserTtsOptions = {}) {
    this.chunks = chunkText(text);
  }

  get totalChunks(): number {
    return this.chunks.length;
  }

  /** 0-indexed position of the currently-speaking chunk (or last one spoken). */
  get index(): number {
    return this.currentIndex;
  }

  get isPaused(): boolean {
    return isBrowserTtsSupported() && window.speechSynthesis.paused;
  }

  get isSpeaking(): boolean {
    return isBrowserTtsSupported() && window.speechSynthesis.speaking;
  }

  /** Start (or restart) speaking from chunk `from` (defaults to 0). */
  start(from = 0): void {
    if (!isBrowserTtsSupported() || this.chunks.length === 0) {
      this.opts.onEnd?.();
      return;
    }
    this.stop();
    this.finished = false;
    const startIdx = Math.max(0, Math.min(this.chunks.length - 1, from));
    this.currentIndex = startIdx;

    const voice = lookupVoice(this.opts.voiceId ?? null);
    const total = this.chunks.length;

    // Build utterances only for chunks from startIdx onward — but report
    // index in the full-chapter coordinate system so the UI is consistent.
    this.utterances = this.chunks.slice(startIdx).map((c, j) => {
      const i = startIdx + j;
      const u = new SpeechSynthesisUtterance(c);
      u.lang = this.opts.lang ?? 'en-US';
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      }
      u.rate = clamp(this.opts.rate ?? 1, 0.5, 2);
      u.pitch = clamp(this.opts.pitch ?? 1, 0, 2);
      u.volume = clamp(this.opts.volume ?? 1, 0, 1);
      u.onstart = () => {
        this.currentIndex = i;
        this.opts.onChunkStart?.(i + 1, total);
      };
      u.onend = () => {
        if (i === total - 1 && !this.finished) {
          this.finished = true;
          this.opts.onEnd?.();
        }
      };
      u.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        this.opts.onError?.(e);
      };
      return u;
    });

    for (const u of this.utterances) {
      window.speechSynthesis.speak(u);
    }
  }

  pause(): void {
    if (isBrowserTtsSupported()) window.speechSynthesis.pause();
  }

  resume(): void {
    if (isBrowserTtsSupported()) window.speechSynthesis.resume();
  }

  stop(): void {
    if (isBrowserTtsSupported()) window.speechSynthesis.cancel();
    this.utterances = [];
  }

  /** Update playback rate live (creates a new queue from the current chunk). */
  setRate(rate: number): void {
    this.opts.rate = rate;
    if (this.utterances.length === 0) return;
    // Capture remaining chunks then re-speak them at the new rate.
    const remaining = this.chunks.slice(this.currentIndex);
    this.stop();
    this.chunks = remaining;
    this.start();
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
