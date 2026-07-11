/**
 * Gemini voice picker. Extracted from ChapterTTSPlayer.
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GEMINI_TTS_VOICES, type GeminiTtsVoice } from "@/lib/geminiTts";

interface Props {
  voice: GeminiTtsVoice;
  onChange: (v: GeminiTtsVoice) => void;
  /** Trigger size: "lg" (h-9 w-[200px]) or "sm" (h-8 w-[160px]). */
  size?: "lg" | "sm";
}

export function GeminiVoicePicker({ voice, onChange, size = "lg" }: Props) {
  const triggerCls = size === "lg" ? "h-9 w-[200px]" : "h-8 w-[160px]";
  return (
    <Select value={voice} onValueChange={(v) => onChange(v as GeminiTtsVoice)}>
      <SelectTrigger className={triggerCls}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {GEMINI_TTS_VOICES.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            {v.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
