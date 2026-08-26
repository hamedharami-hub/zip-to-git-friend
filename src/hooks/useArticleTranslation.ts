import { useCallback, useEffect, useMemo, useState } from "react";
import { batchAnalyzeChapter, extractAnalysableParagraphs } from "@/lib/batchAnalyzeChapter";
import { getCachedParagraphAnalysis } from "@/lib/bookAnalysis";
import { emitChapterAnalyses } from "@/lib/chapterAnalysisBus";
import { injectArticleImages } from "@/lib/injectArticleImages";
import { rewriteKey } from "@/lib/news";
import { markArticleTranslationsCached } from "@/lib/newsOfflineCache";
import { markSeen } from "@/lib/seenArticles";
import type { BookAIModelRef, BookChapter, RewriteLength, RewriteVoice } from "@/types";
import type { NewsArticle, NewsDigest } from "@/lib/news";
import { toast } from "sonner";

export interface UseArticleTranslationParams {
  article: NewsArticle | null;
  view: "original" | "rewrite";
  activeRewrite: RewriteLength;
  voice: RewriteVoice;
  rewrites: Record<string, NewsDigest | undefined>;
  newsModelRef: BookAIModelRef;
  autoTranslate?: boolean;
}

export interface ArticleTranslationProgress {
  done: number;
  total: number;
  failed: number;
  running: boolean;
}

export interface UseArticleTranslationReturn {
  faTtsText: string;
  ttsText: string;
  origChapter?: BookChapter;
  rwChapter?: BookChapter;
  rewriteHtmlWithImages?: string;
  activeRewriteDoc?: NewsDigest;
  runTranslate: (signal?: AbortSignal) => Promise<void>;
  progress: ArticleTranslationProgress;
}

export function useArticleTranslation({
  article,
  view,
  activeRewrite,
  voice,
  rewrites,
  newsModelRef,
  autoTranslate = true,
}: UseArticleTranslationParams): UseArticleTranslationReturn {
  const [faTtsText, setFaTtsText] = useState("");
  const [progress, setProgress] = useState<ArticleTranslationProgress>({
    done: 0,
    total: 0,
    failed: 0,
    running: false,
  });

  const articleId = article?.id;
  const articleContentHtml = article?.contentHtml;
  const articleContentMd = article?.contentMd;
  const articleExcerpt = article?.excerpt;
  const articleTitle = article?.title;
  const articleUrl = article?.url;
  const articleImageUrl = article?.imageUrl;

  const model = newsModelRef.model;
  const provider = newsModelRef.provider;
  const modelRef = useMemo(() => ({ model, provider }), [model, provider]);

  const activeKey = rewriteKey(activeRewrite, voice);
  const activeRewriteDoc = rewrites[activeKey];

  const rewriteHtmlWithImages = useMemo(() => {
    if (!activeRewriteDoc?.contentHtml) return activeRewriteDoc?.contentHtml;
    return injectArticleImages(activeRewriteDoc.contentHtml, articleContentHtml, {
      skipUrl: articleImageUrl,
    });
  }, [activeRewriteDoc?.contentHtml, articleContentHtml, articleImageUrl]);

  const activeBookId = useMemo(() => {
    if (!articleId) return "";
    return activeRewriteDoc?.contentHtml
      ? `news-rw-${articleId}-${activeRewrite}-${voice}`
      : `news-${articleId}`;
  }, [articleId, activeRewriteDoc?.contentHtml, activeRewrite, voice]);

  const activeHtml = useMemo(() => {
    return activeRewriteDoc?.contentHtml ?? articleContentHtml ?? "";
  }, [activeRewriteDoc?.contentHtml, articleContentHtml]);

  const chapter: BookChapter | undefined = useMemo(() => {
    if (!articleId || !activeHtml) return undefined;
    return {
      id: `${activeBookId}:0`,
      bookId: activeBookId,
      index: 0,
      title: activeRewriteDoc?.title || articleTitle || "",
      html: activeHtml,
      text: "",
      wordCount: 0,
    };
  }, [activeBookId, activeHtml, activeRewriteDoc?.title, articleTitle, articleId]);

  const buildFaText = useCallback(
    async (signal?: AbortSignal) => {
      if (!chapter) return;
      const items = extractAnalysableParagraphs(chapter);
      const out: string[] = [];
      for (const it of items) {
        if (signal?.aborted) return;
        const cached = await getCachedParagraphAnalysis(activeBookId, 0, it.text);
        const fa = cached?.translation?.trim();
        if (fa) out.push(fa);
      }
      if (!signal?.aborted) setFaTtsText(out.join("\n\n"));
    },
    [activeBookId, chapter],
  );

  const runTranslate = useCallback(
    async (signal?: AbortSignal) => {
      if (!chapter) return;
      const items = extractAnalysableParagraphs(chapter);
      console.log("[useArticleTranslation] translate start", {
        bookId: activeBookId,
        paragraphs: items.length,
        model: modelRef,
      });
      setProgress({ done: 0, total: items.length, failed: 0, running: items.length > 0 });

      try {
        const final = await batchAnalyzeChapter(activeBookId, chapter, {
          concurrency: 5,
          signal,
          modelRef,
          onProgress: (snap) => {
            emitChapterAnalyses(activeBookId, 0, snap.results);
            if (!signal?.aborted) {
              setProgress({
                done: snap.completed,
                total: snap.total,
                failed: snap.failed,
                running: !snap.done,
              });
            }
          },
        });
        if (signal?.aborted) return;
        emitChapterAnalyses(activeBookId, 0, final.results);
        setProgress({
          done: final.completed,
          total: final.total,
          failed: final.failed,
          running: false,
        });
        if (final.failed > 0 && final.lastError) {
          toast.error(`ترجمه برخی پاراگراف‌ها ناموفق بود: ${final.lastError}`);
        }
        await buildFaText(signal);
        if (articleId && activeBookId === `news-${articleId}` && final.failed === 0) {
          markArticleTranslationsCached(articleId);
        }
        if (articleUrl) markSeen(articleUrl);
        console.log("[useArticleTranslation] translate done", {
          completed: final.completed,
          failed: final.failed,
          total: final.total,
        });
      } catch (e) {
        if (signal?.aborted) return;
        console.error("[useArticleTranslation] translate error", e);
        toast.error(`ترجمه با خطا مواجه شد: ${e instanceof Error ? e.message : "unknown"}`);
        setProgress((p) => ({ ...p, running: false }));
        await buildFaText(signal);
      }
    },
    [activeBookId, articleId, articleUrl, buildFaText, chapter, modelRef],
  );

  useEffect(() => {
    if (!articleId || !activeHtml || !chapter) return;
    const controller = new AbortController();
    if (autoTranslate) void runTranslate(controller.signal);
    else void buildFaText(controller.signal);
    return () => {
      controller.abort();
      setProgress((p) => ({ ...p, running: false }));
    };
  }, [activeHtml, articleId, autoTranslate, buildFaText, chapter, runTranslate]);

  const origChapter: BookChapter | undefined = useMemo(() => {
    if (!articleId || !articleContentHtml) return undefined;
    return {
      id: `news-${articleId}:0`,
      bookId: `news-${articleId}`,
      index: 0,
      title: articleTitle || "",
      html: articleContentHtml,
      text: articleContentMd ?? "",
      wordCount: article?.wordCount ?? 0,
    };
  }, [articleId, articleContentHtml, articleContentMd, articleTitle, article?.wordCount]);

  const rwChapter: BookChapter | undefined = useMemo(() => {
    if (!articleId || !rewriteHtmlWithImages || !activeRewriteDoc) return undefined;
    return {
      id: `news-rw-${articleId}-${activeRewrite}-${voice}:0`,
      bookId: `news-rw-${articleId}-${activeRewrite}-${voice}`,
      index: 0,
      title: activeRewriteDoc.title || articleTitle || "",
      html: rewriteHtmlWithImages,
      text: activeRewriteDoc.contentMd,
      wordCount: activeRewriteDoc.wordCount,
    };
  }, [articleId, activeRewrite, voice, rewriteHtmlWithImages, activeRewriteDoc, articleTitle]);

  const ttsText = useMemo(() => {
    const md =
      view === "rewrite" && activeRewriteDoc ? activeRewriteDoc.contentMd : articleContentMd;
    if (!md || md === "__SCRAPE_FAILED__") return articleExcerpt ?? "";
    return md
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/^[ \t]*[#>*_`~-]+[ \t]*/gm, "")
      .replace(/[`*_~]+/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }, [view, activeRewriteDoc, articleContentMd, articleExcerpt]);

  return { faTtsText, ttsText, origChapter, rwChapter, rewriteHtmlWithImages, activeRewriteDoc };
}
