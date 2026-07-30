import { useState } from "react";
import { useShallow } from "zustand/shallow";
import { useNavigate } from "react-router-dom";
import { Loader2, Newspaper, Sparkles, ExternalLink, Network, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  searchNews,
  importUrl,
  upsertArticle,
  compareRelatedArticles,
  type FeedItem,
  type NewsArticle,
  type CompareResult,
} from "@/lib/news";
import { useSettingsStore } from "@/store/settingsStore";
import { coerceBookModel } from "@/lib/aiModels";
import { toast } from "sonner";

interface RelatedNewsProps {
  article: NewsArticle;
}

/** End-of-article panel: AI-powered related coverage + comparison. */
export function RelatedNews({ article }: RelatedNewsProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [openingUrl, setOpeningUrl] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compare, setCompare] = useState<CompareResult | null>(null);

  const { paragraphBatchModelRef, bookBatchAnalysisModelRef, newsRewriteModelRef } =
    useSettingsStore(
      useShallow((s) => ({
        paragraphBatchModelRef: s.settings.paragraphBatchModelRef,
        bookBatchAnalysisModelRef: s.settings.bookBatchAnalysisModelRef,
        newsRewriteModelRef: s.settings.newsRewriteModelRef,
      })),
    );
  const modelRef = coerceBookModel(
    paragraphBatchModelRef ??
      bookBatchAnalysisModelRef ??
      newsRewriteModelRef ??
      "google/gemini-3-flash-preview",
  );

  const ownDomain = (() => {
    try {
      return new URL(article.url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();

  const fetchRelated = async () => {
    setLoading(true);
    setCompare(null);
    try {
      // Use title as RAG query; cap to 10, last week.
      const raw = await searchNews({
        query: article.title,
        hours: 168,
        limit: 12,
      });
      // Filter out the same article (same URL) and same-domain near-duplicates by title.
      const seen = new Set<string>([article.url]);
      const filtered = raw
        .filter((it) => {
          if (!it.url || seen.has(it.url)) return false;
          seen.add(it.url);
          if (ownDomain && it.url.includes(ownDomain) && it.title.trim() === article.title.trim()) {
            return false;
          }
          return true;
        })
        .slice(0, 10);
      setItems(filtered);
      if (filtered.length === 0) {
        toast.info("چیزی پیدا نشد. شاید موضوع خیلی تازه یا خاص است.");
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
    } catch (e: any) {
      toast.error(e?.message ?? "جستجوی اخبار مرتبط شکست خورد.");
    } finally {
      setLoading(false);
    }
  };

  const openItem = async (it: FeedItem) => {
    setOpeningUrl(it.url);
    try {
      const result = await importUrl(it.url);
      if (result.kind !== "article" && result.kind !== "youtube") {
        toast.error("این لینک به صورت مقاله قابل باز کردن نیست.");
        return;
      }
      const a = result.article;
      const saved = await upsertArticle({
        sourceId: null,
        url: it.url,
        title: a.title || it.title,
        author: a.author,
        excerpt: a.excerpt ?? it.excerpt ?? null,
        contentMd: a.contentMd,
        contentHtml: a.contentHtml,
        imageUrl: a.imageUrl ?? it.imageUrl ?? null,
        siteName: a.siteName ?? it.siteName ?? null,
        language: a.language,
        publishedAt: a.publishedAt ?? it.publishedAt ?? null,
        wordCount: a.wordCount,
      });
      navigate(`/news/article/${saved.id}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
    } catch (e: any) {
      toast.error(e?.message ?? "باز کردن این خبر شکست خورد.");
    } finally {
      setOpeningUrl(null);
    }
  };

  const runCompare = async () => {
    if (!items || items.length === 0) return;
    setComparing(true);
    try {
      const result = await compareRelatedArticles({
        main: {
          title: article.title,
          siteName: article.siteName,
          contentMd: article.contentMd,
          excerpt: article.excerpt,
        },
        related: items.map((it) => ({
          title: it.title,
          url: it.url,
          siteName: it.siteName ?? null,
          excerpt: it.excerpt ?? null,
        })),
        model: modelRef.model,
      });
      setCompare(result);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
    } catch (e: any) {
      toast.error(e?.message ?? "مقایسه شکست خورد.");
    } finally {
      setComparing(false);
    }
  };

  return (
    <section className="mt-12 pt-8 border-t border-border/50">
      <header className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold">اخبار مرتبط</h3>
        </div>
        {items && items.length > 0 && (
          <span className="text-[11px] text-muted-foreground">{items.length} نتیجه</span>
        )}
      </header>

      {!items ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            هوش مصنوعی بین ۴ تا ۱۰ خبر مرتبط از منابع دیگر پیدا می‌کند. می‌توانی هرکدام را باز کنی
            یا خلاصه‌ی تفاوت‌هایشان را بگیری.
          </p>
          <Button onClick={fetchRelated} disabled={loading} size="sm" className="gap-1.5">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {loading ? "در حال جستجو…" : "پیدا کن"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={fetchRelated} disabled={loading} size="sm" variant="outline">
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              بازجستجو
            </Button>
            {items.length > 0 && (
              <Button onClick={runCompare} disabled={comparing} size="sm" className="gap-1.5">
                {comparing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {comparing ? "در حال تحلیل…" : "خلاصه تفاوت‌ها"}
              </Button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Newspaper className="h-6 w-6 mx-auto mb-2 opacity-60" />
              نتیجه‌ای پیدا نشد.
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {items.map((it) => {
                const isOpening = openingUrl === it.url;
                return (
                  <li
                    key={it.url}
                    className="group rounded-lg border border-border bg-card/40 overflow-hidden hover:border-primary/40 transition-colors"
                  >
                    <button
                      type="button"
                      disabled={!!openingUrl}
                      onClick={() => openItem(it)}
                      className="w-full text-start flex gap-3 p-3 disabled:opacity-60"
                    >
                      {it.imageUrl ? (
                        <img
                          src={it.imageUrl}
                          alt=""
                          loading="lazy"
                          className="w-20 h-20 rounded-md object-cover shrink-0 bg-muted"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-md bg-muted/60 shrink-0 flex items-center justify-center">
                          <Newspaper className="h-5 w-5 text-muted-foreground/60" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                          {it.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1 truncate">
                          {it.siteName ?? new URL(it.url).hostname.replace(/^www\./, "")}
                          {it.publishedAt
                            ? ` · ${new Date(it.publishedAt).toLocaleDateString("fa-IR")}`
                            : ""}
                        </p>
                        {it.excerpt && (
                          <p className="text-[11px] text-muted-foreground/80 mt-1 line-clamp-2">
                            {it.excerpt}
                          </p>
                        )}
                        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                          {isOpening ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" /> در حال آماده‌سازی…
                            </>
                          ) : (
                            <>
                              باز کن <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block px-3 pb-2 text-[10px] text-muted-foreground/70 hover:text-foreground inline-flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" /> منبع اصلی
                    </a>
                  </li>
                );
              })}
            </ul>
          )}

          {compare && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 sm:p-6 mt-4">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/50">
                <Sparkles className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold">{compare.title}</h4>
                <span className="ms-auto text-[10px] text-muted-foreground">{compare.model}</span>
              </div>
              <div
                dir="rtl"
                className="prose prose-sm dark:prose-invert max-w-none text-sm leading-7"
                dangerouslySetInnerHTML={{ __html: compare.contentHtml }}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
