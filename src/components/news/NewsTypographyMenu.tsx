/**
 * Reader-style font controls for the News article page.
 *
 * Persists choice in localStorage and exposes the chosen Tailwind class names
 * via a callback so the parent can pass them to InteractiveBookText.
 *
 * When `showReadingMode` is true, also exposes the shared reading-mode theme
 * and extra line-height controls from useReadingMode.
 */
import { memo, useEffect, useState } from "react";
import { AlignJustify, Palette, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useReadingMode, type EyeComfortPreset } from "@/hooks/useReadingMode";

const SIZE_KEY = "news-font-size";
const FAMILY_KEY = "news-font-family";

export type NewsFontSize = "sm" | "base" | "lg" | "xl" | "2xl";
export type NewsFontFamily = "sans" | "serif" | "vazir" | "mono";

/**
 * Use arbitrary font-size classes so the article text can inherit its
 * line-height from the reading container (and from reading-mode presets).
 */
const SIZE_CLASS: Record<NewsFontSize, string> = {
  sm: "text-[0.875rem]",
  base: "text-[1rem]",
  lg: "text-[1.125rem]",
  xl: "text-[1.25rem]",
  "2xl": "text-[1.5rem]",
};

const FAMILY_CLASS: Record<NewsFontFamily, string> = {
  sans: "font-sans",
  serif: "font-serif",
  vazir: "", // applied via inline style below
  mono: "font-mono",
};

const FAMILY_STYLE: Partial<Record<NewsFontFamily, React.CSSProperties>> = {
  vazir: { fontFamily: '"Vazirmatn","IRANSans","Tahoma",sans-serif' },
};

const PRESETS: { id: EyeComfortPreset; label: string }[] = [
  { id: "off", label: "بدون تغییر" },
  { id: "comfort", label: "☀ راحت" },
  { id: "sepia", label: "📜 سپیا" },
  { id: "night", label: "🌙 شب" },
  { id: "contrast", label: "⬛ کنتراست" },
];

interface Props {
  onChange: (cls: {
    sizeClass: string;
    familyClass: string;
    familyStyle?: React.CSSProperties;
  }) => void;
  showReadingMode?: boolean;
}

export const NewsTypographyMenu = memo(function NewsTypographyMenu({
  onChange,
  showReadingMode = false,
}: Props) {
  const [size, setSize] = useState<NewsFontSize>(() => {
    try {
      return (localStorage.getItem(SIZE_KEY) as NewsFontSize) || "base";
    } catch {
      return "base";
    }
  });
  const [family, setFamily] = useState<NewsFontFamily>(() => {
    try {
      return (localStorage.getItem(FAMILY_KEY) as NewsFontFamily) || "sans";
    } catch {
      return "sans";
    }
  });

  const { eyeComfortPreset, extraLineHeight, set } = useReadingMode();

  useEffect(() => {
    try {
      localStorage.setItem(SIZE_KEY, size);
    } catch {
      /* */
    }
    try {
      localStorage.setItem(FAMILY_KEY, family);
    } catch {
      /* */
    }
    onChange({
      sizeClass: SIZE_CLASS[size],
      familyClass: FAMILY_CLASS[family],
      familyStyle: FAMILY_STYLE[family],
    });
  }, [size, family, onChange]);

  // External pinch-zoom: cycle the size up/down on `news-font-step` CustomEvent.
  useEffect(() => {
    const order: NewsFontSize[] = ["sm", "base", "lg", "xl", "2xl"];
    const handler = (e: Event) => {
      const delta = (e as CustomEvent<{ delta: number }>).detail?.delta ?? 0;
      if (!delta) return;
      setSize((cur) => {
        const i = order.indexOf(cur);
        const next = Math.max(0, Math.min(order.length - 1, i + (delta > 0 ? 1 : -1)));
        return order[next];
      });
    };
    window.addEventListener("news-font-step", handler);
    return () => window.removeEventListener("news-font-step", handler);
  }, []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="فونت و اندازه" title="فونت و اندازه">
          <Type className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <div>
          <p className="text-xs font-medium mb-2 text-muted-foreground">اندازه فونت</p>
          <div className="grid grid-cols-5 gap-1">
            {(["sm", "base", "lg", "xl", "2xl"] as NewsFontSize[]).map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={
                  "rounded-md border py-1.5 text-xs transition-colors " +
                  (size === s
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground")
                }
              >
                A
                <span className="text-[10px] ms-0.5 opacity-70">
                  {s === "sm" ? "sm" : s === "base" ? "md" : s}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium mb-2 text-muted-foreground">نوع فونت</p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: "sans" as const, label: "Sans (پیش‌فرض)" },
              { id: "serif" as const, label: "Serif" },
              { id: "vazir" as const, label: "Vazir (فارسی)" },
              { id: "mono" as const, label: "Mono" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFamily(f.id)}
                className={
                  "rounded-md border px-2 py-1.5 text-xs transition-colors text-start " +
                  (family === f.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground")
                }
                style={
                  f.id === "vazir"
                    ? { fontFamily: '"Vazirmatn","IRANSans","Tahoma",sans-serif' }
                    : undefined
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {showReadingMode && (
          <>
            <div>
              <p className="text-xs font-medium mb-2 text-muted-foreground flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5" /> تم مطالعه
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => set({ eyeComfortPreset: p.id })}
                    className={
                      "rounded-md border px-2 py-1.5 text-xs transition-colors text-start " +
                      (eyeComfortPreset === p.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground")
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <AlignJustify className="h-3.5 w-3.5" /> فاصله خطوط
                </Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  +{extraLineHeight.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[extraLineHeight]}
                min={0}
                max={0.6}
                step={0.05}
                onValueChange={([v]) => set({ extraLineHeight: v })}
              />
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
});
