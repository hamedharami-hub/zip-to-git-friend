import { Newspaper, Loader2, Clock, RefreshCw, Folder, Globe2 } from "lucide-react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { formatTime, siteFromUrl, isRtlText } from "@/lib/newsPageHelpers";
import { useTitleTranslations } from "@/lib/newsTitleTranslations";
import { isSeen } from "@/lib/seenArticles";
import type { FeedItem, NewsFolder, NewsSource } from "@/lib/news";

type EnrichedItem = FeedItem & { _sourceName?: string };

function FeedItemCard({
  item,
  onOpen,
  titleFa,
}: {
  item: EnrichedItem;
  onOpen: (item: FeedItem) => void;
  titleFa?: string;
}) {
  const seen = isSeen(item.url);
  return (
    <li
      id={`news-item-${encodeURIComponent(item.url)}`}
      className="scroll-mt-24 rounded-xl transition-shadow"
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={
          "group block w-full text-start rounded-xl border border-border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all " +
          (seen ? "opacity-60" : "")
        }
      >
        <div className="flex gap-3">
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              className="h-20 w-20 sm:h-24 sm:w-24 rounded-lg object-cover shrink-0 bg-muted"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div className="flex-1 min-w-0">
            <h3
              dir={isRtlText(item.title) ? "rtl" : "ltr"}
              lang={isRtlText(item.title) ? "fa" : undefined}
              className={
                "font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors " +
                (isRtlText(item.title) ? "font-[Vazirmatn,system-ui,sans-serif] text-start " : "") +
                (seen ? "font-normal text-muted-foreground" : "")
              }
            >
              {seen && (
                <CheckCircle2 className="inline h-3.5 w-3.5 me-1 text-primary/70 align-text-bottom" />
              )}
              {item.title}
            </h3>
            {titleFa && (
              <p
                dir="rtl"
                lang="fa"
                className="text-sm mt-1 line-clamp-2 font-[Vazirmatn,system-ui,sans-serif] text-start text-foreground/90"
              >
                {titleFa}
              </p>
            )}
            {item.excerpt && (
              <p
                dir={isRtlText(item.excerpt) ? "rtl" : "ltr"}
                lang={isRtlText(item.excerpt) ? "fa" : undefined}
                className={
                  "text-sm text-muted-foreground mt-1 line-clamp-2 " +
                  (isRtlText(item.excerpt)
                    ? "font-[Vazirmatn,system-ui,sans-serif] text-start"
                    : "")
                }
              >
                {item.excerpt}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground flex-wrap">
              {item._sourceName && (
                <span className="inline-flex max-w-full items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-medium text-primary">
                  <Folder className="me-1 h-3 w-3 shrink-0" />
                  <span className="truncate">{item._sourceName}</span>
                </span>
              )}
              {(item.siteName || siteFromUrl(item.url)) && (
                <span className="inline-flex max-w-full items-center rounded-full border border-border/70 bg-muted/70 px-2 py-0.5 font-medium text-foreground/90">
                  <Globe2 className="me-1 h-3 w-3 shrink-0 text-primary/80" />
                  <span className="truncate">{item.siteName ?? siteFromUrl(item.url)}</span>
                </span>
              )}
              {item.publishedAt && (
                <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5">
                  <Clock className="me-1 h-3 w-3" />
                  {formatTime(item.publishedAt)}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}

export function FolderAggregatedView({
  folder,
  items,
  loading,
  onRefresh,
  onOpenItem,
  sources,
}: {
  folder: NewsFolder | null;
  items: EnrichedItem[];
  loading: boolean;
  onRefresh: () => void;
  onOpenItem: (item: FeedItem) => void;
  onPickSource: (id: string) => void;
  sources: NewsSource[];
}) {
  const titleTr = useTitleTranslations();
  if (!folder) return null;
  const sourcesInFolder = sources.filter((s) => s.folderId === folder.id);
  return (
    <>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Folder
              className="h-4 w-4 shrink-0"
              style={folder.color ? { color: folder.color } : undefined}
            />
            <h2 className="font-semibold truncate">{folder.name}</h2>
            <span className="text-[11px] text-muted-foreground">
              {sourcesInFolder.length} منبع · {items.length} خبر
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="gap-1"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            بروزرسانی همه
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="h-7 w-7" />}
          title="هنوز خبری در کش این پوشه نیست"
          description="روی «بروزرسانی همه» بزن تا تازه‌ترین اخبار همه‌ی منابع این پوشه آورده شوند."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <FeedItemCard
              key={item.url}
              item={item}
              onOpen={onOpenItem}
              titleFa={titleTr[item.url]?.titleFa}
            />
          ))}
        </ul>
      )}
    </>
  );
}

export function AllAggregatedView({
  items,
  loading,
  onRefresh,
  onOpenItem,
  sourceCount,
}: {
  items: EnrichedItem[];
  loading: boolean;
  onRefresh: () => void;
  onOpenItem: (item: FeedItem) => void;
  sourceCount: number;
}) {
  const titleTr = useTitleTranslations();
  return (
    <>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Globe2 className="h-4 w-4 text-primary shrink-0" />
            <h2 className="font-semibold truncate">همه‌ی اخبار</h2>
            <span className="text-[11px] text-muted-foreground">
              {sourceCount} منبع · {items.length} خبر
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="gap-1"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            بروزرسانی همه
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="h-7 w-7" />}
          title="هنوز خبری در کش نیست"
          description="روی «بروزرسانی همه» بزن تا تازه‌ترین اخبار همه‌ی منابع آورده شوند."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <FeedItemCard
              key={item.url}
              item={item}
              onOpen={onOpenItem}
              titleFa={titleTr[item.url]?.titleFa}
            />
          ))}
        </ul>
      )}
    </>
  );
}
