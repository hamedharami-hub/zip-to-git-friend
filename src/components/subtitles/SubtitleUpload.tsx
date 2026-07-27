import { useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubtitleStore } from "@/store/subtitleStore";
import { parseSRT } from "@/lib/srtParser";
import { parseVTT } from "@/lib/vttParser";
import type { SubtitleTrack } from "@/types";
import { toast } from "sonner";

interface Props {
  videoId: string;
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export function SubtitleUpload({ videoId }: Props) {
  const primaryRef = useRef<HTMLInputElement>(null);
  const secondaryRef = useRef<HTMLInputElement>(null);
  const setTrack = useSubtitleStore((s) => s.setTrack);
  const primary = useSubtitleStore((s) => s.primary);
  const secondary = useSubtitleStore((s) => s.secondary);

  const parseForFile = (file: File, text: string) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "vtt") return parseVTT(text);
    return parseSRT(text);
  };

  const handleUpload = async (file: File, role: "primary" | "secondary", language: "en" | "fa") => {
    try {
      const text = await file.text();
      const cues = parseForFile(file, text);
      if (!cues.length) {
        toast.error("No valid cues found in subtitle file.");
        return;
      }
      const track: SubtitleTrack = {
        id: uuid(),
        videoId,
        language,
        role,
        cues,
        delayMs: 0,
        speedMultiplier: 1,
      };
      await setTrack(track);
      toast.success(`Loaded ${cues.length} ${role} cues.`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to parse subtitle file.");
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={primaryRef}
        type="file"
        accept=".srt,.vtt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f, "primary", "en");
          e.target.value = "";
        }}
      />
      <input
        ref={secondaryRef}
        type="file"
        accept=".srt,.vtt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f, "secondary", "fa");
          e.target.value = "";
        }}
      />
      <Button variant="outline" onClick={() => primaryRef.current?.click()}>
        <Upload className="h-4 w-4 mr-2" />
        Upload English SRT/VTT {primary ? `(${primary.cues.length})` : ""}
      </Button>
      <Button variant="outline" onClick={() => secondaryRef.current?.click()}>
        <Upload className="h-4 w-4 mr-2" />
        Upload Persian SRT/VTT {secondary ? `(${secondary.cues.length})` : ""}
      </Button>
    </div>
  );
}
