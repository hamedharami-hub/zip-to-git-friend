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

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useSettingsStore } from "@/store/settingsStore";
import { type GeminiTtsVoice, GeminiTtsError, synthesizeChapter } from "@/lib/geminiTts";
import { GeminiVoicePicker } from "./chapter-tts/GeminiVoicePicker";
import { emitParagraphSpeech } from "@/lib/paragraphSpeechBus";
import {
  BrowserTtsController,
  isBrowserTtsSupported,
  listVoices,
  type BrowserTtsVoice,
} from "@/lib/browserTts";
import { deleteTTSAudio, getTTSAudio, getTTSChunks, deleteTTSChunks } from "@/lib/bookDb";
import { useMediaSession } from "@/hooks/useMediaSession";
import { useWakeLock } from "@/hooks/useWakeLock";
import { Link } from "react-router-dom";
import { ELEVENLABS_MODELS, ELEVENLABS_VOICES } from "@/lib/elevenLabsTts";
import { loadElevenLabsBlob, elevenLabsErrorMessage } from "./chapter-tts/loadElevenLabs";
import { ElevenLabsPanel } from "./chapter-tts/ElevenLabsPanel";
import { OtherTtsPanel } from "./chapter-tts/OtherTtsPanel";
import { BrowserTtsPanel } from "./chapter-tts/BrowserTtsPanel";
import { LangToggle } from "./chapter-tts/LangToggle";
import { subscribeParagraphSpeechRequest } from "@/lib/paragraphSpeechRequestBus";
import { synthesizeOther, otherEngineErrorMessage } from "./chapter-tts/synthesizeOther";
import {
  ENGINE_KEY,
  VOICE_KEY,
  BROWSER_VOICE_KEY,
  BROWSER_LANG_KEY,
  ELEVEN_VOICE_KEY,
  ELEVEN_MODEL_KEY,
  TTS_LANG_KEY,
  type Engine,
  isEngine,
  fmtTime as fmt,
} from "./chapter-tts/constants";
import { ParagraphChunkList, type ReadyChunk } from "./chapter-tts/ParagraphChunkList";
import { useTtsKeepAlive } from "./chapter-tts/useTtsKeepAlive";
import { useOtherEngineVoices } from "./chapter-tts/useOtherEngineVoices";
import { EngineSelector } from "./chapter-tts/EngineSelector";

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

export const ChapterTTSPlayer = memo(function ChapterTTSPlayer({
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
  const [ttsLang, setTtsLang] = useState<"en" | "fa">(() => {
    try {
      const v = localStorage.getItem(TTS_LANG_KEY);
      return v === "fa" ? "fa" : "en";
    } catch {
      return "en";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(TTS_LANG_KEY, ttsLang);
    } catch {
      /* noop */
    }
  }, [ttsLang]);
  const text = ttsLang === "fa" && textFa ? textFa : textProp;
  // Use a different chapterIndex namespace for FA so cached audio stays separate.
  const effectiveChapterIndex = ttsLang === "fa" ? chapterIndexProp + 100000 : chapterIndexProp;

  const [open, setOpen] = useState(false);
  const [engine, setEngine] = useState<Engine>(() => {
    try {
      const saved = localStorage.getItem(ENGINE_KEY);
      if (isEngine(saved)) return saved;
    } catch {
      /* noop */
    }
    return isBrowserTtsSupported() ? "browser" : "gemini";
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
      if (e.key === ENGINE_KEY && isEngine(e.newValue)) {
        setEngine(e.newValue);
      }
      if (e.key === TTS_LANG_KEY && (e.newValue === "en" || e.newValue === "fa")) {
        setTtsLang(e.newValue);
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  // ───────── Gemini TTS state ─────────
  const [voice, setVoice] = useState<GeminiTtsVoice>(() => {
    try {
      const saved = localStorage.getItem(VOICE_KEY) as GeminiTtsVoice | null;
      return saved ?? "Kore";
    } catch {
      return "Kore";
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

  const [readyChunks, setReadyChunks] = useState<ReadyChunk[]>([]);
  const chunkUrlsRef = useRef<string[]>([]);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingChunk, setPlayingChunk] = useState<number | null>(null);

  function revokeChunkUrls() {
    for (const u of chunkUrlsRef.current) {
      try {
        URL.revokeObjectURL(u);
      } catch {
        /* */
      }
    }
    chunkUrlsRef.current = [];
  }

  const playChunk = useCallback(
    (idx: number, url: string) => {
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
      a.onpause = () => {
        if (a.ended) setPlayingChunk(null);
      };
      a.play()
        .then(() => setPlayingChunk(idx))
        .catch(() => setPlayingChunk(null));
    },
    [playingChunk, rate],
  );

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
    try {
      return localStorage.getItem(BROWSER_LANG_KEY) || "all";
    } catch {
      return "all";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(BROWSER_LANG_KEY, browserLang);
    } catch {
      /* noop */
    }
  }, [browserLang]);
  const [browserChunk, setBrowserChunk] = useState<{ done: number; total: number } | null>(null);
  const [browserPlaying, setBrowserPlaying] = useState(false);
  const browserCtrlRef = useRef<BrowserTtsController | null>(null);
  /** Chunk index we should resume from on next "Listen" (after Stop). */
  const resumeIndexRef = useRef(0);

  // Keep the screen on while audio is playing (Wake Lock API; ignored on iOS Safari).
  useWakeLock(open && (playing || browserPlaying));

  // Background keep-alive for browser TTS — see useTtsKeepAlive.
  useTtsKeepAlive(browserPlaying);

  // ───────── ElevenLabs state ─────────
  const elevenKey = settings.elevenLabsApiKey?.trim() ?? "";
  const [elevenVoice, setElevenVoice] = useState<string>(() => {
    try {
      return localStorage.getItem(ELEVEN_VOICE_KEY) || ELEVENLABS_VOICES[0].id;
    } catch {
      return ELEVENLABS_VOICES[0].id;
    }
  });
  const [elevenModel, setElevenModel] = useState<string>(() => {
    try {
      return localStorage.getItem(ELEVEN_MODEL_KEY) || ELEVENLABS_MODELS[0].id;
    } catch {
      return ELEVENLABS_MODELS[0].id;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(ELEVEN_VOICE_KEY, elevenVoice);
    } catch {
      /* */
    }
  }, [elevenVoice]);
  useEffect(() => {
    try {
      localStorage.setItem(ELEVEN_MODEL_KEY, elevenModel);
    } catch {
      /* */
    }
  }, [elevenModel]);
  const [elevenLoading, setElevenLoading] = useState(false);

  // ───────── Azure / HF / Play.ht / OpenTTS state ─────────
  const azureKey = settings.azureTtsApiKey?.trim() ?? "";
  const azureRegion = settings.azureTtsRegion?.trim() || "westeurope";
  const hfKey = settings.huggingFaceApiKey?.trim() ?? "";
  const playHtUser = settings.playHtUserId?.trim() ?? "";
  const playHtKey = settings.playHtApiKey?.trim() ?? "";
  const openTtsUrl = settings.openTtsUrl?.trim() ?? "";
  const {
    azureVoiceOpts,
    hfVoiceOpts,
    playHtVoiceOpts,
    azureVoice,
    setAzureVoice,
    hfVoice,
    setHfVoice,
    playHtVoice,
    setPlayHtVoice,
    openTtsVoice,
    setOpenTtsVoice,
  } = useOtherEngineVoices(ttsLang);
  const [otherLoading, setOtherLoading] = useState(false);

  /** Synthesize via the currently-selected non-Gemini/non-ElevenLabs provider. */
  const loadOther = async (force = false) => {
    if (ttsLang === "fa" && !textFa?.trim()) {
      toast.error("برای خواندن فارسی، اول ترجمهٔ فارسی پاراگراف‌ها را بساز.");
      return;
    }
    if (!text.trim()) {
      toast.error("متنی برای روایت پیدا نشد.");
      return;
    }
    setOtherLoading(true);
    try {
      const blob = await synthesizeOther({
        engine: engine as "azure" | "huggingface" | "playht" | "opentts",
        text,
        rate,
        ttsLang,
        force,
        azureKey,
        azureRegion,
        azureVoice,
        hfKey,
        hfVoice,
        playHtUser,
        playHtKey,
        playHtVoice,
        openTtsUrl,
        openTtsVoice,
      });
      revokeUrl();
      const url = URL.createObjectURL(blob);
      lastUrlRef.current = url;
      setAudioUrl(url);
      toast.success("روایت آماده شد.");
    } catch (e) {
      toast.error(otherEngineErrorMessage(e));
    } finally {
      setOtherLoading(false);
    }
  };

  // ───────── Paragraph-speech-request bus (long-press menu) ─────────
  useEffect(() => {
    return subscribeParagraphSpeechRequest(bookId, chapterIndexProp, (req) => {
      if (req.action === "stop") {
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* */
        }
        browserCtrlRef.current?.stop();
        browserCtrlRef.current = null;
        setBrowserPlaying(false);
        setBrowserChunk(null);
        return;
      }
      if (req.action === "play-from") {
        if (req.lang === "fa") setTtsLang("fa");
        else if (req.lang === "en") setTtsLang("en");
        setEngine("browser");
        setOpen(true);
        // Find matching chunk index by scanning chunks for the paragraph head.
        setTimeout(() => {
          if (!isBrowserTtsSupported()) return;
          const fullText = req.lang === "fa" && textFa ? textFa : textProp;
          const head = req.text.replace(/\s+/g, " ").trim().slice(0, 40).toLowerCase();
          const idx = Math.max(0, fullText.toLowerCase().indexOf(head));
          // Estimate chunk index by char offset / ~250 chars per chunk.
          const chunkIdx = Math.floor(idx / 250);
          resumeIndexRef.current = chunkIdx;
          const ctl = new BrowserTtsController(fullText, {
            voiceId: browserVoiceId,
            lang: req.lang === "fa" ? "fa-IR" : "en-US",
            rate,
            onChunkStart: (i, total) => {
              setBrowserChunk({ done: i, total });
              resumeIndexRef.current = i - 1;
              try {
                const chunk = (ctl as unknown as { chunks?: string[] }).chunks?.[i - 1];
                if (chunk) emitParagraphSpeech(bookId, chapterIndexProp, chunk);
              } catch {
                /* */
              }
            },
            onEnd: () => {
              setBrowserPlaying(false);
              setBrowserChunk(null);
              resumeIndexRef.current = 0;
              emitParagraphSpeech(bookId, chapterIndexProp, null);
            },
            onError: () => {
              setBrowserPlaying(false);
              emitParagraphSpeech(bookId, chapterIndexProp, null);
            },
          });
          browserCtrlRef.current?.stop();
          browserCtrlRef.current = ctl;
          ctl.start(chunkIdx);
          setBrowserPlaying(true);
        }, 60);
      }
      // 'play-one' is handled by the menu's instant speechSynthesis call.
    });
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
        const prefix = ttsLang === "fa" ? "fa" : "en";
        const def =
          v.find((vv) => vv.lang.toLowerCase().startsWith(prefix) && vv.default) ??
          v.find((vv) => vv.lang.toLowerCase().startsWith(prefix)) ??
          v[0];
        setBrowserVoiceId(def.id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, browserVoices.length, browserVoiceId, ttsLang]);

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
    const prefix = ttsLang === "fa" ? "fa" : "en";
    const current = browserVoices.find((v) => v.id === browserVoiceId);
    const matches = current && current.lang.toLowerCase().startsWith(prefix);
    if (!matches) {
      const next = browserVoices.find((v) => v.lang.toLowerCase().startsWith(prefix));
      if (next) {
        setBrowserVoiceId(next.id);
        setBrowserLang(prefix);
      } else if (ttsLang === "fa") {
        // No Persian voice installed — surface a hint once.
        setBrowserLang("fa");
      }
    }
  }, [ttsLang, browserVoices, browserVoiceId]);

  // When chapter / engine / voice changes, dispose old playback.
  useEffect(() => {
    revokeUrl();
    revokeChunkUrls();
    setReadyChunks([]);
    setPlayingChunk(null);
    try {
      previewAudioRef.current?.pause();
    } catch {
      /* */
    }
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
    if (engine !== "gemini" || !open) return;
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
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engine, open, bookId, effectiveChapterIndex, voice]);

  useEffect(
    () => () => {
      revokeUrl();
      revokeChunkUrls();
      try {
        previewAudioRef.current?.pause();
      } catch {
        /* */
      }
      browserCtrlRef.current?.stop();
    },
    [],
  );

  // ───────── Gemini path ─────────
  const loadOrSynthesize = async (force = false) => {
    if (ttsLang === "fa" && !textFa?.trim()) {
      toast.error("برای خواندن فارسی، اول ترجمهٔ فارسی پاراگراف‌ها را بساز.");
      return;
    }
    if (!apiKey) {
      toast.error("Add your Gemini API key in Settings → AI first.");
      return;
    }
    if (!text.trim()) {
      toast.error("This chapter has no text to narrate.");
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
          onChunkReady: ({
            index,
            total,
            text: chunkText,
            blob: chunkBlob,
            cached: chunkCached,
          }) => {
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
      if (!cached) toast.success("Narration ready.");
    } catch (e) {
      const msg =
        e instanceof GeminiTtsError
          ? e.code === "auth"
            ? "Gemini rejected the TTS key — check Settings → AI."
            : e.code === "quota"
              ? "Gemini TTS rate-limit reached. موقتاً به Browser TTS سوییچ شد."
              : e.code === "no-audio"
                ? "Gemini returned no audio. Try a different voice."
                : `TTS failed: ${e.message}`
          : "TTS failed.";
      if (e instanceof GeminiTtsError && e.code === "quota" && isBrowserTtsSupported()) {
        setEngine("browser");
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
    if (engine === "gemini" && audioRef.current) audioRef.current.playbackRate = r;
    if (engine === "browser" && browserCtrlRef.current) browserCtrlRef.current.setRate(r);
  };

  const handleClear = async () => {
    await deleteTTSAudio(bookId, effectiveChapterIndex, voice);
    await deleteTTSChunks(bookId, effectiveChapterIndex, voice);
    revokeUrl();
    revokeChunkUrls();
    setReadyChunks([]);
    setPlayingChunk(null);
    try {
      previewAudioRef.current?.pause();
    } catch {
      /* */
    }
    setAudioUrl(null);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    toast.success("Cached narration deleted.");
  };

  const handleDownload = async () => {
    const row = await getTTSAudio(bookId, effectiveChapterIndex, voice);
    const blob = row?.blob;
    if (!blob) {
      toast.error("No cached audio yet.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeTitle =
      chapterTitle
        .replace(/[^\w\s.-]+/g, "")
        .slice(0, 60)
        .trim() || "chapter";
    a.download = `${safeTitle} (${voice}).wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ───────── ElevenLabs path ─────────
  const loadElevenLabs = async () => {
    if (ttsLang === "fa" && !textFa?.trim()) {
      toast.error("برای خواندن فارسی، اول ترجمهٔ فارسی پاراگراف‌ها را بساز.");
      return;
    }
    if (!elevenKey) {
      toast.error("کلید ElevenLabs را در تنظیمات وارد کنید.");
      return;
    }
    if (!text.trim()) {
      toast.error("متنی برای روایت پیدا نشد.");
      return;
    }
    setElevenLoading(true);
    try {
      const blob = await loadElevenLabsBlob({
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
      toast.success("روایت ElevenLabs آماده شد.");
    } catch (e) {
      toast.error(elevenLabsErrorMessage(e));
    } finally {
      setElevenLoading(false);
    }
  };

  const downloadElevenLabs = async () => {
    if (!audioUrl) {
      toast.error("ابتدا روی Listen بزن.");
      return;
    }
    const a = document.createElement("a");
    a.href = audioUrl;
    const safeTitle =
      chapterTitle
        .replace(/[^\w\s.-]+/g, "")
        .slice(0, 60)
        .trim() || "narration";
    a.download = `${safeTitle} (ElevenLabs ${ttsLang}).mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ───────── Browser TTS path ─────────
  const startBrowser = () => {
    if (!isBrowserTtsSupported()) {
      toast.error("Your browser does not support speech synthesis.");
      return;
    }
    if (ttsLang === "fa" && !textFa?.trim()) {
      toast.error("برای خواندن فارسی، اول ترجمهٔ فارسی پاراگراف‌ها را بساز.");
      return;
    }
    if (!text.trim()) {
      toast.error("This chapter has no text to narrate.");
      return;
    }
    const langPrefix = ttsLang === "fa" ? "fa" : "en";
    const matchingVoices = browserVoices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
    const selected = browserVoices.find((v) => v.id === browserVoiceId);
    const voiceIdForRun = selected?.lang.toLowerCase().startsWith(langPrefix)
      ? browserVoiceId
      : (matchingVoices[0]?.id ?? null);
    if (voiceIdForRun && voiceIdForRun !== browserVoiceId) setBrowserVoiceId(voiceIdForRun);
    browserCtrlRef.current?.stop();
    const ctl = new BrowserTtsController(text, {
      voiceId: voiceIdForRun,
      lang: ttsLang === "fa" ? "fa-IR" : "en-US",
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
        } catch {
          /* ignore */
        }
      },
      onEnd: () => {
        setBrowserPlaying(false);
        setBrowserChunk(null);
        resumeIndexRef.current = 0;
        emitParagraphSpeech(bookId, chapterIndexProp, null);
      },
      onError: () => {
        setBrowserPlaying(false);
        toast.error("Browser TTS error.");
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
            artist: "Chapter narration",
            album: "Language Learning Player",
            artwork: coverUrl,
          }
        : null,
    [open, chapterTitle, coverUrl],
  );

  useMediaSession(
    engine === "gemini" ? audioRef.current : null,
    sessionMeta,
    {
      onPlay:
        engine === "gemini"
          ? () => audioRef.current?.play().catch(() => undefined)
          : () => {
              if (browserCtrlRef.current?.isPaused) {
                browserCtrlRef.current.resume();
                setBrowserPlaying(true);
              } else {
                startBrowser();
              }
            },
      onPause:
        engine === "gemini"
          ? () => audioRef.current?.pause()
          : () => {
              browserCtrlRef.current?.pause();
              setBrowserPlaying(false);
            },
      onSeekBackward: engine === "gemini" ? (s) => seekRel(-Math.max(5, s)) : undefined,
      onSeekForward: engine === "gemini" ? (s) => seekRel(Math.max(5, s)) : undefined,
      onStop: engine === "gemini" ? () => audioRef.current?.pause() : () => stopBrowser(),
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
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md shadow-2xl max-h-[42dvh] overflow-y-auto overscroll-contain"
        role="region"
        aria-label="Chapter narration player"
      >
        <div className="max-w-4xl mx-auto px-2 py-1.5 space-y-1.5 pb-[max(env(safe-area-inset-bottom),0.25rem)]">
          {/* One-row: engine dropdown + lang toggle + close */}
          <div className="flex items-center gap-1.5">
            <EngineSelector
              engine={engine}
              onChange={setEngine}
              browserSupported={browserSupported}
            />

            <LangToggle value={ttsLang} onChange={setTtsLang} />

            <div className="flex-1" />

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

          {engine === "browser" && (
            <BrowserTtsPanel
              browserSupported={browserSupported}
              browserVoiceId={browserVoiceId}
              setBrowserVoiceId={setBrowserVoiceId}
              ttsLang={ttsLang}
              browserVoices={browserVoices}
              rate={rate}
              onRate={onRate}
              browserCtrlRef={browserCtrlRef}
              resumeIndexRef={resumeIndexRef}
              startBrowser={startBrowser}
              stopBrowser={stopBrowser}
              toggleBrowserPlay={toggleBrowserPlay}
              browserPlaying={browserPlaying}
              browserChunk={browserChunk}
            />
          )}

          {/* Body — Gemini TTS */}
          {engine === "gemini" && (
            <>
              {!apiKey ? (
                <div className="text-sm text-muted-foreground">
                  Gemini TTS needs an API key.{" "}
                  <Link to="/settings" className="text-primary underline underline-offset-2">
                    Add it in Settings → AI
                  </Link>
                  .
                </div>
              ) : !audioUrl ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <GeminiVoicePicker voice={voice} onChange={setVoice} size="lg" />
                    <Button onClick={() => loadOrSynthesize(false)} disabled={loading}>
                      {loading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      {loading ? "Generating…" : "Listen"}
                    </Button>
                  </div>
                  {loading && chunkInfo && (
                    <div className="space-y-1">
                      <Progress value={progress * 100} />
                      <p className="text-xs text-muted-foreground">
                        پاراگراف {chunkInfo.done} از {chunkInfo.total} —{" "}
                        {Math.round(progress * 100)}٪
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
                    ~{Math.ceil(text.length / 1000)}k نویسه · هر پاراگراف بلافاصله بعد از ساخت قابل
                    پخش است و در حافظهٔ آفلاین می‌ماند.
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
                        aria-label={playing ? "Pause" : "Play"}
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
                      <GeminiVoicePicker voice={voice} onChange={setVoice} size="sm" />
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
          {engine === "elevenlabs" && (
            <ElevenLabsPanel
              elevenKey={elevenKey}
              audioUrl={audioUrl}
              elevenVoice={elevenVoice}
              setElevenVoice={setElevenVoice}
              elevenModel={elevenModel}
              setElevenModel={setElevenModel}
              elevenLoading={elevenLoading}
              textLength={text.length}
              load={loadElevenLabs}
              download={downloadElevenLabs}
              audioRef={audioRef}
              rate={rate}
              onRate={onRate}
              onSeek={onSeek}
              current={current}
              duration={duration}
              setDuration={setDuration}
              setCurrent={setCurrent}
              playing={playing}
              setPlaying={setPlaying}
              togglePlay={togglePlay}
              seekRel={seekRel}
            />
          )}

          <OtherTtsPanel
            engine={engine}
            azureKey={azureKey}
            hfKey={hfKey}
            playHtUser={playHtUser}
            playHtKey={playHtKey}
            openTtsUrl={openTtsUrl}
            azureVoice={azureVoice}
            setAzureVoice={setAzureVoice}
            hfVoice={hfVoice}
            setHfVoice={setHfVoice}
            playHtVoice={playHtVoice}
            setPlayHtVoice={setPlayHtVoice}
            openTtsVoice={openTtsVoice}
            setOpenTtsVoice={setOpenTtsVoice}
            azureVoiceOpts={azureVoiceOpts}
            hfVoiceOpts={hfVoiceOpts}
            playHtVoiceOpts={playHtVoiceOpts}
            loadOther={loadOther}
            otherLoading={otherLoading}
            audioUrl={audioUrl}
            audioRef={audioRef}
            rate={rate}
            setDuration={setDuration}
            setCurrent={setCurrent}
            setPlaying={setPlaying}
          />
        </div>
      </div>
    </>
  );
});
