import { useState } from "react";
import { ChevronDown, Plus, Rss } from "lucide-react";
import { CURATED_CATEGORIES, type CuratedFeed } from "@/lib/newsPublicTopics";
import { cn } from "@/lib/utils";

interface CuratedFeedsProps {
  onPick: (feed: CuratedFeed) => void;
}

export function CuratedFeeds({ onPick }: CuratedFeedsProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Rss className="h-3.5 w-3.5 text-primary" />
        فیدهای پیشنهادی بر اساس موضوع
      </div>
      <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-card p-1.5 space-y-1">
        {CURATED_CATEGORIES.map((cat) => {
          const isOpen = open[cat.category] ?? false;
          return (
            <div
              key={cat.category}
              className="rounded-md border border-transparent hover:border-border"
            >
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [cat.category]: !o[cat.category] }))}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                <span>
                  {cat.categoryFa}{" "}
                  <span className="text-[10px] text-muted-foreground">({cat.category})</span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              {isOpen && (
                <ul className="space-y-0.5 px-2 pb-1.5">
                  {cat.feeds.map((feed) => (
                    <li key={feed.url}>
                      <button
                        type="button"
                        onClick={() => onPick(feed)}
                        className="flex w-full items-center justify-between rounded px-2 py-1 text-xs hover:bg-accent transition-colors text-start"
                        title={feed.url}
                      >
                        <span className="truncate flex-1" dir="ltr">
                          {feed.name}
                        </span>
                        <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
