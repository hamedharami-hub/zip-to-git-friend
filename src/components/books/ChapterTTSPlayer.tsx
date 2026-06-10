/**
 * Floating audio player that narrates the current chapter.
 *
 * Two engines:
 *  - "browser"  → Web Speech API (free, offline, no key) — uses
 *                 BrowserTtsController; cannot be scrubbed but supports
 *                 pause/resume and rate changes.
 *  - "gemini"   → Gemini TTS (paid, needs the user's API key) — synthesizes
 *                 the entire chapter into a cached <audio> blob with full
 *                 transport controls and lock-screen / Bluetooth support
 *                 via the Media Session API.
 *
 * The user picks the engine in the player UI. Both engines integrate with
 * Media Session so OS-level play/pause and lock-screen controls work
 * (Gemini path is the most reliable on iOS for true background audio).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Headphones,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Loader2,
  X,
  Download,
  Trash2,
  RefreshCw,
  Sparkles,
  Mic,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { useSettingsStore } from '@/store/settingsStore';
import {
  GEMINI_TTS_VOICES,
  type GeminiTtsVoice,
  GeminiTtsError,
  synthesizeChapter,
} from '@/lib/geminiTts';
import { emitParagraphSpeech } from '@/lib/paragraphSpeechBus';
import {
  BrowserTtsController,
  isBrowserTtsSupported,
  listVoices,
  type BrowserTtsVoice,
} from '@/lib/browserTts';
import { deleteTTSAudio, getTTSAudio, getTTSChunks, deleteTTSChunks } from '@/lib/bookDb';
import { useMediaSession } from '@/hooks/useMediaSession';
import { useWakeLock } from '@/hooks/useWakeLock';
import { Link } from 'react-router-dom';
import {
  ELEVENLABS_MODELS,
  ELEVENLABS_VOICES,
  ElevenLabsTtsError,
  synthesizeWithElevenLabs,
} from '@/lib/elevenLabsTts';
import { AZURE_VOICES, AzureTtsError, synthesizeWithAzure } from '@/lib/azureTts';
import { HUGGINGFACE_VOICES, HuggingFaceTtsError, synthesizeWithHuggingFace } from '@/lib/huggingFaceTts';
import { PLAYHT_VOICES, PlayHtTtsError, synthesizeWithPlayHt } from '@/lib/playHtTts';
import { OpenTtsError, synthesizeWithOpenTts } from '@/lib/openTts';
import { subscribeParagraphSpeechRequest } from '@/lib/paragraphSpeechRequestBus';

interface Props {
  bookId: string;
  chapterIndex: number;
  chapterTitle: string;
  /** Plain-text version of the chapter (used as the TTS prompt). */
  text: string;
  /** Optional Persian translation. When supplied, an EN/FA toggle appears. */
  textFa?: string;
  /** Cover for OS lock-screen artwork (data URL is fine). */
  coverUrl?: string;
}

const ENGINE_KEY = 'llvp-tts-engine';
const VOICE_KEY = 'llvp-tts-voice';
const BROWSER_VOICE_KEY = 'llvp-tts-browser-voice';
const BROWSER_LANG_KEY = 'llvp-tts-browser-lang';
const ELEVEN_VOICE_KEY = 'llvp-tts-eleven-voice';
const ELEVEN_MODEL_KEY = 'llvp-tts-eleven-model';
const TTS_LANG_KEY = 'llvp-tts-lang';

type Engine = 'browser' | 'gemini' | 'elevenlabs' | 'azure' | 'huggingface' | 'playht' | 'opentts';

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface ChunkListProps {
  chunks: Array<{ index: number; total: number; text: string; url: string; cached: boolean }>;
  playingIndex: number | null;
  onPlay: (index: number, url: string) => void;
}

function ParagraphChunkList({ chunks, playingIndex, onPlay }: ChunkListProps) {
  if (chunks.length === 0) return null;
  const total = chunks[0]?.total ?? chunks.length;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2 space-y-1 max-h-[180px] overflow-y-auto">
      <div className="text-[11px] text-muted-foreground px-1">
        {chunks.length} از {total} پاراگراف آماده — برای پخش روی هرکدام بزن
      </div>
      <div className="space-y-1">
        {chunks.map((c) => {
          const isPlaying = playingIndex === c.index;
          const preview = c.text.trim().slice(0, 70) + (c.text.length > 70 ? '…' : '');
          return (
            <button
              key={c.index}
              type="button"
              onClick={() => onPlay(c.index, c.url)}
              className={
                'w-full flex items-center gap-2 text-left rounded-md px-2 py-1.5 text-xs transition-colors ' +
                (isPlaying
                  ? 'bg-primary/15 text-foreground'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground')
              }
              title={c.text}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background border border-border">
                {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              </span>
              <span className="tabular-nums text-[10px] opacity-70 shrink-0">{c.index}.</span>
              <span className="truncate flex-1">{preview}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}



export function ChapterTTSPlayer({
  bookId,
  chapterIndex: chapterIndexProp,
  chapterTitle,
  text: textProp,
  textFa,
  coverUrl,
}: Props) {
  const { settings } = useSettingsStore();
  const apiKey = settings.geminiTtsApiKey || settings.geminiApiKey;

  // EN / FA podcast language. The Persian variant is gated on textFa being
  // available (set by callers like NewsArticle once translations are ready).
  const [ttsLang, setTtsLang] = useState<'en' | 'fa'>(() => {
    try {
      const v = localStorage.getItem(TTS_LANG_KEY);
      return v === 'fa' ? 'fa' : 'en';
    } catch { return 'en'; }
  });
  useEffect(() => {
    try { localStorage.setItem(TTS_LANG_KEY, ttsLang); } catch { /* noop */ }
  }, [ttsLang]);
  const text = ttsLang === 'fa' && textFa ? textFa : textProp;
  // Use a different chapterIndex namespace for FA so cached audio stays separate.
  const effectiveChapterIndex = ttsLang === 'fa' ? chapterIndexProp + 100000 : chapterIndexProp;

  const [open, setOpen] = useState(false);
  const [engine, setEngine] = useState<Engine>(() => {
    try {
      const saved = localStorage.getItem(ENGINE_KEY) as Engine | null;
      if (saved && ['browser','gemini','elevenlabs','azure','huggingface','playht','opentts'].includes(saved)) return saved as Engine;
    } catch {
      /* noop */
    }
    return isBrowserTtsSupported() ? 'browser' : 'gemini';
  });
  useEffect(() => {
    try {
      localStorage.setItem(ENGINE_KEY, engine);
    } catch {
      /* noop */
    }
  }, [engine]);
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === ENGINE_KEY && e.newValue && ['browser','gemini','elevenlabs','azure','huggingface','playht','opentts'].includes(e.newValue)) {
        setEngine(e.newValue as Engine);
      }
      if (e.key === TTS_LANG_KEY && (e.newValue === 'en' || e.newValue === 'fa')) {
        setTtsLang(e.newValue);
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  // ───────── Gemini TTS state ─────────
  const [voice, setVoice] = useState<GeminiTtsVoice>(() => {
    try {
      const saved = localStorage.getItem(VOICE_KEY) as GeminiTtsVoice | null;
      return saved ?? 'Kore';
    } catch {
      return 'Kore';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(VOICE_KEY, voice);
    } catch {
      /* noop */
    }
  }, [voice]);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [chunkInfo, setChunkInfo] = useState<{ done: number; total: number } | null>(null);
  const [cachedHit, setCachedHit] = useState(false);

  /** Live list of paragraphs whose audio is ready (cached or freshly generated). */
  interface ReadyChunk { index: number; total: number; text: string; url: string; cached: boolean }
  const [readyChunks, setReadyChunks] = useState<ReadyChunk[]>([]);
  const chunkUrlsRef = useRef<string[]>([]);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingChunk, setPlayingChunk] = useState<number | null>(null);

  function revokeChunkUrls() {
    for (const u of chunkUrlsRef.current) {
      try { URL.revokeObjectURL(u); } catch { /* */ }
    }
    chunkUrlsRef.current = [];
  }

  function playChunk(idx: number, url: string) {
    if (!previewAudioRef.current) previewAudioRef.current = new Audio();
    const a = previewAudioRef.current;
    if (playingChunk === idx && !a.paused) {
      a.pause();
      setPlayingChunk(null);
      return;
    }
    a.src = url;
    a.playbackRate = rate;
    a.onended = () => setPlayingChunk(null);
    a.onpause = () => { if (a.ended) setPlayingChunk(null); };
    a.play().then(() => setPlayingChunk(idx)).catch(() => setPlayingChunk(null));
  }


  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  const audioRef = useRef<HTMLAudioElement>(null);
  const lastUrlRef = useRef<string | null>(null);

  // ───────── Browser TTS state ─────────
  const [browserVoices, setBrowserVoices] = useState<BrowserTtsVoice[]>([]);
  const [browserVoiceId, setBrowserVoiceId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(BROWSER_VOICE_KEY);
    } catch {
      return null;
    }
  });
  const [browserLang, setBrowserLang] = useState<string>(() => {
    try { return localStorage.getItem(BROWSER_LANG_KEY) || 'all'; } catch { return 'all'; }
  });
  useEffect(() => {
    try { localStorage.setItem(BROWSER_LANG_KEY, browserLang); } catch { /* noop */ }
  }, [browserLang]);
  const [browserChunk, setBrowserChunk] = useState<{ done: number; total: number } | null>(null);
  const [browserPlaying, setBrowserPlaying] = useState(false);
  const browserCtrlRef = useRef<BrowserTtsController | null>(null);
  /** Chunk index we should resume from on next "Listen" (after Stop). */
  const resumeIndexRef = useRef(0);

  // Keep the screen on while audio is playing (Wake Lock API; ignored on iOS Safari).
  useWakeLock(open && (playing || browserPlaying));

  // ───────── ElevenLabs state ─────────
  const elevenKey = settings.elevenLabsApiKey?.trim() ?? '';
  const [elevenVoice, setElevenVoice] = useState<string>(() => {
    try { return localStorage.getItem(ELEVEN_VOICE_KEY) || ELEVENLABS_VOICES[0].id; }
    catch { return ELEVENLABS_VOICES[0].id; }
  });
  const [elevenModel, setElevenModel] = useState<string>(() => {
    try { return localStorage.getItem(ELEVEN_MODEL_KEY) || ELEVENLABS_MODELS[0].id; }
    catch { return ELEVENLABS_MODELS[0].id; }
  });
  useEffect(() => { try { localStorage.setItem(ELEVEN_VOICE_KEY, elevenVoice); } catch { /* */ } }, [elevenVoice]);
  useEffect(() => { try { localStorage.setItem(ELEVEN_MODEL_KEY, elevenModel); } catch { /* */ } }, [elevenModel]);
  const [elevenLoading, setElevenLoading] = useState(false);

  // ───────── Azure / HF / Play.ht / OpenTTS state ─────────
  const azureKey = settings.azureTtsApiKey?.trim() ?? '';
  const azureRegion = settings.azureTtsRegion?.trim() || 'westeurope';
  const hfKey = settings.huggingFaceApiKey?.trim() ?? '';
  const playHtUser = settings.playHtUserId?.trim() ?? '';
  const playHtKey = settings.playHtApiKey?.trim() ?? '';
  const openTtsUrl = settings.openTtsUrl?.trim() ?? '';
  const azureVoiceOpts = AZURE_VOICES.filter((v) => v.lang === ttsLang);
  const hfVoiceOpts = HUGGINGFACE_VOICES.filter((v) => v.lang === ttsLang);
  const playHtVoiceOpts = PLAYHT_VOICES;
  const [azureVoice, setAzureVoice] = useState<string>(() => {
    try { return localStorage.getItem('llvp-tts-azure-voice') || ''; } catch { return ''; }
  });
  const [hfVoice, setHfVoice] = useState<string>(() => {
    try { return localStorage.getItem('llvp-tts-hf-voice') || ''; } catch { return ''; }
  });
  const [playHtVoice, setPlayHtVoice] = useState<string>(() => {
    try { return localStorage.getItem('llvp-tts-playht-voice') || PLAYHT_VOICES[0].id; } catch { return PLAYHT_VOICES[0].id; }
  });
  const [openTtsVoice, setOpenTtsVoice] = useState<string>(() => {
    try { return localStorage.getItem('llvp-tts-opentts-voice') || (ttsLang === 'fa' ? 'coqui-tts:fa_custom' : 'larynx:en-us/ek-glow_tts'); }
    catch { return 'larynx:en-us/ek-glow_tts'; }
  });
  useEffect(() => { const v = azureVoiceOpts[0]?.id; if (!azureVoice && v) setAzureVoice(v); }, [azureVoiceOpts, azureVoice]);
  useEffect(() => { const v = hfVoiceOpts[0]?.id; if (!hfVoice && v) setHfVoice(v); }, [hfVoiceOpts, hfVoice]);
  useEffect(() => { try { if (azureVoice) localStorage.setItem('llvp-tts-azure-voice', azureVoice); } catch {/* */} }, [azureVoice]);
  useEffect(() => { try { if (hfVoice) localStorage.setItem('llvp-tts-hf-voice', hfVoice); } catch {/* */} }, [hfVoice]);
  useEffect(() => { try { localStorage.setItem('llvp-tts-playht-voice', playHtVoice); } catch {/* */} }, [playHtVoice]);
  useEffect(() => { try { localStorage.setItem('llvp-tts-opentts-voice', openTtsVoice); } catch {/* */} }, [openTtsVoice]);
  const [otherLoading, setOtherLoading] = useState(false);

  /** Synthesize via the currently-selected non-Gemini/non-ElevenLabs provider. */
  const loadOther = async () => {
    if (!text.trim()) { toast.error('متنی برای روایت پیدا نشد.'); return; }
    setOtherLoading(true);
    try {
      let blob: Blob;
      if (engine === 'azure') {
        blob = await synthesizeWithAzure({ apiKey: azureKey, region: azureRegion, text, voice: azureVoice, rate });
      } else if (engine === 'huggingface') {
        blob = await synthesizeWithHuggingFace({ apiKey: hfKey, text, model: hfVoice });
      } else if (engine === 'playht') {
        blob = await synthesizeWithPlayHt({ userId: playHtUser, apiKey: playHtKey, text, voice: playHtVoice, lang: ttsLang });
      } else {
        blob = await synthesizeWithOpenTts({ baseUrl: openTtsUrl, text, voice: openTtsVoice });
      }
      revokeUrl();
      const url = URL.createObjectURL(blob);
      lastUrlRef.current = url;
      setAudioUrl(url);
      toast.success('روایت آماده شد.');
    } catch (e) {
      const msg = e instanceof AzureTtsError || e instanceof HuggingFaceTtsError ||
                  e instanceof PlayHtTtsError || e instanceof OpenTtsError
                  ? e.message : (e instanceof Error ? e.message : 'TTS ناموفق');
      toast.error(msg);
    } finally { setOtherLoading(false); }
  };

  // ───────── Paragraph-speech-request bus (long-press menu) ─────────
  useEffect(() => {
    return subscribeParagraphSpeechRequest(bookId, chapterIndexProp, (req) => {
      if (req.action === 'stop') {
        try { window.speechSynthesis.cancel(); } catch { /* */ }
        browserCtrlRef.current?.stop();
        browserCtrlRef.current = null;
        setBrowserPlaying(false);
        setBrowserChunk(null);
        return;
      }
      if (req.action === 'play-from') {
        if (req.lang === 'fa') setTtsLang('fa');
        else if (req.lang === 'en') setTtsLang('en');
        setEngine('browser');
        setOpen(true);
        // Find matching chunk index by scanning chunks for the paragraph head.
        setTimeout(() => {
          if (!isBrowserTtsSupported()) return;
          const fullText = req.lang === 'fa' && textFa ? textFa : textProp;
          const head = req.text.replace(/\s+/g, ' ').trim().slice(0, 40).toLowerCase();
          const idx = Math.max(0, fullText.toLowerCase().indexOf(head));
          // Estimate chunk index by char offset / ~250 chars per chunk.
          const chunkIdx = Math.floor(idx / 250);
          resumeIndexRef.current = chunkIdx;
          const ctl = new BrowserTtsController(fullText, {
            voiceId: browserVoiceId,
            lang: req.lang === 'fa' ? 'fa-IR' : 'en-US',
            rate,
            onChunkStart: (i, total) => {
              setBrowserChunk({ done: i, total });
              resumeIndexRef.current = i - 1;
              try {
                const chunk = (ctl as unknown as { chunks?: string[] }).chunks?.[i - 1];
                if (chunk) emitParagraphSpeech(bookId, chapterIndexProp, chunk);
              } catch {/* */}
            },
            onEnd: () => { setBrowserPlaying(false); setBrowserChunk(null); resumeIndexRef.current = 0; emitParagraphSpeech(bookId, chapterIndexProp, null); },
            onError: () => { setBrowserPlaying(false); emitParagraphSpeech(bookId, chapterIndexProp, null); },
          });
          browserCtrlRef.current?.stop();
          browserCtrlRef.current = ctl;
          ctl.start(chunkIdx);
          setBrowserPlaying(true);
        }, 60);
      }
      // 'play-one' is handled by the menu's instant speechSynthesis call.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapterIndexProp, textProp, textFa, browserVoiceId, rate]);


  // Lazy-load voices the first time the panel opens.
  useEffect(() => {
    if (!open || browserVoices.length > 0) return;
    if (!isBrowserTtsSupported()) return;
    let cancelled = false;
    void listVoices().then((v) => {
      if (cancelled) return;
      setBrowserVoices(v);
      if (!browserVoiceId && v.length > 0) {
        // Prefer the engine's default English voice if any, otherwise the first.
        const def = v.find((vv) => vv.default && vv.lang.startsWith('en')) ?? v[0];
        setBrowserVoiceId(def.id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, browserVoices.length, browserVoiceId]);

  useEffect(() => {
    if (browserVoiceId) {
      try {
        localStorage.setItem(BROWSER_VOICE_KEY, browserVoiceId);
      } catch {
        /* noop */
      }
    }
  }, [browserVoiceId]);

  // When ttsLang changes, ensure the browser voice & language filter match.
  // Fixes the bug where switching to فارسی still narrated with an English voice.
  useEffect(() => {
    if (browserVoices.length === 0) return;
    const prefix = ttsLang === 'fa' ? 'fa' : 'en';
    const current = browserVoices.find((v) => v.id === browserVoiceId);
    const matches = current && current.lang.toLowerCase().startsWith(prefix);
    if (!matches) {
      const next = browserVoices.find((v) => v.lang.toLowerCase().startsWith(prefix));
      if (next) {
        setBrowserVoiceId(next.id);
        setBrowserLang(prefix);
      } else if (ttsLang === 'fa') {
        // No Persian voice installed — surface a hint once.
        setBrowserLang('fa');
      }
    }
  }, [ttsLang, browserVoices, browserVoiceId]);

  // When chapter / engine / voice changes, dispose old playback.
  useEffect(() => {
    revokeUrl();
    revokeChunkUrls();
    setReadyChunks([]);
    setPlayingChunk(null);
    try { previewAudioRef.current?.pause(); } catch { /* */ }
    setAudioUrl(null);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setProgress(0);
    setChunkInfo(null);
    setCachedHit(false);
    setBrowserChunk(null);
    browserCtrlRef.current?.stop();
    browserCtrlRef.current = null;
    setBrowserPlaying(false);
    resumeIndexRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, effectiveChapterIndex, voice, engine]);

  function revokeUrl() {
    if (lastUrlRef.current) {
      URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = null;
    }
  }

  // Hydrate cached per-chunk audio whenever the Gemini panel is open for a
  // (book, chapter, voice) combo — even before the user taps "Listen", so
  // previously-generated paragraphs are immediately playable offline.
  useEffect(() => {
    if (engine !== 'gemini' || !open) return;
    let cancelled = false;
    (async () => {
      try {
        const cached = await getTTSChunks(bookId, effectiveChapterIndex, voice);
        if (cancelled || cached.length === 0) return;
        revokeChunkUrls();
        const next: ReadyChunk[] = cached.map((c) => {
          const url = URL.createObjectURL(c.blob);
          chunkUrlsRef.current.push(url);
          return { index: c.chunkIndex + 1, total: c.total, text: c.text, url, cached: true };
        });
        setReadyChunks(next);
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [engine, open, bookId, effectiveChapterIndex, voice]);

  useEffect(() => () => {
    revokeUrl();
    revokeChunkUrls();
    try { previewAudioRef.current?.pause(); } catch { /* */ }
    browserCtrlRef.current?.stop();
  }, []);

  // ───────── Gemini path ─────────
  const loadOrSynthesize = async (force = false) => {
    if (!apiKey) {
      toast.error('Add your Gemini API key in Settings → AI first.');
      return;
    }
    if (!text.trim()) {
      toast.error('This chapter has no text to narrate.');
      return;
    }
    setLoading(true);
    setProgress(0);
    setChunkInfo(null);
    if (force) {
      revokeChunkUrls();
      setReadyChunks([]);
    }
    try {
      const { blob, cached } = await synthesizeChapter(
        apiKey,
        bookId,
        effectiveChapterIndex,
        text,
        voice,
        {
          force,
          onChunkProgress: (done, total) => {
            setChunkInfo({ done, total });
            setProgress(done / total);
          },
          onChunkReady: ({ index, total, text: chunkText, blob: chunkBlob, cached: chunkCached }) => {
            const url = URL.createObjectURL(chunkBlob);
            chunkUrlsRef.current.push(url);
            setReadyChunks((prev) => {
              if (prev.some((p) => p.index === index)) return prev;
              const next = [...prev, { index, total, text: chunkText, url, cached: chunkCached }];
              next.sort((a, b) => a.index - b.index);
              return next;
            });
          },
        },
      );
      revokeUrl();
      const url = URL.createObjectURL(blob);
      lastUrlRef.current = url;
      setAudioUrl(url);
      setCachedHit(cached);
      if (!cached) toast.success('Narration ready.');
    } catch (e) {
      const msg =
        e instanceof GeminiTtsError
          ? e.code === 'auth'
            ? 'Gemini rejected the TTS key — check Settings → AI.'
            : e.code === 'quota'
              ? 'Gemini TTS rate-limit reached. موقتاً به Browser TTS سوییچ شد.'
              : e.code === 'no-audio'
                ? 'Gemini returned no audio. Try a different voice.'
                : `TTS failed: ${e.message}`
          : 'TTS failed.';
      if (e instanceof GeminiTtsError && e.code === 'quota' && isBrowserTtsSupported()) {
        setEngine('browser');
      }
      toast.error(msg);
    } finally {
      setLoading(false);
      setChunkInfo(null);
    }
  };

  const togglePlay = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      try {
        await a.play();
      } catch {
        /* user gesture issue, ignore */
      }
    } else {
      a.pause();
    }
  };

  const seekRel = (delta: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + delta));
  };

  const onSeek = (v: number[]) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    a.currentTime = (v[0] ?? 0) * duration;
  };

  const onRate = (r: number) => {
    setRate(r);
    if (engine === 'gemini' && audioRef.current) audioRef.current.playbackRate = r;
    if (engine === 'browser' && browserCtrlRef.current) browserCtrlRef.current.setRate(r);
  };

  const handleClear = async () => {
    await deleteTTSAudio(bookId, effectiveChapterIndex, voice);
    await deleteTTSChunks(bookId, effectiveChapterIndex, voice);
    revokeUrl();
    revokeChunkUrls();
    setReadyChunks([]);
    setPlayingChunk(null);
    try { previewAudioRef.current?.pause(); } catch { /* */ }
    setAudioUrl(null);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    toast.success('Cached narration deleted.');
  };

  const handleDownload = async () => {
    const row = await getTTSAudio(bookId, effectiveChapterIndex, voice);
    const blob = row?.blob;
    if (!blob) {
      toast.error('No cached audio yet.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = chapterTitle.replace(/[^\w\s.-]+/g, '').slice(0, 60).trim() || 'chapter';
    a.download = `${safeTitle} (${voice}).wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const voiceOptions = useMemo(() => GEMINI_TTS_VOICES, []);

  // ───────── ElevenLabs path ─────────
  const loadElevenLabs = async () => {
    if (!elevenKey) {
      toast.error('کلید ElevenLabs را در تنظیمات وارد کنید.');
      return;
    }
    if (!text.trim()) {
      toast.error('متنی برای روایت پیدا نشد.');
      return;
    }
    setElevenLoading(true);
    try {
      const blob = await synthesizeWithElevenLabs({
        apiKey: elevenKey,
        text,
        voiceId: elevenVoice,
        modelId: elevenModel,
        language: ttsLang,
      });
      revokeUrl();
      const url = URL.createObjectURL(blob);
      lastUrlRef.current = url;
      setAudioUrl(url);
      toast.success('روایت ElevenLabs آماده شد.');
    } catch (e) {
      const msg = e instanceof ElevenLabsTtsError
        ? e.code === 'auth' ? 'ElevenLabs کلید را رد کرد.'
          : e.code === 'quota' ? 'محدودیت اعتبار ElevenLabs.'
          : `خطا: ${e.message}`
        : 'ElevenLabs ناموفق.';
      toast.error(msg);
    } finally {
      setElevenLoading(false);
    }
  };

  const downloadElevenLabs = async () => {
    if (!audioUrl) { toast.error('ابتدا روی Listen بزن.'); return; }
    const a = document.createElement('a');
    a.href = audioUrl;
    const safeTitle = chapterTitle.replace(/[^\w\s.-]+/g, '').slice(0, 60).trim() || 'narration';
    a.download = `${safeTitle} (ElevenLabs ${ttsLang}).mp3`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };


  // ───────── Browser TTS path ─────────
  const startBrowser = () => {
    if (!isBrowserTtsSupported()) {
      toast.error('Your browser does not support speech synthesis.');
      return;
    }
    if (!text.trim()) {
      toast.error('This chapter has no text to narrate.');
      return;
    }
    browserCtrlRef.current?.stop();
    const ctl = new BrowserTtsController(text, {
      voiceId: browserVoiceId,
      lang: ttsLang === 'fa' ? 'fa-IR' : 'en-US',
      rate,
      onChunkStart: (idx, total) => {
        setBrowserChunk({ done: idx, total });
        // Remember where we are so a Stop → Listen can resume from this chunk
        // instead of restarting from the very beginning.
        resumeIndexRef.current = idx - 1;
        // Emit the active chunk's text so InteractiveBookText can highlight + scroll.
        try {
          const chunk = (ctl as unknown as { chunks?: string[] }).chunks?.[idx - 1];
          if (chunk) emitParagraphSpeech(bookId, chapterIndexProp, chunk);
        } catch { /* ignore */ }
      },
      onEnd: () => {
        setBrowserPlaying(false);
        setBrowserChunk(null);
        resumeIndexRef.current = 0;
        emitParagraphSpeech(bookId, chapterIndexProp, null);
      },
      onError: () => {
        setBrowserPlaying(false);
        toast.error('Browser TTS error.');
        emitParagraphSpeech(bookId, chapterIndexProp, null);
      },
    });
    browserCtrlRef.current = ctl;
    ctl.start(resumeIndexRef.current);
    setBrowserPlaying(true);
  };

  const toggleBrowserPlay = () => {
    const c = browserCtrlRef.current;
    if (!c) {
      startBrowser();
      return;
    }
    if (c.isPaused) {
      c.resume();
      setBrowserPlaying(true);
    } else if (c.isSpeaking) {
      c.pause();
      setBrowserPlaying(false);
    } else {
      startBrowser();
    }
  };

  /** Stop playback but REMEMBER the current chunk — next "Listen" resumes from it. */
  const stopBrowser = () => {
    const c = browserCtrlRef.current;
    if (c) resumeIndexRef.current = c.index;
    browserCtrlRef.current?.stop();
    browserCtrlRef.current = null;
    setBrowserPlaying(false);
    setBrowserChunk(null);
    emitParagraphSpeech(bookId, chapterIndexProp, null);
  };

  /** Hard reset — start narration from the first sentence. */
  const restartBrowser = () => {
    browserCtrlRef.current?.stop();
    browserCtrlRef.current = null;
    resumeIndexRef.current = 0;
    setBrowserPlaying(false);
    setBrowserChunk(null);
    startBrowser();
  };

  // ───────── Media Session — wires OS lock-screen to whichever engine is active ─────────
  const sessionMeta = useMemo(
    () =>
      open
        ? {
            title: chapterTitle,
            artist: 'Chapter narration',
            album: 'Language Learning Player',
            artwork: coverUrl,
          }
        : null,
    [open, chapterTitle, coverUrl],
  );

  useMediaSession(
    engine === 'gemini' ? audioRef.current : null,
    sessionMeta,
    {
      onPlay:
        engine === 'gemini'
          ? () => audioRef.current?.play().catch(() => {})
          : () => {
              if (browserCtrlRef.current?.isPaused) {
                browserCtrlRef.current.resume();
                setBrowserPlaying(true);
              } else {
                startBrowser();
              }
            },
      onPause:
        engine === 'gemini'
          ? () => audioRef.current?.pause()
          : () => {
              browserCtrlRef.current?.pause();
              setBrowserPlaying(false);
            },
      onSeekBackward:
        engine === 'gemini' ? (s) => seekRel(-Math.max(5, s)) : undefined,
      onSeekForward:
        engine === 'gemini' ? (s) => seekRel(Math.max(5, s)) : undefined,
      onStop:
        engine === 'gemini'
          ? () => audioRef.current?.pause()
          : () => stopBrowser(),
    },
    open,
  );

  if (!open) {
    return (
      <Button
        variant="default"
        size="icon"
        aria-label="Listen to this chapter"
        title="Listen to this chapter"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 h-12 w-12 rounded-full shadow-lg"
      >
        <Headphones className="h-5 w-5" />
      </Button>
    );
  }

  const browserSupported = isBrowserTtsSupported();

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md shadow-2xl max-h-[55dvh] overflow-y-auto overscroll-contain"
        role="region"
        aria-label="Chapter narration player"
      >
        <div className="max-w-4xl mx-auto px-3 py-2 space-y-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">

          {/* Tiny close button — title removed for compactness. */}
          <div className="flex justify-end -mb-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label="Close player"
              onClick={() => {
                stopBrowser();
                setOpen(false);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>


          {/* Engine picker */}
          <div
            role="tablist"
            aria-label="TTS engine"
            className="flex flex-wrap rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5"
          >
            {([
              { id: 'browser', label: 'Browser', icon: Mic, title: 'Built-in browser voice — free, offline', disabled: !browserSupported },
              { id: 'gemini', label: 'Gemini', icon: Sparkles, title: 'Gemini TTS — needs Gemini key' },
              { id: 'elevenlabs', label: 'ElevenLabs', icon: Sparkles, title: 'ElevenLabs — premium' },
              { id: 'azure', label: 'Azure', icon: Sparkles, title: 'Azure Speech — بهترین صدای فارسی' },
              { id: 'huggingface', label: 'HF', icon: Sparkles, title: 'Hugging Face Inference' },
              { id: 'playht', label: 'Play.ht', icon: Sparkles, title: 'Play.ht v2 streaming' },
              { id: 'opentts', label: 'OpenTTS', icon: Sparkles, title: 'Self-hosted OpenTTS server' },
            ] as const).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={engine === t.id}
                  disabled={(t as { disabled?: boolean }).disabled}
                  onClick={() => setEngine(t.id as Engine)}
                  className={
                    'px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 ' +
                    (engine === t.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground disabled:opacity-50')
                  }
                  title={t.title}
                >
                  <Icon className="h-3 w-3" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Language picker — visible whenever a Persian script is available. */}
          {textFa && (
            <div
              role="tablist"
              aria-label="زبان پخش"
              className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={ttsLang === 'en'}
                onClick={() => setTtsLang('en')}
                className={
                  'px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ' +
                  (ttsLang === 'en'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground')
                }
              >
                English
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={ttsLang === 'fa'}
                onClick={() => setTtsLang('fa')}
                className={
                  'px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ' +
                  (ttsLang === 'fa'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground')
                }
                title="نسخه فارسی متن"
              >
                فارسی
              </button>
            </div>
          )}

          {/* Body — Browser TTS */}
          {engine === 'browser' && (
            <div className="space-y-3">
              {!browserSupported ? (
                <div className="text-sm text-muted-foreground">
                  Your browser does not support built-in speech synthesis. Switch to Gemini.
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={browserLang} onValueChange={setBrowserLang}>
                      <SelectTrigger className="h-9 w-[120px]" title="فیلتر زبان">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">همه زبان‌ها</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="fa">فارسی</SelectItem>
                        <SelectItem value="ar">العربية</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="de">Deutsch</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={browserVoiceId ?? undefined}
                      onValueChange={(v) => setBrowserVoiceId(v)}
                    >
                      <SelectTrigger className="h-9 max-w-[260px]">
                        <SelectValue placeholder="Pick a voice" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[40vh]">
                        {browserVoices.length === 0 && (
                          <SelectItem value="__none__" disabled>
                            Loading voices…
                          </SelectItem>
                        )}
                        {browserVoices
                          .filter((v) => browserLang === 'all' || v.lang.toLowerCase().startsWith(browserLang))
                          .map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.name} <span className="opacity-60">({v.lang})</span>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Select value={String(rate)} onValueChange={(v) => onRate(Number(v))}>
                      <SelectTrigger className="h-9 w-[80px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                          <SelectItem key={r} value={String(r)}>
                            {r}×
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={toggleBrowserPlay}
                      className="gap-2"
                      title={browserPlaying ? 'Pause' : 'Listen'}
                    >
                      {browserPlaying ? (
                        <>
                          <Pause className="h-4 w-4" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" /> Listen
                        </>
                      )}
                    </Button>
                    {(browserCtrlRef.current || resumeIndexRef.current > 0) && (
                      <Button variant="ghost" size="sm" onClick={stopBrowser} title="توقف — با Listen از همین پاراگراف ادامه می‌دهد">
                        Stop
                      </Button>
                    )}
                    {resumeIndexRef.current > 0 && (
                      <Button variant="ghost" size="sm" onClick={restartBrowser} title="شروع از ابتدای متن">
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restart
                      </Button>
                    )}
                  </div>
                  {browserChunk && (
                    <div className="space-y-1">
                      <Progress value={(browserChunk.done / browserChunk.total) * 100} />
                      <p className="text-xs text-muted-foreground">
                        Sentence {browserChunk.done} / {browserChunk.total}
                      </p>
                    </div>
                  )}

                </>
              )}
            </div>
          )}

          {/* Body — Gemini TTS */}
          {engine === 'gemini' && (
            <>
              {!apiKey ? (
                <div className="text-sm text-muted-foreground">
                  Gemini TTS needs an API key.{' '}
                  <Link to="/settings" className="text-primary underline underline-offset-2">
                    Add it in Settings → AI
                  </Link>
                  .
                </div>
              ) : !audioUrl ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={voice} onValueChange={(v) => setVoice(v as GeminiTtsVoice)}>
                      <SelectTrigger className="h-9 w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {voiceOptions.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={() => loadOrSynthesize(false)} disabled={loading}>
                      {loading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      {loading ? 'Generating…' : 'Listen'}
                    </Button>
                  </div>
                  {loading && chunkInfo && (
                    <div className="space-y-1">
                      <Progress value={progress * 100} />
                      <p className="text-xs text-muted-foreground">
                        پاراگراف {chunkInfo.done} از {chunkInfo.total} — {Math.round(progress * 100)}٪
                      </p>
                    </div>
                  )}
                  {readyChunks.length > 0 && (
                    <ParagraphChunkList
                      chunks={readyChunks}
                      playingIndex={playingChunk}
                      onPlay={playChunk}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    ~{Math.ceil(text.length / 1000)}k نویسه · هر پاراگراف بلافاصله بعد از ساخت قابل پخش است و در حافظهٔ آفلاین می‌ماند.
                  </p>
                </div>
              ) : (
                <>
                  {readyChunks.length > 0 && (
                    <ParagraphChunkList
                      chunks={readyChunks}
                      playingIndex={playingChunk}
                      onPlay={playChunk}
                    />
                  )}
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      const a = e.currentTarget;
                      setDuration(a.duration || 0);
                      a.playbackRate = rate;
                    }}
                    onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => setPlaying(false)}
                  />

                  <Slider
                    value={[duration ? current / duration : 0]}
                    min={0}
                    max={1}
                    step={0.001}
                    onValueChange={onSeek}
                    aria-label="Seek"
                  />
                  <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
                    <span>{fmt(current)}</span>
                    <span>{fmt(duration)}</span>
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => seekRel(-15)}
                        aria-label="Back 15s"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        onClick={togglePlay}
                        aria-label={playing ? 'Pause' : 'Play'}
                      >
                        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => seekRel(15)}
                        aria-label="Forward 15s"
                      >
                        <RotateCw className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Select value={String(rate)} onValueChange={(v) => onRate(Number(v))}>
                        <SelectTrigger className="h-8 w-[78px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                            <SelectItem key={r} value={String(r)}>
                              {r}×
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={voice} onValueChange={(v) => setVoice(v as GeminiTtsVoice)}>
                        <SelectTrigger className="h-8 w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {voiceOptions.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleDownload}
                        aria-label="Download audio"
                        title="Download .wav"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => loadOrSynthesize(true)}
                        disabled={loading}
                        aria-label="Re-generate"
                        title="Re-generate"
                      >
                        {loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleClear}
                        aria-label="Delete cached audio"
                        title="Delete cached audio"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Body — ElevenLabs */}
          {engine === 'elevenlabs' && (
            <>
              {!elevenKey ? (
                <div className="text-sm text-muted-foreground">
                  ElevenLabs نیاز به API key دارد.{' '}
                  <Link to="/settings" className="text-primary underline underline-offset-2">
                    در تنظیمات → AI اضافه کن
                  </Link>
                  .
                </div>
              ) : !audioUrl ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={elevenVoice} onValueChange={setElevenVoice}>
                      <SelectTrigger className="h-9 w-[240px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ELEVENLABS_VOICES.map((v) => (
                          <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={elevenModel} onValueChange={setElevenModel}>
                      <SelectTrigger className="h-9 w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ELEVENLABS_MODELS.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={loadElevenLabs} disabled={elevenLoading}>
                      {elevenLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      {elevenLoading ? 'در حال ساخت…' : 'Listen'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ~{Math.ceil(text.length / 1000)}k نویسه · multilingual_v2 از انگلیسی و فارسی پشتیبانی می‌کند.
                  </p>
                </div>
              ) : (
                <>
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      const a = e.currentTarget;
                      setDuration(a.duration || 0);
                      a.playbackRate = rate;
                    }}
                    onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => setPlaying(false)}
                  />
                  <Slider
                    value={[duration ? current / duration : 0]}
                    min={0} max={1} step={0.001}
                    onValueChange={onSeek}
                    aria-label="Seek"
                  />
                  <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
                    <span>{fmt(current)}</span>
                    <span>{fmt(duration)}</span>
                  </div>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => seekRel(-15)} aria-label="Back 15s">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button size="icon" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
                        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => seekRel(15)} aria-label="Forward 15s">
                        <RotateCw className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={String(rate)} onValueChange={(v) => onRate(Number(v))}>
                        <SelectTrigger className="h-8 w-[78px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                            <SelectItem key={r} value={String(r)}>{r}×</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={downloadElevenLabs} aria-label="Download" title="Download .mp3">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={loadElevenLabs} disabled={elevenLoading} aria-label="Re-generate" title="Re-generate">
                        {elevenLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Body — Azure / HF / Play.ht / OpenTTS (shared minimal UI) */}
          {(engine === 'azure' || engine === 'huggingface' || engine === 'playht' || engine === 'opentts') && (
            <div className="space-y-3">
              {engine === 'azure' && !azureKey && (
                <div className="text-sm text-muted-foreground">
                  Azure نیاز به key + region دارد. <Link to="/settings" className="text-primary underline">تنظیمات → AI</Link>
                </div>
              )}
              {engine === 'huggingface' && !hfKey && (
                <div className="text-sm text-muted-foreground">
                  Hugging Face نیاز به token دارد. <Link to="/settings" className="text-primary underline">تنظیمات → AI</Link>
                </div>
              )}
              {engine === 'playht' && (!playHtUser || !playHtKey) && (
                <div className="text-sm text-muted-foreground">
                  Play.ht نیاز به user id + key دارد. <Link to="/settings" className="text-primary underline">تنظیمات → AI</Link>
                </div>
              )}
              {engine === 'opentts' && !openTtsUrl && (
                <div className="text-sm text-muted-foreground">
                  آدرس سرور OpenTTS را در تنظیمات بگذار. <Link to="/settings" className="text-primary underline">تنظیمات → AI</Link>
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {engine === 'azure' && (
                  <Select value={azureVoice} onValueChange={setAzureVoice}>
                    <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="انتخاب صدا" /></SelectTrigger>
                    <SelectContent>{azureVoiceOpts.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {engine === 'huggingface' && (
                  <Select value={hfVoice} onValueChange={setHfVoice}>
                    <SelectTrigger className="h-9 w-[260px]"><SelectValue placeholder="انتخاب مدل" /></SelectTrigger>
                    <SelectContent>{hfVoiceOpts.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {engine === 'playht' && (
                  <Select value={playHtVoice} onValueChange={setPlayHtVoice}>
                    <SelectTrigger className="h-9 w-[240px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{playHtVoiceOpts.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {engine === 'opentts' && (
                  <input
                    type="text"
                    value={openTtsVoice}
                    onChange={(e) => setOpenTtsVoice(e.target.value)}
                    placeholder="e.g. coqui-tts:fa_custom"
                    className="h-9 px-2 rounded-md border border-border bg-background text-sm w-[260px]"
                  />
                )}
                <Button onClick={loadOther} disabled={otherLoading}>
                  {otherLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  {otherLoading ? 'در حال ساخت…' : 'Listen'}
                </Button>
              </div>
              {audioUrl && (
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  controls
                  className="w-full"
                  onLoadedMetadata={(e) => { const a = e.currentTarget; setDuration(a.duration || 0); a.playbackRate = rate; }}
                  onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
