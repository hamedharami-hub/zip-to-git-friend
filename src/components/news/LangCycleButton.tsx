/**
 * Tiny three-state cycle button for the news/book reader.
 * Cycles: EN → EN+FA → FA → EN …
 * Replaces the wider tab group in the header.
 */
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DisplayLang } from "@/components/books/TranslateChapterButton";
import { cn } from "@/lib/utils";

const ORDER: DisplayLang[] = ["en", "both", "fa"];
const LABEL: Record<DisplayLang, string> = { en: "EN", both: "EN+FA", fa: "FA" };

export function LangCycleButton({
  value,
  onChange,
  hasAnyTranslation,
}: {
  value: DisplayLang;
  onChange: (v: DisplayLang) => void;
  hasAnyTranslation: boolean;
}) {
  const next = () => {
    const i = ORDER.indexOf(value);
    onChange(ORDER[(i + 1) % ORDER.length]);
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={next}
      className={cn(
        "h-7 px-2 gap-1 text-[10px] font-semibold rounded-md",
        hasAnyTranslation ? "text-foreground" : "text-muted-foreground/80",
      )}
      title="تغییر زبان نمایش"
      aria-label={`زبان نمایش: ${LABEL[value]}`}
    >
      <Languages className="h-3 w-3" />
      {LABEL[value]}
    </Button>
  );
}
