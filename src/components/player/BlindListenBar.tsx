import { Eye, ChevronRight, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  enabled: boolean;
  revealed: boolean;
  onReveal: () => void;
  onNext: () => void;
  variant?: "panel" | "overlay";
}

/**
 * Compact action bar shown when "blind listen" mode is on.
 * Lets the user reveal the current sentence and/or jump to the next one.
 */
export function BlindListenBar({ enabled, revealed, onReveal, onNext, variant = "panel" }: Props) {
  if (!enabled) return null;
  const dark = variant === "overlay";
  return (
    <div
      className={`flex items-center justify-center gap-2 ${
        dark ? "text-white/90" : "text-foreground"
      }`}
    >
      <span
        className={`inline-flex items-center gap-1 text-xs ${
          dark ? "text-white/60" : "text-muted-foreground"
        }`}
      >
        <EyeOff className="h-3 w-3" />
        Blind listen
      </span>
      <Button
        size="sm"
        variant={dark ? "secondary" : "outline"}
        onClick={onReveal}
        disabled={revealed}
        className="h-8"
      >
        <Eye className="h-3.5 w-3.5 mr-1.5" />
        {revealed ? "Revealed" : "Reveal"}
      </Button>
      <Button size="sm" onClick={onNext} className="h-8">
        Next
        <ChevronRight className="h-3.5 w-3.5 ml-1" />
      </Button>
    </div>
  );
}
