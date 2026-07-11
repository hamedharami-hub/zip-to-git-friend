import { useRef, useState } from "react";
import { Mic, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/settingsStore";
import { useSubtitleStore } from "@/store/subtitleStore";
import { useVideoStore } from "@/store/videoStore";
import { useOnline } from "@/hooks/useOnline";
import { transcribeWithGroq, GroqError } from "@/lib/groq";
import { extractAudioChunks } from "@/lib/audioExtract";
import type { SubtitleCue, SubtitleTrack } from "@/types";
import { toast } from "sonner";

interface Props {
  videoId: string;
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export function AutoTranscribe({ videoId }: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const setTrack = useSubtitleStore((s) => s.setTrack);
  const current = useVideoStore((s) => s.current);
  const online = useOnline();
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const runWithFile = async (file: File) => {
    if (!settings.groqApiKey) {
      toast.error("Add your Groq API key in Settings.");
      return;
    }
    setRunning(true);
    setPhase("Extracting audio…");
    try {
      // 1) Decode + downsample + chunk in-browser → small mono 16k WAV chunks
      const chunks = await extractAudioChunks(file);
      const total = chunks.length;
      const allCues: SubtitleCue[] = [];
      let runningIndex = 0;

      for (const chunk of chunks) {
        setPhase(total > 1 ? `Transcribing chunk ${chunk.index + 1}/${total}…` : "Transcribing…");
        const chunkFile = new File([chunk.blob], `chunk-${chunk.index}.wav`, {
          type: "audio/wav",
        });
        const cues = await transcribeWithGroq(
          chunkFile,
          settings.groqApiKey,
          "en",
          settings.transcribeModel,
          chunk.offsetSec,
          runningIndex,
        );
        runningIndex += cues.length;
        allCues.push(...cues);
      }

      if (!allCues.length) {
        toast.error("No speech detected.");
        return;
      }

      const track: SubtitleTrack = {
        id: uuid(),
        videoId,
        language: "en",
        role: "primary",
        cues: allCues,
        delayMs: 0,
        speedMultiplier: 1,
      };
      await setTrack(track);
      toast.success(
        total > 1
          ? `Transcribed ${allCues.length} segments across ${total} chunks.`
          : `Transcribed ${allCues.length} segments.`,
      );
    } catch (e) {
      const msg = e instanceof GroqError ? friendly(e) : friendlyGeneric(e);
      toast.error(msg);
    } finally {
      setRunning(false);
      setPhase("");
    }
  };

  const handleClick = async () => {
    if (running) return;
    if (current?.blobUrl) {
      try {
        const res = await fetch(current.blobUrl);
        if (res.ok) {
          const blob = await res.blob();
          const file = new File([blob], current.fileName || "video.mp4", {
            type: blob.type || "video/mp4",
          });
          await runWithFile(file);
          return;
        }
      } catch {
        /* fall through to file picker */
      }
    }
    fileRef.current?.click();
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) runWithFile(f);
          e.target.value = "";
        }}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={running || !online}
        title={!online ? "Requires an internet connection" : undefined}
        aria-label="Auto-generate subtitles"
      >
        {running ? (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
        ) : (
          <Mic className="h-4 w-4 mr-1.5" aria-hidden="true" />
        )}
        {running ? phase || "Working…" : "Auto-generate subtitles"}
      </Button>
    </>
  );
}

function friendly(e: GroqError): string {
  switch (e.code) {
    case "missing_key":
      return "Add your Groq API key in Settings.";
    case "auth":
      return "Groq API key was rejected.";
    case "rate_limit":
      return "Groq rate limit reached. Try again later.";
    case "invalid_response":
      return "Groq returned no usable transcription.";
    case "network":
      return "Network error contacting Groq.";
    default:
      return e.message || "Transcription failed.";
  }
}

function friendlyGeneric(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (/decodeAudioData|Unable to decode/i.test(msg))
    return "Could not decode this file. Try MP4/MP3/WAV/M4A.";
  return "Transcription failed.";
}
