import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { List, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookChapter } from "@/types";

interface Props {
  chapters: BookChapter[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export function ChapterTOC({ chapters, currentIndex, onSelect }: Props) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Table of contents"
          title="Table of contents"
        >
          <List className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] sm:max-w-md p-0">
        <SheetHeader className="px-6 pt-6 pb-3 border-b border-border">
          <SheetTitle>Table of contents</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-5rem)]">
          <ul className="py-2">
            {chapters.map((c) => {
              const active = c.index === currentIndex;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.index)}
                    className={cn(
                      "w-full text-left px-6 py-2.5 text-sm flex items-start gap-3 hover:bg-accent/60 transition-colors",
                      active && "bg-accent text-accent-foreground font-medium",
                    )}
                  >
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-6 pt-0.5">
                      {c.index + 1}
                    </span>
                    <span className="flex-1 line-clamp-2">{c.title}</span>
                    {active && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
