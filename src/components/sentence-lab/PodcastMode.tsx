import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Loader2,
  Headphones,
  Mic,
  Settings2,
  Download,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSentenceStore } from "@/store/sentenceStore";
import { getSentenceAudio, warmSentenceAudio } from "@/lib/sentenceAudio";
import {
  startRecognition,
  isSpeechRecognitionSupported,
  type RecognitionHandle,
} from "@/lib/webSpeechRecognition";
import { scoreShadowing, type ShadowingResult } from "@/lib/shadowingScore";
import { getCacheSize } from "@/lib/audioOfflineCache";
import { toast } from "sonner";
import { FlagButton } from "@/components/sentence-lab/FlagButton";

/**
 * Hands-free podcast-style playback for the daily Sentence Lab queue.
 *
 * Modes:
 *  • Listen    — Persian → think gap → English × N (passive listening)
 *  • Shadow    — English → user repeats (Web Speech) → score → next
 *  • Translate — Persian → user speaks English → reveal English → next
 *
 * MediaSession API exposes play/pause/next/prev so the user can control
 * playback from Bluetooth headphones or the locked screen.
 */

type Mode = "listen" | "shadow" | "translate";
type Step = "idle" | "persian" | "silence" | "english_1" | "english_2" | "recording" | "scored";

const SPEEDS = [0.75, 1, 1.25, 1.5];

export const PodcastMode = memo(function PodcastMode() {
  const queue = useSentenceStore((s) => s.queue);
  const currentIndex = useSentenceStore((s) => s.currentIndex);
  const next = useSentenceStore((s) => s.next);
  const gradeCurrent = useSentenceStore((s) => s.gradeCurrent);

  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [loading, setLoading] = useState(false);
  const [silenceProgress, setSilenceProgress] = useState(0);
  const [internalIdx, setInternalIdx] = useState(currentIndex);

  // settings
  const [mode, setMode] = useState<Mode>("listen");
  const [gapSec, setGapSec] = useState(5);
  const [repeatCount, setRepeatCount] = useState(2);
  const [speed, setSpeed] = useState(1);
  const [prefetching, setPrefetching] = useState(false);
  const [cacheInfo, setCacheInfo] = useState({ count: 0, bytes: 0 });

  // shadowing state
  const [transcript, setTranscript] = useState("");
  const [partial, setPartial] = useState("");
  const [shadowResult, setShadowResult] = useState<ShadowingResult | null>(null);
  /** Manual reveal toggle for Listen mode (user clicked "نمایش متن"). */
  const [manualReveal, setManualReveal] = useState(false);
  const recRef = useRef<RecognitionHandle | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const silenceTimer = useRef<number | null>(null);
  const silenceTick = useRef<number | null>(null);
  const cancelled = useRef(false);

  const current = queue[internalIdx];
  const speechSupported = useMemo(() => isSpeechRecognitionSupported(), []);

  useEffect(() => {
    setInternalIdx(currentIndex);
  }, [currentIndex]);

  useEffect(() => {
    void getCacheSize().then(setCacheInfo);
  }, []);

  /* ───────── helpers ───────── */
  const stopSilence = useCallback(() => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
    if (silenceTick.current) {
      clearInterval(silenceTick.current);
      silenceTick.current = null;
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    stopSilence();
    if (recRef.current) {
      recRef.current.abort();
      recRef.current = null;
    }
  }, [stopSilence]);

  const playClip = useCallback(
    (url: string) =>
      new Promise<void>((resolve, reject) => {
        if (!audioRef.current) audioRef.current = new Audio();
        const a = audioRef.current;
        // Detach old handlers to avoid double-firing
        a.onended = null;
        a.onerror = null;
        a.src = url;
        a.playbackRate = speed;
        const cleanup = () => {
          a.onended = null;
          a.onerror = null;
        };
        a.onended = () => {
          cleanup();
          resolve();
        };
        a.onerror = () => {
          cleanup();
          reject(new Error("Audio playback error"));
        };
        void a.play().catch((err) => {
          cleanup();
          reject(err);
        });
      }),
    [speed],
  );

  const wait = useCallback(
    (seconds: number) =>
      new Promise<void>((resolve) => {
        const totalMs = Math.max(300, seconds * 1000);
        const start = Date.now();
        setSilenceProgress(0);
        silenceTick.current = window.setInterval(() => {
          const pct = Math.min(100, ((Date.now() - start) / totalMs) * 100);
          setSilenceProgress(pct);
        }, 100);
        silenceTimer.current = window.setTimeout(() => {
          stopSilence();
          setSilenceProgress(0);
          resolve();
        }, totalMs);
      }),
    [stopSilence],
  );

  const recordOnce = useCallback(
    (maxSeconds: number) =>
      new Promise<string>((resolve) => {
        if (!speechSupported) {
          toast.error("این مرورگر از تشخیص گفتار پشتیبانی نمی‌کند");
          resolve("");
          return;
        }
        setTranscript("");
        setPartial("");
        let finalText = "";
        let settled = false;
        let timeoutId: number | null = null;
        const finish = (text: string) => {
          if (settled) return;
          settled = true;
          if (timeoutId !== null) window.clearTimeout(timeoutId);
          recRef.current = null;
          setPartial("");
          setTranscript(text);
          resolve(text);
        };
        const handle = startRecognition({
          lang: "en-US",
          onPartial: (t) => setPartial(t),
          onFinal: (t) => {
            finalText = t;
          },
          onError: (e) => {
            console.warn("[Shadow] rec error", e);
          },
          onEnd: () => finish(finalText),
        });
        recRef.current = handle;
        timeoutId = window.setTimeout(() => {
          if (recRef.current) recRef.current.stop();
          // safety net if onEnd never fires
          window.setTimeout(() => finish(finalText), 500);
        }, maxSeconds * 1000);
      }),
    [speechSupported],
  );

  /* ───────── main playback loop (iterative, no recursion) ───────── */
  const runSentence = useCallback(
    async (idx: number): Promise<{ next: "continue" | "stop"; nextIdx: number }> => {
      const item = queue[idx];
      if (!item) return { next: "stop", nextIdx: idx };
      const { sentence } = item;
      setShadowResult(null);
      setTranscript("");
      setManualReveal(false);
      setLoading(true);
      const [faUrl, enUrl] = await Promise.all([
        sentence.persian
          ? getSentenceAudio(sentence.id, "fa", sentence.persian)
          : Promise.resolve(""),
        getSentenceAudio(sentence.id, "en", sentence.english),
      ]);
      setLoading(false);
      if (cancelled.current) return { next: "stop", nextIdx: idx };

      const expected = sentence.expectedDurationSeconds ?? gapSec;

      if (mode === "listen") {
        if (faUrl) {
          setStep("persian");
          await playClip(faUrl);
          if (cancelled.current) return { next: "stop", nextIdx: idx };
        }
        setStep("silence");
        await wait(gapSec);
        if (cancelled.current) return { next: "stop", nextIdx: idx };

        for (let r = 0; r < Math.max(1, repeatCount); r++) {
          setStep(r === 0 ? "english_1" : "english_2");
          await playClip(enUrl);
          if (cancelled.current) return { next: "stop", nextIdx: idx };
          if (r < repeatCount - 1) {
            await wait(0.5);
            if (cancelled.current) return { next: "stop", nextIdx: idx };
          }
        }
        void gradeCurrent(3);
      } else if (mode === "shadow") {
        setStep("english_1");
        await playClip(enUrl);
        if (cancelled.current) return { next: "stop", nextIdx: idx };

        setStep("recording");
        const maxRec = Math.max(3, Math.ceil(expected * 1.5));
        const heard = await recordOnce(maxRec);
        if (cancelled.current) return { next: "stop", nextIdx: idx };

        const result = scoreShadowing(sentence.english, heard);
        setShadowResult(result);
        setStep("scored");

        const grade = result.score >= 85 ? 4 : result.score >= 65 ? 3 : result.score >= 40 ? 2 : 1;
        void gradeCurrent(grade);

        await wait(2.5);
        if (cancelled.current) return { next: "stop", nextIdx: idx };
      } else {
        // translate
        if (faUrl) {
          setStep("persian");
          await playClip(faUrl);
          if (cancelled.current) return { next: "stop", nextIdx: idx };
        }
        setStep("recording");
        const maxRec = Math.max(3, Math.ceil(expected * 1.5));
        const heard = await recordOnce(maxRec);
        if (cancelled.current) return { next: "stop", nextIdx: idx };

        const result = scoreShadowing(sentence.english, heard);
        setShadowResult(result);
        setStep("scored");
        await playClip(enUrl);
        if (cancelled.current) return { next: "stop", nextIdx: idx };

        const grade = result.score >= 85 ? 4 : result.score >= 65 ? 3 : result.score >= 40 ? 2 : 1;
        void gradeCurrent(grade);

        await wait(2);
        if (cancelled.current) return { next: "stop", nextIdx: idx };
      }

      return { next: "continue", nextIdx: idx + 1 };
    },
    [queue, playClip, wait, gradeCurrent, mode, gapSec, repeatCount, recordOnce],
  );

  // Iterative driver — avoids recursion + handles graceful stop
  const runFrom = useCallback(
    async (startIdx: number) => {
      let idx = startIdx;
      try {
        while (idx < queue.length) {
          const result = await runSentence(idx);
          if (result.next === "stop" || cancelled.current) return;
          if (result.nextIdx < queue.length) {
            setInternalIdx(result.nextIdx);
            next();
            idx = result.nextIdx;
          } else {
            break;
          }
        }
        setPlaying(false);
        setStep("idle");
        toast.success("🎉 پایان صف امروز");
      } catch (e) {
        console.error("[PodcastMode] playback error", e);
        setLoading(false);
        setPlaying(false);
        setStep("idle");
        toast.error((e as Error).message || "خطا در پخش");
      }
    },
    [queue, runSentence, next],
  );

  /* ───────── controls ───────── */
  const start = useCallback(() => {
    if (playing) return;
    cancelled.current = false;
    setPlaying(true);
    void runFrom(internalIdx);
  }, [playing, runFrom, internalIdx]);

  const pause = useCallback(() => {
    cancelled.current = true;
    stopAudio();
    setPlaying(false);
    setStep("idle");
    setSilenceProgress(0);
  }, [stopAudio]);

  const skipForward = useCallback(() => {
    cancelled.current = true;
    stopAudio();
    void gradeCurrent(4);
    const target = Math.min(queue.length - 1, internalIdx + 1);
    if (target !== internalIdx) {
      setInternalIdx(target);
      next();
    }
    if (playing) {
      setTimeout(() => {
        cancelled.current = false;
        setPlaying(true);
        void runFrom(target);
      }, 80);
    }
  }, [stopAudio, queue.length, internalIdx, next, playing, runFrom, gradeCurrent]);

  const skipBack = useCallback(() => {
    cancelled.current = true;
    stopAudio();
    void gradeCurrent(1);
    if (playing) {
      setTimeout(() => {
        cancelled.current = false;
        setPlaying(true);
        void runFrom(internalIdx);
      }, 80);
    }
  }, [stopAudio, internalIdx, playing, runFrom, gradeCurrent]);

  // When mode changes mid-playback, restart current sentence with new mode
  useEffect(() => {
    if (!playing) return;
    cancelled.current = true;
    stopAudio();
    const t = window.setTimeout(() => {
      cancelled.current = false;
      void runFrom(internalIdx);
    }, 100);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const prefetchAll = useCallback(async () => {
    if (prefetching) return;
    setPrefetching(true);
    try {
      const items: Array<{ id: string; lang: string; text: string }> = [];
      for (const q of queue) {
        items.push({ id: q.sentence.id, lang: "en", text: q.sentence.english });
        if (q.sentence.persian) {
          items.push({ id: q.sentence.id, lang: "fa", text: q.sentence.persian });
        }
      }
      await warmSentenceAudio(items);
      const info = await getCacheSize();
      setCacheInfo(info);
      toast.success(`دانلود کامل · ${items.length} فایل آفلاین شد`);
    } catch (e) {
      toast.error("دانلود ناموفق: " + (e as Error).message);
    } finally {
      setPrefetching(false);
    }
  }, [queue, prefetching]);

  /* ───────── MediaSession ───────── */
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    if (current) {
      ms.metadata = new MediaMetadata({
        title: current.sentence.english.slice(0, 80),
        artist: current.sentence.persian ?? "Sentence Lab",
        album: "Daily Drill",
      });
    }
    ms.setActionHandler("play", start);
    ms.setActionHandler("pause", pause);
    ms.setActionHandler("nexttrack", skipForward);
    ms.setActionHandler("previoustrack", skipBack);
    ms.playbackState = playing ? "playing" : "paused";
    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("nexttrack", null);
      ms.setActionHandler("previoustrack", null);
    };
  }, [current, start, pause, skipForward, skipBack, playing]);

  useEffect(() => {
    return () => {
      cancelled.current = true;
      stopAudio();
    };
  }, [stopAudio]);

  if (queue.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Queue is empty.
        </CardContent>
      </Card>
    );
  }

  const stepLabel: Record<Step, string> = {
    idle: "Idle",
    persian: "🇮🇷 Persian",
    silence: "🤔 Think…",
    english_1: "🇬🇧 English",
    english_2: "🇬🇧 Repeat",
    recording: "🎙️ Speak now",
    scored: "✅ Scored",
  };

  const progressPct = queue.length > 0 ? ((internalIdx + 1) / queue.length) * 100 : 0;
  const cacheMb = (cacheInfo.bytes / 1024 / 1024).toFixed(1);

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Podcast Mode</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={playing ? "default" : "secondary"}>
              {loading ? "Loading…" : stepLabel[step]}
            </Badge>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Settings">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-4" align="end">
                <div>
                  <Label className="text-xs">حالت</Label>
                  <ToggleGroup
                    type="single"
                    value={mode}
                    onValueChange={(v) => v && setMode(v as Mode)}
                    className="mt-1 grid grid-cols-3"
                  >
                    <ToggleGroupItem value="listen" className="text-xs">
                      Listen
                    </ToggleGroupItem>
                    <ToggleGroupItem value="shadow" className="text-xs" disabled={!speechSupported}>
                      Shadow
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="translate"
                      className="text-xs"
                      disabled={!speechSupported}
                    >
                      Translate
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {!speechSupported && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Shadow/Translate نیاز به Chrome دارد
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex justify-between">
                    <Label className="text-xs">فاصله فکر کردن</Label>
                    <span className="text-xs text-muted-foreground">{gapSec}s</span>
                  </div>
                  <Slider
                    value={[gapSec]}
                    min={2}
                    max={15}
                    step={1}
                    onValueChange={([v]) => setGapSec(v)}
                    className="mt-2"
                  />
                </div>

                <div>
                  <div className="flex justify-between">
                    <Label className="text-xs">تکرار انگلیسی</Label>
                    <span className="text-xs text-muted-foreground">×{repeatCount}</span>
                  </div>
                  <Slider
                    value={[repeatCount]}
                    min={1}
                    max={4}
                    step={1}
                    onValueChange={([v]) => setRepeatCount(v)}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label className="text-xs">سرعت پخش</Label>
                  <ToggleGroup
                    type="single"
                    value={String(speed)}
                    onValueChange={(v) => v && setSpeed(parseFloat(v))}
                    className="mt-1 grid grid-cols-4"
                  >
                    {SPEEDS.map((s) => (
                      <ToggleGroupItem key={s} value={String(s)} className="text-xs">
                        {s}×
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>

                <div className="border-t pt-3">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">آفلاین</span>
                    <span>
                      {cacheInfo.count} فایل · {cacheMb} MB
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={prefetchAll}
                    disabled={prefetching}
                  >
                    {prefetching ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-3 w-3" />
                    )}
                    دانلود کل صف برای آفلاین
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {internalIdx + 1} / {queue.length}
            </span>
            <span>{Math.round(progressPct)}%</span>
          </div>
          <Progress value={progressPct} className="h-1" />
        </div>

        {current &&
          (() => {
            // Decide what to show based on mode + step.
            // Listen: only Persian; English revealed at the end OR on user click.
            // Shadow: hide everything during play; show English when recording/scored.
            // Translate: only Persian until scored.
            const isShadow = mode === "shadow";
            const isTranslate = mode === "translate";
            const isListen = mode === "listen";
            const s: Step = step;

            const showEnglish =
              manualReveal ||
              s === "scored" ||
              (isListen && s === "english_2") ||
              (isShadow && (s === "recording" || s === "english_1"));

            const showPersian =
              !!current.sentence.persian &&
              (isListen || isTranslate || (isShadow && s === "scored"));

            const hideAll = isShadow && (s === "idle" || s === "persian" || s === "silence");

            return (
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {hideAll && (
                      <p className="text-center text-xs italic text-muted-foreground py-2">
                        🎧 فقط گوش کن…
                      </p>
                    )}
                    {showEnglish && (
                      <p className="font-medium leading-snug">{current.sentence.english}</p>
                    )}
                    {showPersian && (
                      <p dir="rtl" className="mt-1 text-right text-muted-foreground">
                        {current.sentence.persian}
                      </p>
                    )}
                    {/* Manual reveal button for Listen mode while English is hidden */}
                    {isListen && !showEnglish && step !== "idle" && (
                      <button
                        onClick={() => setManualReveal(true)}
                        className="mt-2 text-[11px] text-primary/80 hover:text-primary underline-offset-2 hover:underline"
                      >
                        نمایش متن انگلیسی
                      </button>
                    )}
                  </div>
                  <FlagButton sentenceId={current.sentence.id} size="sm" />
                </div>
              </div>
            );
          })()}

        {step === "silence" && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Translate aloud · {gapSec}s</p>
            <Progress value={silenceProgress} className="h-1.5" />
          </div>
        )}

        {step === "recording" && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
              <Mic className="h-3 w-3 animate-pulse" />
              در حال شنیدن…
            </div>
            {partial && <p className="text-xs italic text-muted-foreground">{partial}</p>}
          </div>
        )}

        {step === "scored" && shadowResult && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">امتیاز شما</span>
              <Badge variant={shadowResult.score >= 70 ? "default" : "destructive"}>
                {shadowResult.score}%
              </Badge>
            </div>
            {transcript && (
              <p className="mb-2 text-muted-foreground">
                <span className="font-medium text-foreground">شنیده شد: </span>
                {transcript}
              </p>
            )}
            <div className="flex flex-wrap gap-1">
              {shadowResult.missingWords.slice(0, 8).map((w, i) => (
                <span
                  key={`m${i}`}
                  className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-destructive"
                >
                  <XCircle className="h-3 w-3" />
                  {w}
                </span>
              ))}
              {shadowResult.matched > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                  <CheckCircle2 className="h-3 w-3" />
                  {shadowResult.matched}/{shadowResult.total}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={skipBack}
            aria-label="Repeat (Again)"
            title="Mark as Again — repeat sentence"
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            size="lg"
            onClick={playing ? pause : start}
            disabled={loading}
            className="h-12 w-12 rounded-full"
            aria-label={playing ? "Pause" : "Play"}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : playing ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={skipForward}
            disabled={internalIdx >= queue.length - 1}
            aria-label="Next (Easy)"
            title="Mark as Easy — skip to next"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});
