import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useSentenceFlagStore } from "@/store/sentenceFlagStore";
import { FLAG_COLORS, FLAG_COLOR_META, type FlagColor } from "@/lib/sentenceFlags";
import { cn } from "@/lib/utils";

interface Props {
  sentenceId: string;
  size?: "sm" | "md";
  className?: string;
}

export function FlagButton({ sentenceId, size = "md", className }: Props) {
  const flag = useSentenceFlagStore((s) => s.flags[sentenceId]);
  const setFlag = useSentenceFlagStore((s) => s.setFlag);
  const clearFlag = useSentenceFlagStore((s) => s.clearFlag);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(flag?.label ?? "");

  const dim = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const activeColor = flag ? FLAG_COLOR_META[flag.color].hex : undefined;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setLabel(flag?.label ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(dim, className)}
          aria-label="Flag sentence"
          title={flag ? `پرچم: ${flag.label || FLAG_COLOR_META[flag.color].label}` : "افزودن پرچم"}
        >
          <Flag
            className={icon}
            style={activeColor ? { color: activeColor, fill: activeColor } : undefined}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-3" align="end">
        <div>
          <p className="mb-2 text-xs font-medium">رنگ پرچم</p>
          <div className="grid grid-cols-4 gap-2">
            {FLAG_COLORS.map((c) => {
              const meta = FLAG_COLOR_META[c];
              const active = flag?.color === c;
              return (
                <button
                  key={c}
                  onClick={() => {
                    void setFlag(sentenceId, c, label || null);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border p-2 transition-colors hover:bg-muted",
                    active && "border-primary ring-2 ring-primary/30",
                  )}
                  title={meta.label}
                >
                  <span className={cn("h-5 w-5 rounded-full", meta.bg)} />
                  <span className="text-[9px] text-muted-foreground">{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium">برچسب دلخواه (اختیاری)</p>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => {
              if (flag && (label || "") !== (flag.label || "")) {
                void setFlag(sentenceId, flag.color, label || null);
              }
            }}
            placeholder="مثلا: گرامر سخت"
            className="h-8 text-xs"
            dir="rtl"
          />
        </div>
        {flag && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-destructive"
            onClick={() => {
              void clearFlag(sentenceId);
              setOpen(false);
            }}
          >
            حذف پرچم
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
