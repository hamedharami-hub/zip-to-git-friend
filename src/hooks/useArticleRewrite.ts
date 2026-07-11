/**
 * Central hook for managing AI rewrite state and side-effects for a single
 * news article. Extracted from NewsArticle.tsx so that page stays focused on
 * layout and TTS while the rewrite fetch/cache/generate/delete logic lives here.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateDigest, type NewsArticle, type NewsDigest } from "@/lib/news";
import { cacheRewrites, getCachedRewrites } from "@/lib/newsOfflineCache";
import type { AppSettings, BookAIModelRef } from "@/types";

export type RewriteLength = "long" | "max" | "auto-max" | "simple";

interface UseArticleRewriteParams {
  article: NewsArticle | null;
  modelRef: BookAIModelRef;
  settings: AppSettings;
  onViewChange?: (view: "original" | "rewrite") => void;
}

interface UseArticleRewriteReturn {
  rewrites: Record<RewriteLength, NewsDigest | undefined>;
  activeRewrite: RewriteLength;
  setActiveRewrite: (length: RewriteLength) => void;
  rewriteBusy: RewriteLength | null;
  handleRewrite: (length: RewriteLength, force?: boolean) => Promise<void>;
  deleteRewrite: (length: RewriteLength) => Promise<void>;
  loadRewrites: (article: NewsArticle) => Promise<void>;
}

export function useArticleRewrite({
  article,
  modelRef,
  settings,
  onViewChange,
}: UseArticleRewriteParams): UseArticleRewriteReturn {
  const [rewrites, setRewrites] = useState<Record<RewriteLength, NewsDigest | undefined>>(
    {} as Record<RewriteLength, NewsDigest | undefined>,
  );
  const [activeRewrite, setActiveRewriteState] = useState<RewriteLength>("auto-max");
  const [rewriteBusy, setRewriteBusy] = useState<RewriteLength | null>(null);

  const articleRef = useRef(article);
  const rewritesRef = useRef(rewrites);

  useEffect(() => {
    articleRef.current = article;
  }, [article]);

  useEffect(() => {
    rewritesRef.current = rewrites;
  }, [rewrites]);

  const setActiveRewrite = useCallback((length: RewriteLength) => {
    setActiveRewriteState(length);
  }, []);

  const loadRewrites = useCallback(async (a: NewsArticle) => {
    const cached = getCachedRewrites(a.id);
    if (cached) setRewrites(cached as Record<RewriteLength, NewsDigest | undefined>);
    try {
      const { data } = await supabase
        .from("news_digests" as never)
        .select("*")
        .eq("topic", `article:${a.id}`)
        .order("created_at", { ascending: false });
      const map = {} as Record<RewriteLength, NewsDigest | undefined>;
      for (const row of (data as Record<string, unknown>[]) ?? []) {
        const d: NewsDigest = {
          id: row.id as string,
          userId: row.user_id as string,
          sourceId: row.source_id as string | null,
          length: row.length as NewsDigest["length"],
          scope: row.scope as NewsDigest["scope"],
          topic: row.topic as string | null,
          windowHours: row.window_hours as number,
          title: row.title as string,
          contentMd: row.content_md as string,
          contentHtml: row.content_html as string,
          sourceArticles: (row.source_articles as NewsDigest["sourceArticles"]) ?? [],
          wordCount: row.word_count as number,
          model: row.model as string | null,
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
        };
        if (
          (d.length === "long" ||
            d.length === "max" ||
            d.length === "auto-max" ||
            d.length === "simple") &&
          !map[d.length as RewriteLength]
        ) {
          map[d.length as RewriteLength] = d;
        }
      }
      setRewrites(map);
      cacheRewrites(a.id, map);
    } catch {
      /* offline: keep cached */
    }
  }, []);

  const handleRewrite = useCallback(
    async (length: RewriteLength, force = false) => {
      const currentArticle = articleRef.current;
      if (!currentArticle) return;
      if (!force && rewritesRef.current[length]) {
        setActiveRewrite(length);
        onViewChange?.("rewrite");
        return;
      }
      setRewriteBusy(length);
      try {
        const body =
          currentArticle.contentMd && currentArticle.contentMd !== "__SCRAPE_FAILED__"
            ? currentArticle.contentMd
            : (currentArticle.excerpt ?? "");
        if (!body.trim()) {
          toast.error("متنی برای بازنویسی پیدا نشد.");
          return;
        }
        const digest = await generateDigest({
          articles: [
            {
              title: currentArticle.title,
              url: currentArticle.url,
              siteName: currentArticle.siteName ?? undefined,
              contentMd: body,
              publishedAt: currentArticle.publishedAt ?? undefined,
            },
          ],
          length,
          scope: "source",
          sourceId: currentArticle.sourceId,
          topic: `article:${currentArticle.id}`,
          windowHours: 24,
          model: modelRef.model,
          simplifyLevel: length === "simple" ? (settings.simplifyLevel ?? "a2-b1") : undefined,
        });
        setRewrites((m) => {
          const next = { ...m, [length]: digest };
          if (currentArticle) {
            cacheRewrites(currentArticle.id, next as Record<string, NewsDigest | undefined>);
          }
          return next;
        });
        setActiveRewrite(length);
        onViewChange?.("rewrite");
        toast.success("بازنویسی آماده شد.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "بازنویسی شکست خورد.");
      } finally {
        setRewriteBusy(null);
      }
    },
    [modelRef, settings, onViewChange, setActiveRewrite],
  );

  const deleteRewrite = useCallback(async (length: RewriteLength) => {
    const r = rewritesRef.current[length];
    const currentArticle = articleRef.current;
    if (!r) return;
    try {
      await supabase
        .from("news_digests" as never)
        .delete()
        .eq("id", r.id);
      setRewrites((m) => {
        const next = { ...m, [length]: undefined };
        if (currentArticle) {
          cacheRewrites(currentArticle.id, next as Record<string, NewsDigest | undefined>);
        }
        return next;
      });
      toast.success("حذف شد.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    }
  }, []);

  return {
    rewrites,
    activeRewrite,
    setActiveRewrite,
    rewriteBusy,
    handleRewrite,
    deleteRewrite,
    loadRewrites,
  };
}
