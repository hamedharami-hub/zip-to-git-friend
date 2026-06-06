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
import { deleteTTSAudio, getTTSAudio } from '@/lib/bookDb';
import { useMediaSession } from '@/hooks/useMediaSession';
import { useWakeLock } from '@/hooks/useWakeLock';
import { Link } from 'react-router-dom';
import {
  ELEVENLABS_MODELS,
  ELEVENLABS_VOICES,
  ElevenLabsTtsError,
  synthesizeWithElevenLabs,
} from '@/lib/elevenLabsTts';

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

type Engine = 'browser' | 'gemini' | 'elevenlabs';

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
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
      if (saved === 'gemini' || saved === 'browser' || saved === 'elevenlabs') return saved;
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
      if (e.key === ENGINE_KEY && (e.newValue === 'browser' || e.newValue === 'gemini' || e.newValue === 'elevenlabs')) {
        setEngine(e.newValue);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, effectiveChapterIndex, voice, engine]);

  function revokeUrl() {
    if (lastUrlRef.current) {
      URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = null;
    }
  }

  useEffect(() => () => {
    revokeUrl();
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
              ? 'Gemini TTS rate-limit reached. Wait a minute and retry.'
              : e.code === 'no-audio'
                ? 'Gemini returned no audio. Try a different voice.'
                : `TTS failed: ${e.message}`
          : 'TTS failed.';
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
    revokeUrl();
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
        // Emit the active chunk's text so InteractiveBookText can highlight + scroll.
        try {
          const chunk = (ctl as unknown as { chunks?: string[] }).chunks?.[idx - 1];
          if (chunk) emitParagraphSpeech(bookId, effectiveChapterIndex, chunk);
        } catch { /* ignore */ }
      },
      onEnd: () => {
        setBrowserPlaying(false);
        setBrowserChunk(null);
        emitParagraphSpeech(bookId, effectiveChapterIndex, null);
      },
      onError: () => {
        setBrowserPlaying(false);
        toast.error('Browser TTS error.');
        emitParagraphSpeech(bookId, effectiveChapterIndex, null);
      },
    });
    browserCtrlRef.current = ctl;
    ctl.start();
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

  const stopBrowser = () => {
    browserCtrlRef.current?.stop();
    browserCtrlRef.current = null;
    setBrowserPlaying(false);
    setBrowserChunk(null);
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
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md shadow-2xl max-h-[85dvh] overflow-y-auto overscroll-contain"
        role="region"
        aria-label="Chapter narration player"
      >
        <div className="max-w-4xl mx-auto px-4 py-3 space-y-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Headphones className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium truncate">{chapterTitle}</span>
              {cachedHit && audioUrl && engine === 'gemini' && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
                  Cached
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close player"
              onClick={() => {
                stopBrowser();
                setOpen(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Engine picker */}
          <div
            role="tablist"
            aria-label="TTS engine"
            className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={engine === 'browser'}
              disabled={!browserSupported}
              onClick={() => setEngine('browser')}
              className={
                'px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 ' +
                (engine === 'browser'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground')
              }
              title="Built-in browser voice — free, offline"
            >
              <Mic className="h-3 w-3" />
              Browser
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={engine === 'gemini'}
              onClick={() => setEngine('gemini')}
              className={
                'px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 ' +
                (engine === 'gemini'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground')
              }
              title="Gemini TTS — natural voices, needs API key"
            >
              <Sparkles className="h-3 w-3" />
              Gemini
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={engine === 'elevenlabs'}
              onClick={() => setEngine('elevenlabs')}
              className={
                'px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 ' +
                (engine === 'elevenlabs'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground')
              }
              title="ElevenLabs — صدای حرفه‌ای، نیاز به API key"
            >
              <Sparkles className="h-3 w-3" />
              ElevenLabs
            </button>
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
                    {browserCtrlRef.current && (
                      <Button variant="ghost" size="sm" onClick={stopBrowser}>
                        Stop
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
                  <p className="text-[11px] text-muted-foreground">
                    Free, offline, uses your device's built-in voices. iOS pauses speech when
                    the screen turns off — switch to Gemini for true background audio.
                  </p>
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
                        Chunk {chunkInfo.done} / {chunkInfo.total} —{' '}
                        {Math.round(progress * 100)}%
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    ~{Math.ceil(text.length / 1000)}k characters · cached after first generation,
                    plays in background with lock-screen controls.
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
        </div>
      </div>
    </>
  );
}
