/**
 * ShadowingPanel — record-yourself-and-compare study mode for the active cue.
 *
 * Workflow:
 *   1. Click "Replay cue" → seek to the cue start, play, auto-pause at end.
 *   2. Click "Record" → captures mic; the player pauses while recording.
 *   3. Click "Stop" → take is saved to IndexedDB and shown in the takes list.
 *   4. Click "Score" on a take → sends audio to Groq Whisper, computes a
 *      token-level similarity vs. the cue text, and renders a colored diff.
 *
 * The host video element is paused (via videoStore.holdPlayback) during
 * recording so the user can hear themselves cleanly without bleed-through.
 */

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import {
  Mic,
  Square,
  Play,
  Trash2,
  RotateCcw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShadowing } from "@/hooks/useShadowing";
import { useVideoStore } from "@/store/videoStore";
import { useSettingsStore } from "@/store/settingsStore";
import {
  diffTokens,
  formatTakeDuration,
  similarityScore,
  deleteTake,
  updateTake,
  type DiffOp,
} from "@/lib/shadowing";
import type { ShadowingTake, SubtitleCue } from "@/types";
import { GroqError } from "@/lib/groq";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  videoId: string;
  cue: SubtitleCue;
}

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";

/** Lightweight transcription that returns just the text. Reuses the same
 *  Groq endpoint as the bulk transcriber but without word-level granularity. */
async function transcribeBlobToText(blob: Blob, apiKey: string, model: string): Promise<string> {
  if (!apiKey) throw new GroqError("missing_key", "Groq API key is not set.");
  const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
  const file = new File([blob], `take.${ext}`, { type: blob.type || "audio/webm" });
  const form = new FormData();
  form.append("file", file);
  form.append("model", model);
  form.append("response_format", "json");
  // Hint English so single-sentence takes don't get auto-detected as another lang.
  form.append("language", "en");
  let res: Response;
  try {
    res = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch {
    throw new GroqError("network", "Network error while contacting Groq.");
  }
  if (res.status === 401 || res.status === 403)
    throw new GroqError("auth", "Groq rejected the API key.");
  if (res.status === 429) throw new GroqError("rate_limit", "Groq rate limit hit.");
  if (!res.ok) throw new GroqError("unknown", `Groq error (${res.status}).`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

export const ShadowingPanel = memo(function ShadowingPanel({ videoId, cue }: Props) {
  const [open, setOpen] = useState(false);
  const requestSeek = useVideoStore((s) => s.requestSeek);
  const holdPlayback = useVideoStore((s) => s.holdPlayback);
  const releasePlayback = useVideoStore((s) => s.releasePlayback);
  const { autoPauseAtCueEnd, groqApiKey, transcribeModel } = useSettingsStore(
    useShallow((s) => ({
      autoPauseAtCueEnd: s.settings.autoPauseAtCueEnd,
      groqApiKey: s.settings.groqApiKey,
      transcribeModel: s.settings.transcribeModel,
    })),
  );
  const updateSettings = useSettingsStore((s) => s.update);

  const { isRecording, elapsedMs, error, takes, start, stop, cancel, refresh } = useShadowing({
    videoId,
    cueId: cue.id,
    refText: cue.text,
    onRecordingStart: () => {
      // Pause the video for the duration of the recording.
      holdPlayback();
    },
  });

  // Release the playback hold when recording ends (success or cancel).
  const wasRecordingRef = useRef(false);
  useEffect(() => {
    if (wasRecordingRef.current && !isRecording) {
      releasePlayback();
    }
    wasRecordingRef.current = isRecording;
  }, [isRecording, releasePlayback]);

  // Auto-pause at cue end is essential for shadowing — auto-enable it the first
  // time the user opens the panel and remember the previous setting.
  const prevAutoPauseRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (open && !autoPauseAtCueEnd) {
      prevAutoPauseRef.current = autoPauseAtCueEnd;
      updateSettings({ autoPauseAtCueEnd: true });
    }
    return () => {
      if (prevAutoPauseRef.current !== null) {
        updateSettings({ autoPauseAtCueEnd: prevAutoPauseRef.current });
        prevAutoPauseRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const replayCue = () => {
    // Seek to ~120ms before the cue start so playback hits the first phoneme.
    const seekSec = Math.max(0, (cue.startMs - 120) / 1000);
    requestSeek(seekSec, true);
  };

  const elapsedLabel = formatTakeDuration(elapsedMs);

  return (
    <div className="rounded-lg border border-border bg-card/30 p-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide px-1 py-1"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-1.5">
          <Mic className="h-3.5 w-3.5" />
          Shadowing
          {takes.length > 0 && (
            <span className="text-[10px] font-semibold text-primary normal-case tracking-normal">
              {takes.length} take{takes.length === 1 ? "" : "s"}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="mt-2 space-y-3 px-1 pb-1">
          <p className="text-xs text-muted-foreground">
            Listen to the line, then record yourself repeating it. Score your take to see how close
            you got — word-by-word.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={replayCue}
              disabled={isRecording}
              className="h-8"
              title="Seek to the start of this cue and play"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Replay cue
            </Button>

            {!isRecording ? (
              <Button
                type="button"
                size="sm"
                onClick={start}
                className="h-8 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                <Mic className="h-3.5 w-3.5 mr-1.5" /> Record
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={stop}
                  className="h-8"
                  aria-label="Stop and save take"
                >
                  <Square className="h-3.5 w-3.5 mr-1.5 fill-current" />
                  Stop · {elapsedLabel}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={cancel} className="h-8">
                  Cancel
                </Button>
              </>
            )}

            {isRecording && (
              <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                Recording…
              </span>
            )}
          </div>

          {error && (
            <p className="text-xs text-destructive border border-destructive/30 rounded px-2 py-1">
              {error}
            </p>
          )}

          {takes.length === 0 && !isRecording && (
            <p className="text-xs text-muted-foreground italic">No takes for this cue yet.</p>
          )}

          {takes.length > 0 && (
            <ul className="space-y-2">
              {takes.map((t) => (
                <TakeRow
                  key={t.id}
                  take={t}
                  groqApiKey={groqApiKey}
                  transcribeModel={transcribeModel}
                  onChanged={refresh}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
});

interface TakeRowProps {
  take: ShadowingTake;
  groqApiKey: string;
  transcribeModel: string;
  onChanged: () => void | Promise<void>;
}

function TakeRow({ take, groqApiKey, transcribeModel, onChanged }: TakeRowProps) {
  const [scoring, setScoring] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- stable store refs; dynamic deps handled internally
  const audioUrl = useMemo(() => URL.createObjectURL(take.blob), [take.blob, take.id]);
  useEffect(() => {
    return () => URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const score = take.score;
  const hypothesis = take.hypothesis;

  const ops = useMemo<DiffOp[] | null>(() => {
    if (!hypothesis) return null;
    return diffTokens(take.refText, hypothesis);
  }, [hypothesis, take.refText]);

  const scoreColor =
    score == null
      ? "text-muted-foreground"
      : score >= 85
        ? "text-emerald-500"
        : score >= 60
          ? "text-amber-500"
          : "text-destructive";

  const handleScore = async () => {
    if (!groqApiKey) {
      toast.error("Set your Groq API key in Settings to score takes.");
      return;
    }
    setScoring(true);
    try {
      const text = await transcribeBlobToText(take.blob, groqApiKey, transcribeModel);
      if (!text) {
        toast.warning("Couldn't transcribe — try recording again louder.");
        await updateTake(take.id, { hypothesis: "", score: 0 });
      } else {
        const s = similarityScore(take.refText, text);
        await updateTake(take.id, { hypothesis: text, score: s });
      }
      await onChanged();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Scoring failed.";
      toast.error(msg);
    } finally {
      setScoring(false);
    }
  };

  const handleDelete = async () => {
    await deleteTake(take.id);
    await onChanged();
  };

  return (
    <li className="rounded-md border border-border/60 bg-background/40 p-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <audio src={audioUrl} controls preload="metadata" className="h-8 flex-1 min-w-[180px]" />
        <span className={cn("text-xs font-mono tabular-nums", scoreColor)}>
          {score != null ? `${score}%` : `${formatTakeDuration(take.durationMs)}`}
        </span>
        {score == null ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={handleScore}
            disabled={scoring || !groqApiKey}
            title={
              groqApiKey ? "Transcribe & compare to the cue" : "Set your Groq API key in Settings"
            }
          >
            {scoring ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1" />
            )}
            Score
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={handleScore}
            disabled={scoring}
            title="Re-score this take"
          >
            {scoring ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Play className="h-3 w-3 mr-1" />
            )}
            Re-score
          </Button>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={handleDelete}
          aria-label="Delete take"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {ops && (
        <div className="text-sm leading-relaxed">
          <DiffView ops={ops} />
          {hypothesis && (
            <p className="mt-1 text-[11px] text-muted-foreground italic">
              You said: <span className="font-mono">{hypothesis}</span>
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function DiffView({ ops }: { ops: DiffOp[] }) {
  return (
    <p className="flex flex-wrap gap-x-1 gap-y-0.5">
      {ops.map((op, i) => {
        if (op.kind === "match") {
          return (
            <span key={i} className="text-emerald-500/90">
              {op.ref}
            </span>
          );
        }
        if (op.kind === "sub") {
          return (
            <span key={i} className="text-amber-500" title={`said: ${op.hyp ?? ""}`}>
              {op.ref}
            </span>
          );
        }
        if (op.kind === "del") {
          return (
            <span key={i} className="text-destructive line-through opacity-80" title="missed">
              {op.ref}
            </span>
          );
        }
        // insertion: extra word the user said that wasn't in the cue
        return (
          <span
            key={i}
            className="text-destructive/80 italic underline decoration-dotted"
            title="extra"
          >
            +{op.hyp}
          </span>
        );
      })}
    </p>
  );
}
