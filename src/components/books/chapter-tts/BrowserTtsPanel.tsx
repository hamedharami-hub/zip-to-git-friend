import { memo } from "react";
import { RotateCcw, Pause, Play, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { BrowserTtsController, type BrowserTtsVoice } from "@/lib/browserTts";

interface Props {
  browserSupported: boolean;
  browserVoiceId: string | null;
  setBrowserVoiceId: (id: string | null) => void;
  ttsLang: "en" | "fa";
  browserVoices: BrowserTtsVoice[];
  rate: number;
  onRate: (r: number) => void;
  browserCtrlRef: React.MutableRefObject<BrowserTtsController | null>;
  resumeIndexRef: React.MutableRefObject<number>;
  startBrowser: () => void;
  stopBrowser: () => void;
  toggleBrowserPlay: () => void;
  browserPlaying: boolean;
  browserChunk: { done: number; total: number } | null;
}

export const BrowserTtsPanel = memo(function BrowserTtsPanel({
  browserSupported,
  browserVoiceId,
  setBrowserVoiceId,
  ttsLang,
  browserVoices,
  rate,
  onRate,
  browserCtrlRef,
  resumeIndexRef,
  startBrowser,
  stopBrowser,
  toggleBrowserPlay,
  browserPlaying,
  browserChunk,
}: Props) {
  if (!browserSupported) {
    return (
      <div className="text-xs text-muted-foreground">
        مرورگر شما TTS داخلی ندارد. Gemini را امتحان کن.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Select value={browserVoiceId ?? undefined} onValueChange={(v) => setBrowserVoiceId(v)}>
          <SelectTrigger className="h-7 max-w-[200px] text-[11px]">
            <SelectValue placeholder="Voice" />
          </SelectTrigger>
          <SelectContent className="max-h-[40vh]">
            {browserVoices.length === 0 && (
              <SelectItem value="__none__" disabled>
                Loading…
              </SelectItem>
            )}
            {browserVoices
              .filter((v) => v.lang.toLowerCase().startsWith(ttsLang === "fa" ? "fa" : "en"))
              .map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name} <span className="opacity-60">({v.lang})</span>
                </SelectItem>
              ))}
            {browserVoices.length > 0 &&
              browserVoices.filter((v) =>
                v.lang.toLowerCase().startsWith(ttsLang === "fa" ? "fa" : "en"),
              ).length === 0 && (
                <SelectItem value="__no_voice__" disabled>
                  {ttsLang === "fa"
                    ? "صدای فارسی روی این مرورگر پیدا نشد"
                    : "No English voice found"}
                </SelectItem>
              )}
          </SelectContent>
        </Select>
        <Select value={String(rate)} onValueChange={(v) => onRate(Number(v))}>
          <SelectTrigger className="h-7 w-[60px] text-[11px]">
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
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title="پاراگراف قبلی"
          onClick={() => {
            const c = browserCtrlRef.current;
            const idx = c ? c.index : resumeIndexRef.current;
            const target = Math.max(0, idx - 1);
            c?.stop();
            browserCtrlRef.current = null;
            resumeIndexRef.current = target;
            startBrowser();
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          className="h-7 px-2 gap-1 text-[11px]"
          onClick={toggleBrowserPlay}
          title={browserPlaying ? "Pause" : "Listen"}
        >
          {browserPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {browserPlaying ? "Pause" : "Listen"}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title="پاراگراف بعدی"
          onClick={() => {
            const c = browserCtrlRef.current;
            const total = c ? c.totalChunks : 0;
            const idx = c ? c.index : resumeIndexRef.current;
            const target = total > 0 ? Math.min(total - 1, idx + 1) : idx + 1;
            c?.stop();
            browserCtrlRef.current = null;
            resumeIndexRef.current = target;
            startBrowser();
          }}
        >
          <RotateCw className="h-3.5 w-3.5" />
        </Button>

        {(browserCtrlRef.current || resumeIndexRef.current > 0) && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={stopBrowser}>
            Stop
          </Button>
        )}
      </div>
      {browserChunk && (
        <div className="space-y-0.5">
          <Progress value={(browserChunk.done / browserChunk.total) * 100} className="h-1" />
          <p className="text-[10px] text-muted-foreground">
            {browserChunk.done} / {browserChunk.total}
          </p>
        </div>
      )}
      {ttsLang === "fa" &&
        browserVoices.length > 0 &&
        browserVoices.filter((v) => v.lang.toLowerCase().startsWith("fa")).length === 0 && (
          <p className="text-[11px] text-destructive/90 leading-relaxed">
            این مرورگر فعلاً صدای fa-IR را به Web Speech API نداده است؛ اگر روی گوشی صدای فارسی نصب
            است، یک‌بار مرورگر/اپ را کامل ببند و باز کن، یا از Azure/ElevenLabs استفاده کن.
          </p>
        )}
    </div>
  );
});
