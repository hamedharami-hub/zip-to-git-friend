import { memo } from "react";
import { Link } from "react-router-dom";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Engine } from "./constants";

interface Props {
  engine: Engine;
  azureKey: string;
  hfKey: string;
  playHtUser: string;
  playHtKey: string;
  openTtsUrl: string;
  azureVoice: string;
  setAzureVoice: (v: string) => void;
  hfVoice: string;
  setHfVoice: (v: string) => void;
  playHtVoice: string;
  setPlayHtVoice: (v: string) => void;
  openTtsVoice: string;
  setOpenTtsVoice: (v: string) => void;
  azureVoiceOpts: Array<{ id: string; label: string }>;
  hfVoiceOpts: Array<{ id: string; label: string }>;
  playHtVoiceOpts: Array<{ id: string; label: string }>;
  loadOther: (force?: boolean) => void | Promise<void>;
  otherLoading: boolean;
  audioUrl: string | null;
  audioRef: React.RefObject<HTMLAudioElement>;
  rate: number;
  setDuration: (d: number) => void;
  setCurrent: (c: number) => void;
  setPlaying: (p: boolean) => void;
}

export const OtherTtsPanel = memo(function OtherTtsPanel({
  engine,
  azureKey,
  hfKey,
  playHtUser,
  playHtKey,
  openTtsUrl,
  azureVoice,
  setAzureVoice,
  hfVoice,
  setHfVoice,
  playHtVoice,
  setPlayHtVoice,
  openTtsVoice,
  setOpenTtsVoice,
  azureVoiceOpts,
  hfVoiceOpts,
  playHtVoiceOpts,
  loadOther,
  otherLoading,
  audioUrl,
  audioRef,
  rate,
  setDuration,
  setCurrent,
  setPlaying,
}: Props) {
  if (
    engine !== "azure" &&
    engine !== "huggingface" &&
    engine !== "playht" &&
    engine !== "opentts"
  ) {
    return null;
  }

  return (
    <div className="space-y-3">
      {engine === "azure" && !azureKey && (
        <div className="text-sm text-muted-foreground">
          Azure نیاز به key + region دارد.{" "}
          <Link to="/settings" className="text-primary underline">
            تنظیمات → AI
          </Link>
        </div>
      )}
      {engine === "huggingface" && !hfKey && (
        <div className="text-sm text-muted-foreground">
          Hugging Face نیاز به token دارد.{" "}
          <Link to="/settings" className="text-primary underline">
            تنظیمات → AI
          </Link>
        </div>
      )}
      {engine === "playht" && (!playHtUser || !playHtKey) && (
        <div className="text-sm text-muted-foreground">
          Play.ht نیاز به user id + key دارد.{" "}
          <Link to="/settings" className="text-primary underline">
            تنظیمات → AI
          </Link>
        </div>
      )}
      {engine === "opentts" && !openTtsUrl && (
        <div className="text-sm text-muted-foreground">
          آدرس سرور OpenTTS را در تنظیمات بگذار.{" "}
          <Link to="/settings" className="text-primary underline">
            تنظیمات → AI
          </Link>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {engine === "azure" && (
          <Select value={azureVoice} onValueChange={setAzureVoice}>
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue placeholder="انتخاب صدا" />
            </SelectTrigger>
            <SelectContent>
              {azureVoiceOpts.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {engine === "huggingface" && (
          <Select value={hfVoice} onValueChange={setHfVoice}>
            <SelectTrigger className="h-9 w-[260px]">
              <SelectValue placeholder="انتخاب مدل" />
            </SelectTrigger>
            <SelectContent>
              {hfVoiceOpts.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {engine === "playht" && (
          <Select value={playHtVoice} onValueChange={setPlayHtVoice}>
            <SelectTrigger className="h-9 w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {playHtVoiceOpts.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {engine === "opentts" && (
          <input
            type="text"
            value={openTtsVoice}
            onChange={(e) => setOpenTtsVoice(e.target.value)}
            placeholder="e.g. coqui-tts:fa_custom"
            className="h-9 px-2 rounded-md border border-border bg-background text-sm w-[260px]"
          />
        )}
        <Button onClick={() => loadOther(false)} disabled={otherLoading}>
          {otherLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          {otherLoading ? "در حال ساخت…" : "Listen"}
        </Button>
      </div>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          controls
          className="w-full"
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
      )}
    </div>
  );
});
