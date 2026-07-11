import { useState } from "react";
import { Repeat, Square, Settings2 } from "lucide-react";
import type { SubtitleCue, LoopConfig } from "@/types";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLoopStore, DEFAULT_PATTERN } from "@/store/loopStore";

interface Props {
  cue: SubtitleCue | null;
}

type Vis = LoopConfig["visibilityPattern"][number];
const VIS_LABEL: Record<Vis, string> = {
  both: "Both",
  primary: "Primary only",
  secondary: "Secondary only",
  none: "No subtitles",
};

export function LoopControls({ cue }: Props) {
  const config = useLoopStore((s) => s.config);
  const activeCue = useLoopStore((s) => s.cue);
  const startLoop = useLoopStore((s) => s.startLoop);
  const stopLoop = useLoopStore((s) => s.stopLoop);

  const [iterations, setIterations] = useState(3);
  const [pauseMs, setPauseMs] = useState(1000);
  const [pattern, setPattern] = useState<Vis[]>(DEFAULT_PATTERN.slice());
  const [chainNext, setChainNext] = useState(true);

  const ensurePatternLen = (n: number) => {
    setPattern((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) {
        next.push(DEFAULT_PATTERN[next.length % DEFAULT_PATTERN.length] ?? "both");
      }
      return next;
    });
  };

  const isLoopingThisCue = config.enabled && activeCue?.id === cue?.id;
  const isLoopingOther = config.enabled && activeCue?.id !== cue?.id;

  if (!cue) return null;

  return (
    <div className="flex items-center gap-1">
      {isLoopingThisCue ? (
        <Button size="sm" variant="destructive" onClick={stopLoop}>
          <Square className="h-3.5 w-3.5 mr-1.5" />
          Stop loop {config.currentIteration}/{config.maxIterations}
        </Button>
      ) : (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={isLoopingOther}
            onClick={() =>
              startLoop(cue, {
                maxIterations: iterations,
                pauseBetweenMs: pauseMs,
                visibilityPattern: pattern.slice(0, iterations),
                chainNext,
              })
            }
          >
            <Repeat className="h-3.5 w-3.5 mr-1.5" />
            Loop
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Loop settings">
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-4" align="end">
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-muted-foreground">Iterations</span>
                  <span className="font-medium">{iterations}</span>
                </div>
                <Slider
                  value={[iterations]}
                  min={1}
                  max={10}
                  step={1}
                  onValueChange={([v]) => {
                    setIterations(v);
                    ensurePatternLen(v);
                  }}
                />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-muted-foreground">Pause between</span>
                  <span className="font-medium">{pauseMs} ms</span>
                </div>
                <Slider
                  value={[pauseMs]}
                  min={0}
                  max={5000}
                  step={100}
                  onValueChange={([v]) => setPauseMs(v)}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Visibility per iteration</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {Array.from({ length: iterations }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-6 text-muted-foreground tabular-nums">#{i + 1}</span>
                      <Select
                        value={pattern[i] ?? "both"}
                        onValueChange={(val) =>
                          setPattern((prev) => {
                            const next = prev.slice();
                            while (next.length <= i) next.push("both");
                            next[i] = val as Vis;
                            return next;
                          })
                        }
                      >
                        <SelectTrigger className="h-8 flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(VIS_LABEL) as Vis[]).map((k) => (
                            <SelectItem key={k} value={k}>
                              {VIS_LABEL[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-2 py-1.5">
                <div className="flex flex-col">
                  <Label htmlFor="loop-chain" className="text-xs">
                    Continue to next cues
                  </Label>
                  <span className="text-[10px] text-muted-foreground">
                    After iterations end, jump to the next cue and keep looping.
                  </span>
                </div>
                <Switch id="loop-chain" checked={chainNext} onCheckedChange={setChainNext} />
              </div>
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  );
}
