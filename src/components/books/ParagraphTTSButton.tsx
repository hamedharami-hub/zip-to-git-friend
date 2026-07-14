/**
 * Tiny inline play/pause button that narrates a single paragraph via Gemini TTS.
 *
 * Synthesizes on first click, caches the resulting WAV blob URL in component
 * state (per-paragraph), and exposes simple play/pause toggling. We do NOT
 * persist this to IndexedDB because paragraphs are small and cheap to re-gen.
 */
import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSettingsStore } from "@/store/settingsStore";
import { GeminiTtsError, synthesizeText, type GeminiTtsVoice } from "@/lib/geminiTts";
import { isBrowserTtsSupported } from "@/lib/browserTts";
import { cn } from "@/lib/utils";

interface Props {
  text: string;
  className?: string;
  /** When 'fa', prefer Web Speech with a Persian voice; falls back to Gemini. */
  lang?: "en" | "fa";
}

const VOICE_KEY = "llvp-tts-voice";

function getStoredVoice(): GeminiTtsVoice {
  try {
    const v = localStorage.getItem(VOICE_KEY) as GeminiTtsVoice | null;
    return v ?? "Kore";
  } catch {
    return "Kore";
  }
}

export function ParagraphTTSButton({ text, className, lang = "en" }: Props) {
  const { settings } = useSettingsStore();
  const apiKey = settings.geminiTtsApiKey || settings.geminiApiKey;

  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const speakingRef = useRef(false);

  useEffect(() => {
    return () => cleanup();
  }, []);

  function cleanup() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (speakingRef.current && isBrowserTtsSupported()) {
      window.speechSynthesis.cancel();
      speakingRef.current = false;
    }
  }

  /** Try the browser's Web Speech engine in the requested language. */
  function speakWithBrowser(targetLang: string): boolean {
    if (!isBrowserTtsSupported()) return false;
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    const prefix = targetLang.toLowerCase().slice(0, 2);
    const voice = voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
    if (!voice && targetLang === "fa-IR") return false; // require a Persian voice
    const u = new SpeechSynthesisUtterance(text);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = targetLang;
    }
    u.onstart = () => {
      setPlaying(true);
      speakingRef.current = true;
    };
    u.onend = () => {
      setPlaying(false);
      speakingRef.current = false;
    };
    u.onerror = () => {
      setPlaying(false);
      speakingRef.current = false;
    };
    synth.cancel();
    synth.speak(u);
    return true;
  }

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();

    // Toggle pause/resume if Gemini audio already loaded.
    if (audioRef.current) {
      if (audioRef.current.paused) {
        try {
          await audioRef.current.play();
        } catch {
          /* ignore */
        }
      } else {
        audioRef.current.pause();
      }
      return;
    }

    // Stop in-flight Web Speech utterance (acts as toggle).
    if (speakingRef.current) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      speakingRef.current = false;
      return;
    }

    if (!text.trim()) return;

    // Persian → try Web Speech first (instant, free, offline).
    if (lang === "fa") {
      if (speakWithBrowser("fa-IR")) return;
      if (!apiKey) {
        toast.error(
          "برای صدای فارسی، یک صدای فارسی در سیستم نصب کن یا کلید Gemini در تنظیمات بگذار.",
        );
        return;
      }
    } else if (!apiKey) {
      // English → if no Gemini key, fall back to Web Speech.
      if (speakWithBrowser("en-US")) return;
      toast.error("Add your Gemini API key in Settings → AI to use TTS.");
      return;
    }

    setLoading(true);
    try {
      const blob = await synthesizeText(apiKey!, text, getStoredVoice());
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audio.onplay = () => setPlaying(true);
      audio.onpause = () => setPlaying(false);
      audio.onended = () => setPlaying(false);
      audioRef.current = audio;
      await audio.play();
    } catch (err) {
      const msg =
        err instanceof GeminiTtsError
          ? err.code === "auth"
            ? "Gemini rejected the TTS key — check Settings → AI."
            : err.code === "quota"
              ? "Gemini TTS rate limit hit. Wait a moment."
              : `TTS failed: ${err.message}`
          : "TTS failed.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const Icon = loading ? Loader2 : playing ? Pause : audioRef.current ? Play : Volume2;

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={handleClick}
      disabled={loading}
      className={cn("h-7 w-7", className)}
      title={playing ? "Pause" : "Listen to this paragraph"}
      aria-label={playing ? "Pause paragraph" : "Listen to this paragraph"}
    >
      <Icon className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
    </Button>
  );
}
