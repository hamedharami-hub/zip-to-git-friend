/**
 * Central hook for managing AI rewrite state and side-effects for a single
 * news article. Extracted from NewsArticle.tsx so that page stays focused on
 * layout and TTS while the rewrite fetch/cache/generate/delete logic lives here.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  generateDigest,
  rowToDigest,
  rewriteKey,
  type NewsArticle,
  type NewsDigest,
} from "@/lib/news";
import { cacheRewrites, getCachedRewrites } from "@/lib/newsOfflineCache";
import type { AppSettings, BookAIModelRef, RewriteLength, RewriteVoice } from "@/types";

interface UseArticleRewriteParams {
  article: NewsArticle | null;
  modelRef: BookAIModelRef;
  settings: AppSettings;
  onViewChange?: (view: "original" | "rewrite") => void;
}

interface UseArticleRewriteReturn {
  rewrites: Record<string, NewsDigest | undefined>;
  activeRewrite: RewriteLength;
  setActiveRewrite: (length: RewriteLength) => void;
  voice: RewriteVoice;
  setVoice: (voice: RewriteVoice) => void;
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
  const [rewrites, setRewrites] = useState<Record<string, NewsDigest | undefined>>({});
  const [activeRewrite, setActiveRewriteState] = useState<RewriteLength>("long");
  const [voice, setVoiceState] = useState<RewriteVoice>(
    settings.defaultRewriteVoice ?? "storyteller",
  );
  const [rewriteBusy, setRewriteBusy] = useState<RewriteLength | null>(null);

  const articleRef = useRef(article);
  const rewritesRef = useRef(rewrites);
  const voiceRef = useRef(voice);

  useEffect(() => {
    articleRef.current = article;
  }, [article]);

  useEffect(() => {
    rewritesRef.current = rewrites;
  }, [rewrites]);

  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  const setActiveRewrite = useCallback((length: RewriteLength) => {
    setActiveRewriteState(length);
  }, []);

  const setVoice = useCallback((v: RewriteVoice) => {
    setVoiceState(v);
  }, []);

  const loadRewrites = useCallback(async (a: NewsArticle) => {
    const cached = getCachedRewrites(a.id);
    if (cached) setRewrites((prev) => ({ ...prev, ...cached }));
    try {
      const { data } = await supabase
        .from("news_digests" as never)
        .select("*")
        .eq("topic", `article:${a.id}`)
        .order("created_at", { ascending: false });
      const map: Record<string, NewsDigest | undefined> = {};
      for (const row of (data as Record<string, unknown>[]) ?? []) {
        const d = rowToDigest(row);
        if (
          d.length === "long" ||
          d.length === "max" ||
          d.length === "auto-max" ||
          d.length === "simple"
        ) {
          map[rewriteKey(d.length, d.voice)] = d;
        }
      }
      setRewrites((prev) => ({ ...prev, ...map }));
      cacheRewrites(a.id, { ...cached, ...map });
    } catch {
      /* offline: keep cached */
    }
  }, []);

  const handleRewrite = useCallback(
    async (length: RewriteLength, force = false) => {
      const currentArticle = articleRef.current;
      if (!currentArticle) return;
      const key = rewriteKey(length, voiceRef.current);
      if (!force && rewritesRef.current[key]) {
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
          voice: voiceRef.current,
        });
        setRewrites((m) => {
          const next = { ...m, [key]: digest };
          if (currentArticle) {
            cacheRewrites(currentArticle.id, next);
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
    const key = rewriteKey(length, voiceRef.current);
    const r = rewritesRef.current[key];
    const currentArticle = articleRef.current;
    if (!r) return;
    try {
      if (!r.id.startsWith("local-")) {
        await supabase
          .from("news_digests" as never)
          .delete()
          .eq("id", r.id);
      }
      setRewrites((m) => {
        const next = { ...m, [key]: undefined };
        if (currentArticle) {
          cacheRewrites(currentArticle.id, next);
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
    voice,
    setVoice,
    rewriteBusy,
    handleRewrite,
    deleteRewrite,
    loadRewrites,
  };
}
