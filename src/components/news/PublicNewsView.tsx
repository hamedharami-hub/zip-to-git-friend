import { Button } from "@/components/ui/button";
import { Globe2, Loader2, RefreshCw, LogIn, ArrowLeft } from "lucide-react";
import { FeedItemCard, type EnrichedItem } from "./NewsAggregatedViews";
import { useTitleTranslations } from "@/lib/newsTitleTranslations";
import { fetchTrendingHeadlines } from "@/lib/news";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PUBLIC_TOPICS, type PublicTopic } from "@/lib/newsPublicTopics";

export interface PublicNewsViewProps {
  topic: PublicTopic;
  onBack: () => void;
  onSignIn: () => void;
  onTopicChange?: (topic: PublicTopic) => void;
}

export function PublicNewsView({ topic, onBack, onSignIn, onTopicChange }: PublicNewsViewProps) {
  const titleTr = useTitleTranslations();
  const [items, setItems] = useState<EnrichedItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTrendingHeadlines({
        topic: topic.query,
        language: topic.language,
        hours: 72,
        limit: 20,
      });
      setItems(res.map((it) => ({ ...it, _sourceName: undefined })));
    } catch (e: Error | unknown) {
      toast.error((e as Error).message ?? "خطا در دریافت اخبار");
    } finally {
      setLoading(false);
    }
  }, [topic]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleOpen = (item: EnrichedItem) => {
    // For public users, opening an article requires auth.
    toast.info("برای خواندن کامل خبر وارد شوید");
    onSignIn();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> بازگشت
          </Button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Globe2 className="h-4 w-4 text-primary shrink-0" />
            <h2 className="font-semibold truncate">{topic.labelFa}</h2>
            <span className="text-[11px] text-muted-foreground">{topic.label}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} className="gap-1">
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            بروزرسانی
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {PUBLIC_TOPICS.map((t) => (
            <button
              key={t.query}
              type="button"
              onClick={() => onTopicChange?.(t)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-colors",
                t.query === topic.query
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:border-primary/50",
              )}
            >
              {t.labelFa}
            </button>
          ))}
          <Button variant="outline" size="sm" onClick={onSignIn} className="gap-1 ms-auto">
            <LogIn className="h-3.5 w-3.5" /> ورود
          </Button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <FeedItemCard
              key={item.url}
              item={item}
              onOpen={handleOpen}
              titleFa={titleTr[item.url]?.titleFa}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
