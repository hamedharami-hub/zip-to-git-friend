import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  Square,
  Loader2,
  Volume2,
  UserCog,
  Stethoscope,
  Pause,
  Play,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSentenceStore, type SentenceLabItem } from "@/store/sentenceStore";
import { useSettingsStore } from "@/store/settingsStore";
import { isWebSpeechSupported, startWebSpeech, type WebSpeechController } from "@/lib/webSpeech";
import { getSentenceAudio } from "@/lib/sentenceAudio";
import { BrowserTtsController, isBrowserTtsSupported } from "@/lib/browserTts";
import { cn } from "@/lib/utils";
import { BidiText } from "@/components/BidiText";
import { RoleplayDissectionModal } from "./RoleplayDissectionModal";
import { RoleplayMarkerPopover } from "./RoleplayMarkerPopover";
import type { Light, GrammarMarker, Turn, RoleplayResponse } from "./roleplayTypes";

const LATENCY_YELLOW_MS = 2500;
const LATENCY_RED_MS = 5000;

export const RoleplayMode = memo(function RoleplayMode({
  item,
  onHarvest,
}: {
  item: SentenceLabItem;
  onHarvest?: (texts: string[]) => void;
}) {
  const { toast } = useToast();
  const sentenceLabModelRef = useSettingsStore((s) => s.settings.sentenceLabModelRef);

  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [light, setLight] = useState<Light>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [showDissection, setShowDissection] = useState(false);
  const [interim, setInterim] = useState("");
  /** Who the USER plays. AI plays the opposite role. */
  const [roleMode, setRoleMode] = useState<"professional" | "candidate">("professional");
  /** Live mode = hands-free; mic auto-restarts after each AI reply. */
  const [liveMode, setLiveMode] = useState(false);
  /** When ON in Live mode, the conversation pauses after each AI reply
   *  instead of auto-restarting the mic. User taps Resume to continue. */
  const [autoPause, setAutoPause] = useState(true);
  /** True while AI reply audio is playing. */
  const [aiSpeaking, setAiSpeaking] = useState(false);
  /** True if user manually paused the live loop. */
  const [livePaused, setLivePaused] = useState(false);

  const recogRef = useRef<WebSpeechController | null>(null);
  const startedAtRef = useRef<number>(0);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  /** Latest values for use inside async callbacks (avoid stale closures). */
  const liveModeRef = useRef(liveMode);
  const autoPauseRef = useRef(autoPause);
  const livePausedRef = useRef(livePaused);
  useEffect(() => {
    liveModeRef.current = liveMode;
  }, [liveMode]);
  useEffect(() => {
    autoPauseRef.current = autoPause;
  }, [autoPause]);
  useEffect(() => {
    livePausedRef.current = livePaused;
  }, [livePaused]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recogRef.current?.abort();
      currentAudioRef.current?.pause();
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (busy || recording) return;
    if (!isWebSpeechSupported()) {
      toast({
        title: "Browser not supported",
        description: "Speech recognition needs Chrome or Edge. Try one of those browsers.",
        variant: "destructive",
      });
      return;
    }
    try {
      setInterim("");
      setLight("idle");
      const ctrl = startWebSpeech({
        lang: "en-US",
        interimResults: true,
        onInterim: (t) => setInterim(t),
      });
      recogRef.current = ctrl;
      startedAtRef.current = performance.now();
      setRecording(true);
    } catch (e) {
      toast({
        title: "Microphone blocked",
        description: e instanceof Error ? e.message : "Could not start recognition.",
        variant: "destructive",
      });
    }
  }, [busy, recording, toast]);

  // Keep a ref to the latest startRecording so audio "ended" handlers
  // can trigger it without going stale.
  const startRecordingRef = useRef(startRecording);
  useEffect(() => {
    startRecordingRef.current = startRecording;
  }, [startRecording]);

  /** Plays the AI reply, tracks aiSpeaking, and (in Live mode + autoPause off)
   *  auto-restarts recording when playback ends. */
  const playReplyControlled = useCallback(
    async (sentenceId: string, turnId: string, text: string) => {
      if (!text?.trim()) return;
      currentAudioRef.current?.pause();
      currentAudioRef.current = null;

      const onEnded = () => {
        setAiSpeaking(false);
        currentAudioRef.current = null;
        if (liveModeRef.current && !autoPauseRef.current && !livePausedRef.current) {
          window.setTimeout(() => {
            void startRecordingRef.current?.();
          }, 350);
        }
      };

      setAiSpeaking(true);
      try {
        const url = await getSentenceAudio(`${sentenceId}__reply_${turnId}`, "en", text);
        const audio = new Audio(url);
        currentAudioRef.current = audio;
        audio.addEventListener("ended", onEnded, { once: true });
        audio.addEventListener("error", onEnded, { once: true });
        await audio.play();
        return;
      } catch (e) {
        console.warn("[RoleplayMode] Gemini TTS unavailable, falling back", e);
      }
      if (isBrowserTtsSupported()) {
        try {
          const ctrl = new BrowserTtsController(text, { rate: 1, pitch: 1, volume: 1 });
          ctrl.start();
          const estMs = Math.min(15000, Math.max(1500, text.length * 70));
          window.setTimeout(onEnded, estMs);
          return;
        } catch (e) {
          console.warn("[RoleplayMode] browser TTS failed", e);
        }
      }
      onEnded();
    },
    [],
  );

  /** Pause / resume the live loop. */
  const toggleLivePause = useCallback(() => {
    setLivePaused((p) => {
      const next = !p;
      if (next) {
        currentAudioRef.current?.pause();
        currentAudioRef.current = null;
        setAiSpeaking(false);
        if (recogRef.current) {
          recogRef.current.abort();
          recogRef.current = null;
          setRecording(false);
          setInterim("");
        }
      } else if (liveModeRef.current && !autoPauseRef.current) {
        // Resuming with autoPause OFF → restart mic immediately.
        window.setTimeout(() => void startRecordingRef.current?.(), 200);
      }
      return next;
    });
  }, []);

  const stopRecording = useCallback(async () => {
    const ctrl = recogRef.current;
    if (!ctrl) return;
    setRecording(false);
    setBusy(true);

    const spokenSeconds = Math.max(0.1, (performance.now() - startedAtRef.current) / 1000);

    try {
      const { transcript } = await ctrl.stop();
      recogRef.current = null;
      setInterim("");

      if (!transcript) {
        toast({ title: "No speech detected", description: "Try again, a bit louder." });
        setBusy(false);
        return;
      }

      // Roleplay controller
      const t0 = performance.now();
      const { data, error } = await supabase.functions.invoke("sentence-roleplay", {
        body: {
          transcript,
          expected_intent: item.expectedIntent,
          ai_counter_prompt: item.aiCounterPrompt,
          scenario_english: item.english,
          scenario_persian: item.persian,
          expected_duration_seconds: item.expectedDurationSeconds,
          spoken_duration_seconds: Math.round(spokenSeconds),
          role_mode: roleMode,
          history: turns.flatMap((t) => [
            { role: "user" as const, content: t.userTranscript },
            { role: "assistant" as const, content: t.ai.ai_audio_response },
          ]),
          model:
            sentenceLabModelRef?.provider === "gateway" ? sentenceLabModelRef.model : undefined,
        },
      });
      const latencyMs = performance.now() - t0;

      if (error) {
        const msg = (error as { message?: string }).message ?? "Roleplay request failed";
        toast({ title: "AI error", description: msg, variant: "destructive" });
        setLight("red");
        setBusy(false);
        return;
      }

      const ai = data as RoleplayResponse;
      const semanticLight = ai.intent_match as Exclude<Light, "idle">;
      const latencyLight: Exclude<Light, "idle"> =
        latencyMs > LATENCY_RED_MS ? "red" : latencyMs > LATENCY_YELLOW_MS ? "yellow" : "green";
      // Final light = worst of the two
      const order: Record<Exclude<Light, "idle">, number> = { green: 0, yellow: 1, red: 2 };
      const finalLight = order[semanticLight] >= order[latencyLight] ? semanticLight : latencyLight;
      setLight(finalLight);

      const turn: Turn = {
        id: crypto.randomUUID(),
        userTranscript: transcript,
        spokenSeconds,
        ai,
        latencyMs,
        light: finalLight,
        ts: Date.now(),
      };
      setTurns((prev) => [...prev, turn]);

      // Bubble harvested phrases up to the parent (right-pane list).
      if (onHarvest && ai.harvested_sentences?.length) {
        onHarvest(ai.harvested_sentences);
      }

      // Speak AI reply: try Gemini TTS, fall back to browser TTS.
      // In Live mode, when audio finishes:
      //   - if autoPause is ON  → wait (user taps Resume).
      //   - if autoPause is OFF → auto-restart the mic for next turn.
      void playReplyControlled(item.id, turn.id, ai.ai_audio_response);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ title: "Recognition failed", description: msg, variant: "destructive" });
      setLight("red");
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable store refs; dynamic deps handled internally
  }, [item, turns, toast, onHarvest, roleMode]);

  // Tap-to-toggle behavior used in Live mode (vs push-to-talk in manual mode).
  const handleMicTap = useCallback(() => {
    if (busy) return;
    if (recording) {
      void stopRecording();
    } else {
      void startRecording();
    }
  }, [busy, recording, startRecording, stopRecording]);

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold">Roleplay drill</CardTitle>
            {liveMode && (
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 text-[10px] uppercase tracking-wide",
                  livePaused
                    ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
                    : "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
                )}
              >
                <Radio className="h-3 w-3" />
                {livePaused ? "Paused" : "Live"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {liveMode && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleLivePause}
                aria-label={livePaused ? "Resume live conversation" : "Pause live conversation"}
                title={livePaused ? "Resume" : "Pause after current turn"}
              >
                {livePaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </Button>
            )}
            <TrafficLight light={light} busy={busy} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Role selector — disabled mid-drill so role can't flip after turn 1 */}
          <div className="rounded-md border bg-muted/30 p-2">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">You play</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={turns.length > 0 || recording || busy}
                onClick={() => setRoleMode("professional")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                  roleMode === "professional"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card hover:bg-muted/50",
                  (turns.length > 0 || recording || busy) && "opacity-60 cursor-not-allowed",
                )}
              >
                <Stethoscope className="h-3.5 w-3.5" />
                Pharmacist / Pro
              </button>
              <button
                type="button"
                disabled={turns.length > 0 || recording || busy}
                onClick={() => setRoleMode("candidate")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                  roleMode === "candidate"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card hover:bg-muted/50",
                  (turns.length > 0 || recording || busy) && "opacity-60 cursor-not-allowed",
                )}
              >
                <UserCog className="h-3.5 w-3.5" />
                Patient / Candidate
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              AI will play the{" "}
              {roleMode === "professional" ? "patient/examiner" : "pharmacist/examiner"}.
              {turns.length > 0 && " Locked for this drill."}
            </p>
          </div>

          {/* Live mode + auto-pause controls */}
          <div className="rounded-md border bg-muted/30 p-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="rp-live" className="text-xs font-medium flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5" />
                Live mode (hands-free)
              </Label>
              <Switch
                id="rp-live"
                checked={liveMode}
                onCheckedChange={(v) => {
                  setLiveMode(v);
                  if (!v) {
                    setLivePaused(false);
                    currentAudioRef.current?.pause();
                  }
                }}
              />
            </div>
            {liveMode && (
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="rp-autopause" className="text-xs text-muted-foreground">
                  Auto-pause after each AI reply
                </Label>
                <Switch id="rp-autopause" checked={autoPause} onCheckedChange={setAutoPause} />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              {liveMode
                ? autoPause
                  ? "AI will speak, then wait. Tap the mic (or Resume) to reply."
                  : "After the AI finishes speaking, the mic will auto-restart."
                : "Push-to-talk: hold the mic to speak, release to send."}
            </p>
          </div>

          <div className="flex items-center justify-center">
            {liveMode ? (
              <button
                type="button"
                onClick={handleMicTap}
                disabled={busy || aiSpeaking}
                aria-label={recording ? "Tap to stop" : "Tap to talk"}
                className={cn(
                  "relative flex h-24 w-24 items-center justify-center rounded-full border-2 transition-all select-none",
                  recording
                    ? "border-destructive bg-destructive/15 scale-110"
                    : aiSpeaking
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-primary bg-primary/10 hover:bg-primary/20",
                  (busy || aiSpeaking) && "opacity-60 cursor-not-allowed",
                )}
              >
                {busy ? (
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                ) : aiSpeaking ? (
                  <Volume2 className="h-8 w-8 text-amber-600 animate-pulse" />
                ) : recording ? (
                  <Square className="h-8 w-8 text-destructive fill-destructive" />
                ) : (
                  <Mic className="h-8 w-8 text-primary" />
                )}
                {recording && (
                  <span className="absolute inset-0 -m-1 rounded-full border-2 border-destructive/50 animate-ping" />
                )}
              </button>
            ) : (
              <button
                type="button"
                onPointerDown={startRecording}
                onPointerUp={stopRecording}
                onPointerLeave={() => recording && stopRecording()}
                onPointerCancel={() => recording && stopRecording()}
                disabled={busy}
                aria-label={recording ? "Release to send" : "Hold to talk"}
                className={cn(
                  "relative flex h-24 w-24 items-center justify-center rounded-full border-2 transition-all",
                  "select-none touch-none",
                  recording
                    ? "border-destructive bg-destructive/15 scale-110"
                    : "border-primary bg-primary/10 hover:bg-primary/20",
                  busy && "opacity-60 cursor-not-allowed",
                )}
              >
                {busy ? (
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                ) : recording ? (
                  <Square className="h-8 w-8 text-destructive fill-destructive" />
                ) : (
                  <Mic className="h-8 w-8 text-primary" />
                )}
                {recording && (
                  <span className="absolute inset-0 -m-1 rounded-full border-2 border-destructive/50 animate-ping" />
                )}
              </button>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground min-h-[1.25rem]">
            {recording ? (
              interim ? (
                <BidiText as="span">“{interim}”</BidiText>
              ) : (
                "Listening…"
              )
            ) : busy ? (
              "Thinking…"
            ) : aiSpeaking ? (
              "AI is speaking…"
            ) : liveMode ? (
              livePaused ? (
                "Paused. Tap Resume to continue."
              ) : (
                "Tap the mic to start speaking"
              )
            ) : (
              "Hold the mic to talk"
            )}
          </p>

          {turns.length > 0 && (
            <>
              <Separator />
              <ScrollArea className="max-h-64">
                <div className="space-y-3 pr-2">
                  {turns.map((t) => (
                    <TurnRow key={t.id} turn={t} sentenceId={item.id} item={item} />
                  ))}
                </div>
              </ScrollArea>
            </>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-xs text-muted-foreground">
              Turns: <span className="font-medium text-foreground">{turns.length}</span>
            </p>
            <Button
              size="sm"
              variant="secondary"
              disabled={turns.length === 0 || busy || recording}
              onClick={() => setShowDissection(true)}
            >
              End drill & dissect
            </Button>
          </div>
        </CardContent>
      </Card>

      <RoleplayDissectionModal
        open={showDissection}
        onOpenChange={setShowDissection}
        turns={turns}
        item={item}
      />
    </>
  );
});

function TrafficLight({ light, busy }: { light: Light; busy: boolean }) {
  const dot = (color: string, active: boolean) => (
    <span
      className={cn(
        "h-2.5 w-2.5 rounded-full transition-opacity",
        color,
        active ? "opacity-100 shadow-[0_0_8px_currentColor]" : "opacity-25",
      )}
    />
  );
  if (busy) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-muted/40 px-2 py-1">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">…</span>
      </div>
    );
  }
  return (
    <div
      className="flex items-center gap-1.5 rounded-full bg-muted/40 px-2 py-1"
      aria-label={`Status: ${light}`}
    >
      {dot("bg-emerald-500 text-emerald-500", light === "green")}
      {dot("bg-amber-500 text-amber-500", light === "yellow")}
      {dot("bg-red-500 text-red-500", light === "red")}
    </div>
  );
}

function TurnRow({
  turn,
  sentenceId,
  item,
}: {
  turn: Turn;
  sentenceId: string;
  item: SentenceLabItem;
}) {
  return (
    <div className="rounded-md border bg-card/40 p-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">You</p>
        {turn.ai.grammar_markers?.length > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400"
          >
            {turn.ai.grammar_markers.length} grammar note
            {turn.ai.grammar_markers.length > 1 ? "s" : ""}
          </Badge>
        )}
      </div>
      <BidiText className="mb-2 leading-relaxed">
        <HighlightedTranscript
          text={turn.userTranscript}
          markers={turn.ai.grammar_markers ?? []}
          item={item}
        />
      </BidiText>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">AI</p>
          <BidiText>{turn.ai.ai_audio_response}</BidiText>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Replay AI"
          onClick={() => void playReply(sentenceId, turn.id, turn.ai.ai_audio_response)}
        >
          <Volume2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** User transcript with grammar errors highlighted as clickable chips. */
function HighlightedTranscript({
  text,
  markers,
  item,
}: {
  text: string;
  markers: GrammarMarker[];
  item: SentenceLabItem;
}) {
  const segments = useMemo(() => buildSegments(text, markers), [text, markers]);
  if (segments.length === 0) return <>{text}</>;
  return (
    <>
      {segments.map((seg, i) =>
        seg.marker ? (
          <RoleplayMarkerPopover key={i} marker={seg.marker} text={seg.text} item={item} />
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

interface Segment {
  text: string;
  marker: GrammarMarker | null;
}

function buildSegments(text: string, markers: GrammarMarker[]): Segment[] {
  if (!markers?.length) return [{ text, marker: null }];
  type Hit = { start: number; end: number; marker: GrammarMarker };
  const hits: Hit[] = [];
  const lower = text.toLowerCase();
  for (const m of markers) {
    const span = (m.span ?? "").trim();
    if (!span) continue;
    let from = 0;
    while (from <= lower.length) {
      const idx = lower.indexOf(span.toLowerCase(), from);
      if (idx === -1) break;
      const end = idx + span.length;
      const overlaps = hits.some((h) => !(end <= h.start || idx >= h.end));
      if (!overlaps) {
        hits.push({ start: idx, end, marker: m });
        break;
      }
      from = idx + 1;
    }
  }
  hits.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start > cursor) out.push({ text: text.slice(cursor, h.start), marker: null });
    out.push({ text: text.slice(h.start, h.end), marker: h.marker });
    cursor = h.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), marker: null });
  return out.length ? out : [{ text, marker: null }];
}

/**
 * Speak the AI reply. Tries Gemini TTS first (better quality, cached
 * across the session), then falls back to the browser's built-in
 * speechSynthesis if Gemini is unavailable (no key, network failure, etc).
 */
async function playReply(sentenceId: string, turnId: string, text: string) {
  if (!text?.trim()) return;
  try {
    const url = await getSentenceAudio(`${sentenceId}__reply_${turnId}`, "en", text);
    const audio = new Audio(url);
    await audio.play();
    return;
  } catch (e) {
    console.warn("[RoleplayMode] Gemini TTS unavailable, falling back to browser TTS", e);
  }
  if (isBrowserTtsSupported()) {
    try {
      const ctrl = new BrowserTtsController(text, { rate: 1, pitch: 1, volume: 1 });
      ctrl.start();
    } catch (e) {
      console.warn("[RoleplayMode] browser TTS failed", e);
    }
  }
}
