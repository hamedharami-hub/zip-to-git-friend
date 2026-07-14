import { memo, useCallback } from "react";
import { Clock, Globe2, CheckCircle2, Loader2, Square, CheckSquare, Download } from "lucide-react";
import { isRtlText, siteFromUrl, formatTime } from "@/lib/newsPageHelpers";
import type { FeedItem } from "@/lib/news";

interface NewsArticleCardProps {
  item: FeedItem;
  titleFa?: string;
  isSeen: boolean;
  isCached: boolean;
  selectMode: boolean;
  isSelected: boolean;
  isOpening: boolean;
  onOpen: (item: FeedItem) => void;
}

export const NewsArticleCard = memo(function NewsArticleCard({
  item,
  titleFa,
  isSeen,
  isCached,
  selectMode,
  isSelected,
  isOpening,
  onOpen,
}: NewsArticleCardProps) {
  const handleClick = useCallback(() => onOpen(item), [item, onOpen]);
  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = "none";
  }, []);

  const titleIsRtl = isRtlText(item.title);
  const excerptIsRtl = item.excerpt ? isRtlText(item.excerpt) : false;

  return (
    <li
      id={`news-item-${encodeURIComponent(item.url)}`}
      className="scroll-mt-24 rounded-xl transition-shadow"
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={isOpening}
        className={
          "group block w-full text-start rounded-xl border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all " +
          (isSelected ? "border-primary ring-2 ring-primary/30 " : "border-border ") +
          (isSeen ? "opacity-60" : "")
        }
      >
        <div className="flex gap-3">
          {selectMode && (
            <div className="shrink-0 self-start mt-1" aria-hidden>
              {isSelected ? (
                <CheckSquare className="h-5 w-5 text-primary" />
              ) : (
                <Square className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          )}
          {isCached && !selectMode && (
            <div className="shrink-0 self-start mt-1" title="برای حالت آفلاین ذخیره شده">
              <Download className="h-3.5 w-3.5 text-primary" />
            </div>
          )}
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              className="h-20 w-20 sm:h-24 sm:w-24 rounded-lg object-cover shrink-0 bg-muted"
              onError={handleImageError}
            />
          )}
          <div className="flex-1 min-w-0">
            <h3
              dir={titleIsRtl ? "rtl" : "ltr"}
              lang={titleIsRtl ? "fa" : undefined}
              className={
                "font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors " +
                (titleIsRtl ? "font-[Vazirmatn,system-ui,sans-serif] text-start " : "") +
                (isSeen ? "font-normal text-muted-foreground" : "")
              }
            >
              {isSeen && (
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
                dir={excerptIsRtl ? "rtl" : "ltr"}
                lang={excerptIsRtl ? "fa" : undefined}
                className={
                  "text-sm text-muted-foreground mt-1 line-clamp-2 " +
                  (excerptIsRtl ? "font-[Vazirmatn,system-ui,sans-serif] text-start" : "")
                }
              >
                {item.excerpt}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground flex-wrap">
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
              {isOpening && <Loader2 className="h-3 w-3 animate-spin ms-auto" />}
            </div>
          </div>
        </div>
      </button>
    </li>
  );
});
