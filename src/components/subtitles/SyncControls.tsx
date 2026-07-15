import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useSubtitleStore } from "@/store/subtitleStore";
import { useSettingsStore } from "@/store/settingsStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useState } from "react";
import type { SubtitleTrack } from "@/types";

function TrackSync({ track, label }: { track: SubtitleTrack; label: string }) {
  const updateTrack = useSubtitleStore((s) => s.updateTrack);
  const [delayMs, setDelayMs] = useState(track.delayMs);
  const [speedMultiplier, setSpeedMultiplier] = useState(track.speedMultiplier);

  // Keep local sliders in sync when the track is loaded/changed from outside.
  useEffect(() => {
    setDelayMs(track.delayMs);
    setSpeedMultiplier(track.speedMultiplier);
  }, [track.delayMs, track.speedMultiplier]);

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">{label}</h4>
        <span className="text-xs text-muted-foreground">
          {track.cues.length} cues · {track.language}
        </span>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <Label>Delay</Label>
          <span className="text-muted-foreground tabular-nums">{delayMs} ms</span>
        </div>
        <Slider
          value={[delayMs]}
          min={-5000}
          max={5000}
          step={50}
          onValueChange={([v]) => setDelayMs(v)}
          onValueCommit={([v]) => updateTrack(track.role, { delayMs: v })}
        />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <Label>Speed</Label>
          <span className="text-muted-foreground tabular-nums">{speedMultiplier.toFixed(2)}×</span>
        </div>
        <Slider
          value={[speedMultiplier]}
          min={0.5}
          max={2}
          step={0.01}
          onValueChange={([v]) => setSpeedMultiplier(v)}
          onValueCommit={([v]) => updateTrack(track.role, { speedMultiplier: v })}
        />
      </div>
    </div>
  );
}

export function SyncControls() {
  const primary = useSubtitleStore((s) => s.primary);
  const secondary = useSubtitleStore((s) => s.secondary);
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Display mode</Label>
          <Select
            value={settings.displayMode}
            onValueChange={(v: "inside" | "outside" | "hybrid") => update({ displayMode: v })}
          >
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inside">Inside</SelectItem>
              <SelectItem value="outside">Outside</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Font size</Label>
          <Select
            value={settings.fontSize}
            onValueChange={(v: "sm" | "md" | "lg" | "xl") => update({ fontSize: v })}
          >
            <SelectTrigger className="w-[100px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
              <SelectItem value="xl">XL</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {primary ? (
          <TrackSync track={primary} label="Primary (English)" />
        ) : (
          <p className="text-sm text-muted-foreground rounded-md border border-dashed border-border p-3">
            No primary track loaded.
          </p>
        )}
        {secondary ? (
          <TrackSync track={secondary} label="Secondary (Persian)" />
        ) : (
          <p className="text-sm text-muted-foreground rounded-md border border-dashed border-border p-3">
            No secondary track loaded.
          </p>
        )}
      </div>
    </div>
  );
}
