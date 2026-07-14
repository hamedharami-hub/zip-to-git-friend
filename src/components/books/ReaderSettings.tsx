import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Settings2, Type, AlignJustify } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reader typography preferences.
 * - serif / sans / mono / dyslexic / classic / modern → mapped to font stacks below.
 */
export type ReaderFontFamily = "serif" | "sans" | "mono" | "dyslexic" | "classic" | "modern";

// eslint-disable-next-line react-refresh/only-export-components -- non-component exports (variants/hooks/contexts)
export const FAMILY_FONT_STACKS: Record<ReaderFontFamily, string> = {
  serif:
    "'Iowan Old Style', 'Apple Garamond', 'Baskerville', 'Times New Roman', 'Droid Serif', Times, 'Source Serif Pro', serif",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  dyslexic: "'OpenDyslexic', 'Comic Sans MS', 'Verdana', sans-serif",
  classic: "'Bookerly', 'Literata', 'Georgia', 'Cambria', 'Times New Roman', serif",
  modern: "'Inter', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
};

const FAMILIES: { value: ReaderFontFamily; label: string; sample: string }[] = [
  { value: "serif", label: "Serif", sample: "Aa" },
  { value: "sans", label: "Sans", sample: "Aa" },
  { value: "classic", label: "Classic", sample: "Aa" },
  { value: "modern", label: "Modern", sample: "Aa" },
  { value: "mono", label: "Mono", sample: "Aa" },
  { value: "dyslexic", label: "Dyslexic", sample: "Aa" },
];

interface Props {
  fontScale: number;
  onFontScale: (n: number) => void;
  family: ReaderFontFamily;
  onFamily: (f: ReaderFontFamily) => void;
  lineHeight: number;
  onLineHeight: (n: number) => void;
}

export function ReaderSettings({
  fontScale,
  onFontScale,
  family,
  onFamily,
  lineHeight,
  onLineHeight,
}: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Reader settings" title="Reader settings">
          <Settings2 className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-4">
          {/* Font size */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Type className="h-3.5 w-3.5" /> Font size
              </Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.round(fontScale * 100)}%
              </span>
            </div>
            <Slider
              value={[fontScale]}
              min={0.75}
              max={2}
              step={0.05}
              onValueChange={(v) => onFontScale(v[0] ?? 1)}
            />
          </div>

          {/* Line height */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlignJustify className="h-3.5 w-3.5" /> Line height
              </Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {lineHeight.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[lineHeight]}
              min={1.2}
              max={2.4}
              step={0.05}
              onValueChange={(v) => onLineHeight(v[0] ?? 1.6)}
            />
          </div>

          {/* Typeface */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Typeface</Label>
            <div className="grid grid-cols-3 gap-2">
              {FAMILIES.map((f) => (
                <Button
                  key={f.value}
                  size="sm"
                  variant={family === f.value ? "default" : "outline"}
                  onClick={() => onFamily(f.value)}
                  className={cn("h-auto py-2 flex flex-col gap-0.5")}
                  style={{ fontFamily: FAMILY_FONT_STACKS[f.value] }}
                >
                  <span className="text-base leading-none">{f.sample}</span>
                  <span className="text-[10px] opacity-80 font-normal">{f.label}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
