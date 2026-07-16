import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getArticleById,
  importUrl,
  scrapeArticle,
  upsertArticle,
  type NewsArticle,
} from "@/lib/news";
import { cacheArticle, getCachedArticle } from "@/lib/newsOfflineCache";
import { isSeen, markSeen } from "@/lib/seenArticles";

function isYoutubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /(^|\.)youtube\.com$/.test(u.hostname) || u.hostname === "youtu.be";
  } catch {
    return false;
  }
}

export interface UseArticleLoadReturn {
  article: NewsArticle | null;
  setArticle: (article: NewsArticle | null) => void;
  loading: boolean;
  scraping: boolean;
  runScrape: (article: NewsArticle, manual?: boolean) => Promise<void>;
}

export function useArticleLoad(articleId: string | undefined): UseArticleLoadReturn {
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);

  const runScrape = useCallback(async (a: NewsArticle, manual = true) => {
    setScraping(true);
    try {
      if (isYoutubeUrl(a.url)) {
        const result = await importUrl(a.url);
        if (result.kind === "article" || result.kind === "youtube") {
          const art = result.article;
          const updated = await upsertArticle({
            sourceId: a.sourceId,
            url: a.url,
            title: art.title || a.title,
            author: art.author,
            excerpt: art.excerpt,
            contentMd: art.contentMd,
            contentHtml: art.contentHtml,
            imageUrl: art.imageUrl ?? a.imageUrl,
            siteName: art.siteName ?? a.siteName,
            language: art.language,
            publishedAt: art.publishedAt ?? a.publishedAt,
            wordCount: art.wordCount,
          });
          setArticle(updated);
          cacheArticle(updated);
          return;
        }
      }
      const scraped = await scrapeArticle(a.url, {
        excerpt: a.excerpt ?? undefined,
        imageUrl: a.imageUrl ?? undefined,
        siteName: a.siteName ?? undefined,
      });
      const updated = await upsertArticle({
        sourceId: a.sourceId,
        url: scraped.finalUrl || a.url,
        title: scraped.title || a.title,
        author: scraped.author,
        excerpt: scraped.excerpt || a.excerpt,
        contentMd: scraped.contentMd,
        contentHtml: scraped.contentHtml,
        imageUrl: scraped.imageUrl ?? a.imageUrl,
        siteName: scraped.siteName ?? a.siteName,
        language: scraped.language,
        publishedAt: scraped.publishedAt ?? a.publishedAt,
        wordCount: scraped.wordCount,
      });
      setArticle(updated);
      cacheArticle(updated);
      if (scraped.blocked && manual) {
        toast.info("این منبع متن کامل را قفل کرده — خلاصه‌ی فید نمایش داده می‌شود.");
      }
    } catch (e) {
      if (manual) toast.error(e instanceof Error ? e.message : "Scrape failed.");
      try {
        const failed = await upsertArticle({
          sourceId: a.sourceId,
          url: a.url,
          title: a.title,
          excerpt: a.excerpt,
          contentMd: "__SCRAPE_FAILED__",
          contentHtml: null,
          imageUrl: a.imageUrl,
          siteName: a.siteName,
          language: a.language,
          publishedAt: a.publishedAt,
          wordCount: 0,
        });
        setArticle(failed);
      } catch {
        /* ignore */
      }
    } finally {
      setScraping(false);
    }
  }, []);

  useEffect(() => {
    if (!articleId) return;
    void (async () => {
      const cached = getCachedArticle(articleId);
      if (cached) setArticle(cached);
      try {
        const a = await getArticleById(articleId).catch(() => null);
        const useArticle = a ?? cached;
        if (useArticle) {
          if (a) {
            setArticle(a);
            cacheArticle(a);
          }
          document.title = `${useArticle.title} — News`;
          const alreadySeen = isSeen(useArticle.url);
          if (
            !useArticle.contentHtml &&
            useArticle.contentMd !== "__SCRAPE_FAILED__" &&
            navigator.onLine
          ) {
            await runScrape(useArticle, false);
          }
          if (!alreadySeen) markSeen(useArticle.url);
        }
      } catch (e) {
        if (!cached) toast.error(e instanceof Error ? e.message : "Failed to load article.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  return { article, setArticle, loading, scraping, runScrape };
}
