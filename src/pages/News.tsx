import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  RETURN_KEY,
  WINDOW_OPTIONS,
  siteFromUrl,
  isBlockedUrl,
  type ReturnState,
} from "@/lib/newsPageHelpers";
import {
  Newspaper,
  Plus,
  Rss,
  Globe2,
  Search,
  Trash2,
  Loader2,
  Sparkles,
  Clock,
  RefreshCw,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Folder,
  Ban,
  Bookmark,
  BookmarkCheck,
  X,
} from "lucide-react";
import { NewsArticleCard } from "@/components/news/NewsArticleCard";
import { NewsHeader } from "@/components/news/NewsHeader";
import { NewsSidebar } from "@/components/news/NewsSidebar";
import { NewsFeed } from "@/components/news/NewsFeed";
import { prefetchManyForOffline, isUrlCached, getCachedIdForUrl } from "@/lib/newsOfflineCache";
import {
  useTitleTranslations,
  translateTitlesBatch,
  type TranslatableItem,
} from "@/lib/newsTitleTranslations";
import { FolderAggregatedView, AllAggregatedView } from "@/components/news/NewsAggregatedViews";
import { ManageNewsDialog } from "@/components/news/ManageNewsDialog";
import { NewsOnboarding } from "@/components/news/NewsOnboarding";
import { SAMPLE_SOURCES, type PublicTopic } from "@/lib/newsPublicTopics";
import { PublicNewsView } from "@/components/news/PublicNewsView";
import { loadCachedFeed, mergeIntoCache } from "@/lib/newsFeedCache";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  addSource,
  deleteSource,
  updateSource,
  discoverRss,
  fetchRss,
  fetchTrendingHeadlines,
  generateDigest,
  getCachedDiscovery,
  listDigests,
  listSavedArticles,
  listSources,
  searchNews,
  setArticleSaved,
  upsertArticle,
  listFolders,
  createFolder,
  deleteFolder,
  updateFolder,
  listBlockedDomains,
  blockDomain,
  unblockDomain,
  normalizeVoice,
  type DiscoveryResult,
  type DiscoveredSite,
  type FeedItem,
  type NewsArticle,
  type NewsDigest,
  type NewsSource,
  type NewsSourceKind,
  type NewsFolder,
  type BlockedDomain,
} from "@/lib/news";
import type { RewriteVoice } from "@/types";
import { useSettingsStore } from "@/store/settingsStore";
import { coerceBookModel } from "@/lib/aiModels";
import { useLongPress } from "@/hooks/useLongPress";
import { isSeen, markSeen, subscribeSeen } from "@/lib/seenArticles";
import { CheckCircle2 } from "lucide-react";

const News = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const newsRewriteModelRef = useSettingsStore((s) => s.settings.newsRewriteModelRef);
  const bookRewriteModelRef = useSettingsStore((s) => s.settings.bookRewriteModelRef);
  const newsSearchModelRef = useSettingsStore((s) => s.settings.newsSearchModelRef);
  const defaultRewriteVoice = useSettingsStore((s) => s.settings.defaultRewriteVoice);
  const update = useSettingsStore((s) => s.update);
  const newsModelRef = coerceBookModel(
    newsRewriteModelRef ?? bookRewriteModelRef ?? "google/gemini-3-flash-preview",
  );

  const [sources, setSources] = useState<NewsSource[]>([]);
  const [folders, setFolders] = useState<NewsFolder[]>([]);
  const [blocked, setBlocked] = useState<BlockedDomain[]>([]);
  const blockedDomains = useMemo(() => blocked.map((b) => b.domain), [blocked]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [manageOpen, setManageOpen] = useState(false);
  const [digests, setDigests] = useState<NewsDigest[]>([]);
  const [savedArticles, setSavedArticles] = useState<NewsArticle[]>([]);
  // Hydrate active source/folder from the last "back from article" return.
  const initialReturn = useMemo<ReturnState | null>(() => {
    try {
      const raw = sessionStorage.getItem(RETURN_KEY);
      return raw ? (JSON.parse(raw) as ReturnState) : null;
    } catch {
      return null;
    }
  }, []);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(
    initialReturn?.sourceId ?? null,
  );
  const [activeFolderId, setActiveFolderId] = useState<string | null>(
    initialReturn?.folderId ?? null,
  );
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [folderFeed, setFolderFeed] = useState<Array<FeedItem & { _sourceName?: string }>>([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [allMode, setAllMode] = useState(initialReturn?.allMode ?? false);
  const [allFeed, setAllFeed] = useState<Array<FeedItem & { _sourceName?: string }>>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [windowHours, setWindowHours] = useState<string>("24");
  const [digestLength, setDigestLength] = useState<"long" | "max">("long");
  const [digestBusy, setDigestBusy] = useState(false);
  const [openArticle, setOpenArticle] = useState<string | null>(null);
  const [trendingBusy, setTrendingBusy] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [publicTopic, setPublicTopic] = useState<PublicTopic | null>(null);
  const [addSourceOpen, setAddSourceOpen] = useState(false);

  const handleChannelAdded = useCallback(
    (s: NewsSource) => {
      setSources((prev) => [...prev, s]);
      setActiveSourceId(s.id);
    },
    [setSources, setActiveSourceId],
  );

  const handleSourceAdded = useCallback(
    (s: NewsSource) => {
      setSources((prev) => [...prev, s]);
      setActiveSourceId(s.id);
    },
    [setSources, setActiveSourceId],
  );

  // Re-render tick when the seen-articles set changes (cross-tab too).
  const [, setSeenTick] = useState(0);
  useEffect(() => subscribeSeen(() => setSeenTick((n) => n + 1)), []);
  // Persian title translations (per-URL, persisted in localStorage).
  const titleTr = useTitleTranslations();
  const [trBusy, setTrBusy] = useState(false);
  const [trProgress, setTrProgress] = useState<{ done: number; total: number } | null>(null);
  // Offline prefetch (download articles for offline reading).
  const [dlBusy, setDlBusy] = useState(false);
  const [dlProgress, setDlProgress] = useState<{
    done: number;
    total: number;
    failed: number;
    current?: string;
  } | null>(null);
  const dlAbortRef = useRef<AbortController | null>(null);
  // Multi-select mode for choosing specific articles to prefetch.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  // Re-render whenever the offline cache changes so badges refresh.
  const [, setOfflineTick] = useState(0);
  const bumpOffline = useCallback(() => setOfflineTick((n) => n + 1), []);
  // After a back-navigation, scroll the previously opened headline into view once.
  const pendingScrollRef = useRef<ReturnState | null>(initialReturn);

  // If we arrived from /share?import_url=…, open the importer prefilled.
  const sharedUrl = params.get("import_url");

  const handleClearSharedUrl = useCallback(() => {
    if (!sharedUrl) return;
    const next = new URLSearchParams(params);
    next.delete("import_url");
    setParams(next, { replace: true });
  }, [params, setParams, sharedUrl]);

  usePageMeta({
    title: "News reader — Language learning",
    description:
      "خواندن، ترجمه و خلاصه‌سازی خبر با هوش مصنوعی — فیدهای RSS، جستجو موضوعی و حالت آفلاین.",
  });

  useEffect(() => {
    if (sharedUrl) {
      toast.success("لینک از اپ دیگه دریافت شد — در حال آماده‌سازی…");
    }
  }, [sharedUrl]);

  const refreshSavedArticles = useCallback(async () => {
    try {
      const a = await listSavedArticles();
      setSavedArticles(a);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const [s, d, f, b] = await Promise.all([
          listSources(),
          listDigests(),
          listFolders(),
          listBlockedDomains(),
        ]);
        setSources(s);
        setDigests(d);
        setFolders(f);
        setBlocked(b);
        // Re-apply pending return state once data is loaded, so the same
        // source/folder is restored even if the user navigated back before
        // the lists were in memory.
        const ret = initialReturn;
        if (ret?.allMode) {
          setAllMode(true);
          setActiveSourceId(null);
          setActiveFolderId(null);
        } else if (ret?.folderId && f.some((x) => x.id === ret.folderId)) {
          setActiveFolderId(ret.folderId);
          setActiveSourceId(null);
          setAllMode(false);
        } else if (ret?.sourceId && s.some((x) => x.id === ret.sourceId)) {
          setActiveSourceId(ret.sourceId);
          setActiveFolderId(null);
          setAllMode(false);
        } else if (s.length && !activeSourceId && !activeFolderId && !allMode) {
          setActiveSourceId(s[0].id);
        }
        void refreshSavedArticles();
      } catch (e: Error | unknown) {
        toast.error((e as Error).message ?? "Failed to load news.");
      }
    })();
  }, [user, activeSourceId, activeFolderId, allMode, initialReturn, refreshSavedArticles]);

  const refreshFolders = useCallback(async () => {
    const [f, s] = await Promise.all([listFolders(), listSources()]);
    setFolders(f);
    setSources(s);
  }, []);
  const refreshBlocked = useCallback(async () => {
    setBlocked(await listBlockedDomains());
  }, []);

  const sourcesByFolder = useMemo(() => {
    const map = new Map<string | null, NewsSource[]>();
    for (const s of sources) {
      const k = s.folderId ?? null;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return map;
  }, [sources]);

  const activeSource = useMemo(
    () => sources.find((s) => s.id === activeSourceId) ?? null,
    [sources, activeSourceId],
  );

  const loadFromCacheOnly = useCallback(() => {
    if (!activeSource) {
      setFeedItems([]);
      return;
    }
    const cached = loadCachedFeed(activeSource.id);
    setFeedItems(cached);
    setFeedError(null);
  }, [activeSource]);

  const refreshFeed = useCallback(async () => {
    if (!activeSource) {
      setFeedItems([]);
      return;
    }
    // Show cached items instantly for snappy UX.
    const cached = loadCachedFeed(activeSource.id);
    if (cached.length > 0) setFeedItems(cached);

    setFeedLoading(true);
    setFeedError(null);
    try {
      const blockedList = blockedDomains;
      let items: FeedItem[] = [];
      const searchModel = newsSearchModelRef?.model;
      if (activeSource.kind === "rss" && activeSource.url) {
        const r = await fetchRss(activeSource.url, 30);
        items = r.items.filter((it) => !isBlockedUrl(it.url, blockedList));
      } else if (activeSource.kind === "topic") {
        items = await searchNews({
          query: activeSource.topic ?? activeSource.name,
          hours: Number(windowHours),
          limit: 15,
          language: activeSource.language ?? undefined,
          blockedDomains: blockedList,
          model: searchModel,
        });
        // Fallback: if no fresh items in the requested window, widen to last 30 days
        // and return the 10 most recent — better than showing "nothing found".
        if (items.length === 0) {
          items = await searchNews({
            query: activeSource.topic ?? activeSource.name,
            hours: 720,
            limit: 10,
            language: activeSource.language ?? undefined,
            blockedDomains: blockedList,
            model: searchModel,
          });
        }
      } else if (activeSource.kind === "site" && activeSource.url) {
        items = await searchNews({
          query: activeSource.topic ?? "",
          site: activeSource.url,
          hours: Number(windowHours),
          limit: 15,
          blockedDomains: blockedList,
          model: searchModel,
        });
        if (items.length === 0) {
          items = await searchNews({
            query: activeSource.topic ?? "",
            site: activeSource.url,
            hours: 720,
            limit: 10,
            blockedDomains: blockedList,
            model: searchModel,
          });
        }
      }
      // Merge fresh items into the persistent cache so old titles never disappear.
      const merged = mergeIntoCache(activeSource.id, items).filter(
        (it) => !isBlockedUrl(it.url, blockedList),
      );
      setFeedItems(merged);
      if (items.length === 0 && merged.length === 0) {
        toast.info("خبر تازه‌ای پیدا نشد. بازه زمانی را تغییر بده.");
      }
    } catch (e: Error | unknown) {
      setFeedError((e as Error).message ?? "Failed to load feed.");
      // Keep showing cached items even on failure.
      if (cached.length > 0) setFeedItems(cached);
    } finally {
      setFeedLoading(false);
    }
  }, [activeSource, windowHours, blockedDomains, newsSearchModelRef]);

  // On source change: show cache only, do NOT auto-fetch.
  useEffect(() => {
    loadFromCacheOnly();
  }, [loadFromCacheOnly]);

  // Restore scroll to the previously-opened headline after we return from an article.
  useEffect(() => {
    const ret = pendingScrollRef.current;
    if (!ret) return;
    if (feedItems.length === 0 && folderFeed.length === 0 && allFeed.length === 0) return;
    const id = `news-item-${encodeURIComponent(ret.url)}`;
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "auto" });
        el.classList.add("ring-2", "ring-primary/40");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary/40"), 1600);
      } else if (ret.scrollY) {
        window.scrollTo({ top: ret.scrollY, behavior: "auto" });
      }
      pendingScrollRef.current = null;
      try {
        sessionStorage.removeItem(RETURN_KEY);
      } catch {
        /* ignore */
      }
    });
  }, [feedItems, folderFeed, allFeed]);

  // ───── Aggregated folder feed ─────
  const loadFolderFromCache = useCallback(
    (folderId: string) => {
      const sourcesInFolder = sources.filter((s) => s.folderId === folderId);
      const blockedList = blockedDomains;
      const all: Array<FeedItem & { _sourceName?: string }> = [];
      for (const s of sourcesInFolder) {
        const cached = loadCachedFeed(s.id).filter((it) => !isBlockedUrl(it.url, blockedList));
        for (const it of cached) all.push({ ...it, _sourceName: s.name });
      }
      all.sort((a, b) => {
        const aT = Date.parse(a.publishedAt ?? "") || 0;
        const bT = Date.parse(b.publishedAt ?? "") || 0;
        return bT - aT;
      });
      setFolderFeed(all);
    },
    [sources, blockedDomains],
  );

  const refreshFolderFeed = useCallback(async () => {
    if (!activeFolderId) return;
    const sourcesInFolder = sources.filter((s) => s.folderId === activeFolderId);
    if (sourcesInFolder.length === 0) {
      setFolderFeed([]);
      return;
    }
    setFolderLoading(true);
    const blockedList = blockedDomains;
    try {
      let totalFetched = 0;
      let failed = 0;
      const failures: string[] = [];
      await Promise.all(
        sourcesInFolder.map(async (src) => {
          try {
            let items: FeedItem[] = [];
            const searchModel = newsSearchModelRef?.model;
            if (src.kind === "rss" && src.url) {
              const r = await fetchRss(src.url, 30);
              items = r.items.filter((it) => !isBlockedUrl(it.url, blockedList));
            } else if (src.kind === "topic") {
              items = await searchNews({
                query: src.topic ?? src.name,
                hours: Number(windowHours),
                limit: 15,
                language: src.language ?? undefined,
                blockedDomains: blockedList,
                model: searchModel,
              });
              if (items.length === 0) {
                items = await searchNews({
                  query: src.topic ?? src.name,
                  hours: 720,
                  limit: 10,
                  language: src.language ?? undefined,
                  blockedDomains: blockedList,
                  model: searchModel,
                });
              }
            } else if (src.kind === "site" && src.url) {
              items = await searchNews({
                query: src.topic ?? "",
                site: src.url,
                hours: Number(windowHours),
                limit: 15,
                blockedDomains: blockedList,
                model: searchModel,
              });
              if (items.length === 0) {
                items = await searchNews({
                  query: src.topic ?? "",
                  site: src.url,
                  hours: 720,
                  limit: 10,
                  blockedDomains: blockedList,
                  model: searchModel,
                });
              }
            }
            totalFetched += items.length;
            mergeIntoCache(src.id, items);
          } catch (err: Error | unknown) {
            failed += 1;
            failures.push(`${src.name}: ${(err as Error)?.message ?? "خطا"}`);
            console.error("[folder refresh] source failed", src.name, err);
          }
        }),
      );
      loadFolderFromCache(activeFolderId);
      if (failed === sourcesInFolder.length && sourcesInFolder.length > 0) {
        toast.error(
          `به‌روزرسانی همه‌ی ${failed} منبع شکست خورد. بازه زمانی را بیشتر کن یا منابع را بررسی کن.`,
        );
        console.error("[folder refresh] all sources failed:", failures);
      } else if (totalFetched === 0) {
        toast.info("هیچ خبر جدیدی در این بازه زمانی پیدا نشد. بازه را بیشتر کن.");
      } else {
        toast.success(
          `فید پوشه به‌روز شد. ${totalFetched} خبر دریافت شد${failed ? ` (${failed} منبع شکست خورد)` : ""}.`,
        );
      }
    } catch (e: Error | unknown) {
      toast.error((e as Error).message ?? "به‌روزرسانی پوشه شکست خورد.");
    } finally {
      setFolderLoading(false);
    }
  }, [
    activeFolderId,
    sources,
    blockedDomains,
    windowHours,
    loadFolderFromCache,
    newsSearchModelRef,
  ]);

  useEffect(() => {
    if (activeFolderId) loadFolderFromCache(activeFolderId);
  }, [activeFolderId, loadFolderFromCache]);

  // ───── All-news aggregated view (across every source / folder) ─────
  const loadAllFromCache = useCallback(() => {
    const blockedList = blockedDomains;
    const all: Array<FeedItem & { _sourceName?: string }> = [];
    const seenUrls = new Set<string>();
    for (const s of sources) {
      const cached = loadCachedFeed(s.id).filter((it) => !isBlockedUrl(it.url, blockedList));
      for (const it of cached) {
        if (seenUrls.has(it.url)) continue;
        seenUrls.add(it.url);
        all.push({ ...it, _sourceName: s.name });
      }
    }
    all.sort((a, b) => {
      const aT = Date.parse(a.publishedAt ?? "") || 0;
      const bT = Date.parse(b.publishedAt ?? "") || 0;
      return bT - aT;
    });
    setAllFeed(all);
  }, [sources, blockedDomains]);

  const refreshAllFeed = useCallback(async () => {
    if (sources.length === 0) {
      setAllFeed([]);
      return;
    }
    setAllLoading(true);
    const blockedList = blockedDomains;
    try {
      let totalFetched = 0;
      let failed = 0;
      await Promise.all(
        sources.map(async (src) => {
          try {
            let items: FeedItem[] = [];
            const searchModel = newsSearchModelRef?.model;
            if (src.kind === "rss" && src.url) {
              const r = await fetchRss(src.url, 30);
              items = r.items.filter((it) => !isBlockedUrl(it.url, blockedList));
            } else if (src.kind === "topic") {
              items = await searchNews({
                query: src.topic ?? src.name,
                hours: Number(windowHours),
                limit: 15,
                language: src.language ?? undefined,
                blockedDomains: blockedList,
                model: searchModel,
              });
            } else if (src.kind === "site" && src.url) {
              items = await searchNews({
                query: src.topic ?? "",
                site: src.url,
                hours: Number(windowHours),
                limit: 15,
                blockedDomains: blockedList,
                model: searchModel,
              });
            }
            totalFetched += items.length;
            mergeIntoCache(src.id, items);
          } catch (err) {
            failed += 1;
            console.error("[all refresh] source failed", src.name, err);
          }
        }),
      );
      loadAllFromCache();
      if (failed === sources.length) {
        toast.error(`به‌روزرسانی همه‌ی ${failed} منبع شکست خورد.`);
      } else if (totalFetched === 0) {
        toast.info("خبر جدیدی پیدا نشد.");
      } else {
        toast.success(
          `${totalFetched} خبر دریافت شد${failed ? ` (${failed} منبع شکست خورد)` : ""}.`,
        );
      }
    } catch (e: Error | unknown) {
      toast.error((e as Error).message ?? "به‌روزرسانی شکست خورد.");
    } finally {
      setAllLoading(false);
    }
  }, [sources, blockedDomains, windowHours, loadAllFromCache, newsSearchModelRef]);

  useEffect(() => {
    if (allMode) loadAllFromCache();
  }, [allMode, loadAllFromCache]);

  const handleTrending = useCallback(async () => {
    setTrendingBusy(true);
    setFeedError(null);
    try {
      const items = await fetchTrendingHeadlines({
        topic: activeSource?.topic ?? activeSource?.name,
        language: activeSource?.language ?? undefined,
        hours: Number(windowHours),
        limit: 15,
        blockedDomains: blockedDomains,
      });
      if (items.length === 0) {
        toast.info("عنوان داغی پیدا نشد.");
      } else {
        setFeedItems(items);
        if (activeSource) mergeIntoCache(activeSource.id, items);
      }
    } catch (e: Error | unknown) {
      toast.error((e as Error).message ?? "Trending fetch failed.");
    } finally {
      setTrendingBusy(false);
    }
  }, [activeSource, windowHours, blockedDomains]);

  const handleOpenArticle = useCallback(
    async (item: FeedItem) => {
      // In selection mode, taps toggle selection instead of opening.
      if (selectMode) {
        setSelectedUrls((prev) => {
          const next = new Set(prev);
          if (next.has(item.url)) next.delete(item.url);
          else next.add(item.url);
          return next;
        });
        return;
      }
      setOpenArticle(item.url);
      // Remember where the user was so the back button lands on the same headline.
      try {
        const ret: ReturnState = {
          sourceId: activeSourceId,
          folderId: activeFolderId,
          allMode,
          url: item.url,
          scrollY: window.scrollY,
        };
        sessionStorage.setItem(RETURN_KEY, JSON.stringify(ret));
      } catch {
        /* ignore */
      }
      markSeen(item.url);
      try {
        const article = await upsertArticle({
          sourceId: activeSource?.id ?? null,
          url: item.url,
          title: item.title,
          excerpt: item.excerpt,
          imageUrl: item.imageUrl,
          siteName: item.siteName ?? siteFromUrl(item.url),
          publishedAt: item.publishedAt,
        });
        navigate(`/news/article/${article.id}`);
      } catch (e: Error | unknown) {
        // Offline fallback: open the prefetched cached article if we have one.
        const cachedId = getCachedIdForUrl(item.url);
        if (cachedId) {
          navigate(`/news/article/${cachedId}`);
        } else {
          toast.error((e as Error).message ?? "Failed to open article.");
        }
      } finally {
        setOpenArticle(null);
      }
    },
    [activeSource, activeSourceId, activeFolderId, allMode, navigate, selectMode],
  );

  const handlePickFolderSource = useCallback(
    async (sourceId: string) => {
      setActiveSourceId(sourceId);
      setActiveFolderId(null);
    },
    [setActiveSourceId, setActiveFolderId],
  );

  const handleGenerateDigest = useCallback(async () => {
    if (feedItems.length === 0) {
      toast.error("No articles to summarise yet.");
      return;
    }
    setDigestBusy(true);
    try {
      const scope =
        activeSource?.kind === "rss" ? "source" : activeSource?.kind === "site" ? "site" : "topic";
      const digest = await generateDigest({
        articles: feedItems.map((it) => ({
          title: it.title,
          url: it.url,
          siteName: it.siteName ?? siteFromUrl(it.url),
          excerpt: it.excerpt,
          publishedAt: it.publishedAt,
        })),
        length: digestLength,
        scope,
        sourceId: activeSource?.id ?? null,
        topic: activeSource?.topic ?? activeSource?.name,
        windowHours: Number(windowHours),
        model: newsModelRef.model,
        voice: normalizeVoice(defaultRewriteVoice),
      });
      setDigests((prev) => [digest, ...prev]);
      toast.success("خلاصه آماده شد.");
      navigate(`/news/digest/${digest.id}`);
    } catch (e: Error | unknown) {
      toast.error((e as Error).message ?? "Digest generation failed.");
    } finally {
      setDigestBusy(false);
    }
  }, [
    feedItems,
    digestLength,
    activeSource,
    windowHours,
    navigate,
    newsModelRef.model,
    defaultRewriteVoice,
  ]);

  /** Quick-summary from a topic feed URL (Google News / Bing News RSS). */
  const handleInstantDigest = useCallback(
    async (topicText: string, feedUrl: string, label: string) => {
      try {
        const r = await fetchRss(feedUrl, 20);
        if (!r.items.length) {
          toast.error("خبری در این فید پیدا نشد.");
          return;
        }
        toast.info("در حال ساخت خلاصه از خبرهای زنده…");
        const digest = await generateDigest({
          articles: r.items.slice(0, 15).map((it) => ({
            title: it.title,
            url: it.url,
            siteName: it.siteName ?? siteFromUrl(it.url),
            excerpt: it.excerpt,
            publishedAt: it.publishedAt,
          })),
          length: "long",
          scope: "topic",
          topic: topicText,
          windowHours: 24,
          model: newsModelRef.model,
          voice: normalizeVoice(defaultRewriteVoice),
        });
        setDigests((prev) => [digest, ...prev]);
        toast.success(
          `خلاصه «${topicText}» از ${label === "bing" ? "Bing News" : "Google News"} آماده شد.`,
        );
        navigate(`/news/digest/${digest.id}`);
      } catch (e: Error | unknown) {
        toast.error((e as Error).message ?? "ساخت خلاصه شکست خورد.");
      }
    },
    [navigate, newsModelRef.model, defaultRewriteVoice],
  );

  const handleDeleteSource = useCallback(
    async (id: string) => {
      try {
        await deleteSource(id);
        setSources((prev) => prev.filter((s) => s.id !== id));
        if (activeSourceId === id) {
          setActiveSourceId(null);
          setFeedItems([]);
        }
      } catch (e: Error | unknown) {
        toast.error((e as Error).message ?? "Failed to delete.");
      }
    },
    [activeSourceId],
  );

  const handleAddSampleSources = useCallback(async () => {
    try {
      const created = await Promise.all(
        SAMPLE_SOURCES.map((s) =>
          addSource({
            kind: s.kind,
            name: s.name,
            url: s.url,
            topic: s.topic,
            language: s.language,
          }),
        ),
      );
      setSources((prev) => [...prev, ...created]);
      if (created.length > 0) {
        setActiveSourceId(created[0].id);
      }
      toast.success(`${created.length} منبع نمونه اضافه شد.`);
    } catch (e: Error | unknown) {
      toast.error((e as Error).message ?? "اضافه کردن منابع نمونه شکست خورد.");
    }
  }, []);

  const handlePublicBrowse = useCallback((topic: PublicTopic) => {
    setActiveSourceId(null);
    setActiveFolderId(null);
    setAllMode(false);
    setPublicTopic(topic);
  }, []);

  // Translate every English title currently visible (whichever list is active),
  // in cost-aware batches via the news-translate-titles edge function.
  const handleTranslateVisibleTitles = useCallback(async () => {
    const active = allMode ? allFeed : activeFolderId ? folderFeed : feedItems;
    const items: TranslatableItem[] = active.map((it) => ({
      url: it.url,
      title: it.title,
      excerpt: it.excerpt,
    }));
    if (items.length === 0) {
      toast.info("خبری برای ترجمه نیست. اول فید را بارگذاری کن.");
      return;
    }
    setTrBusy(true);
    setTrProgress({ done: 0, total: 0 });
    try {
      const res = await translateTitlesBatch(items, {
        model: newsModelRef.model,
        onProgress: (snap) => setTrProgress({ done: snap.done, total: snap.total }),
      });
      if (res.translated === 0 && res.failed === 0) {
        toast.info("همه‌ی عنوان‌ها از قبل ترجمه شده‌اند یا فارسی هستند.");
      } else if (res.failed > 0) {
        toast.error(`${res.translated} عنوان ترجمه شد · ${res.failed} ناموفق`);
      } else {
        toast.success(`${res.translated} عنوان ترجمه شد.`);
      }
    } catch (e: Error | unknown) {
      toast.error((e as Error)?.message ?? "ترجمه با خطا مواجه شد.");
    } finally {
      setTrBusy(false);
      setTimeout(() => setTrProgress(null), 1500);
    }
  }, [allMode, allFeed, activeFolderId, folderFeed, feedItems, newsModelRef.model]);

  // Pre-download articles so the English processed text can be read offline.
  // `mode`: 'last10' | 'last50' | 'last100' | 'all' | 'selected'.
  const handlePrefetchOffline = useCallback(
    async (mode: "last10" | "last50" | "last100" | "all" | "selected") => {
      const activeList = allMode ? allFeed : activeFolderId ? folderFeed : feedItems;
      let pool: Array<FeedItem & { _sourceName?: string }> = activeList;
      if (mode === "selected") {
        if (selectedUrls.size === 0) {
          toast.info("هیچ خبری انتخاب نشده. اول چند خبر را تیک بزن.");
          return;
        }
        pool = activeList.filter((it) => selectedUrls.has(it.url));
      } else if (mode === "last10") pool = activeList.slice(0, 10);
      else if (mode === "last50") pool = activeList.slice(0, 50);
      else if (mode === "last100") pool = activeList.slice(0, 100);

      if (pool.length === 0) {
        toast.info("خبری برای دانلود نیست. اول فید را بارگذاری کن.");
        return;
      }
      // Skip items already cached so re-runs are cheap.
      const todo = pool.filter((it) => !isUrlCached(it.url));
      if (todo.length === 0) {
        toast.success(`همه‌ی ${pool.length} خبر از قبل دانلود شده‌اند.`);
        return;
      }

      const ctrl = new AbortController();
      dlAbortRef.current = ctrl;
      setDlBusy(true);
      setDlProgress({ done: 0, total: todo.length, failed: 0 });
      try {
        const sourceIdByUrl = (url: string) => {
          if (activeSourceId) return activeSourceId;
          // For folder/all views we just upsert with no source (item.url has the source domain).
          return null;
        };
        const res = await prefetchManyForOffline(todo, {
          sourceIdByUrl,
          concurrency: 2,
          signal: ctrl.signal,
          onProgress: (p) => setDlProgress(p),
        });
        bumpOffline();
        if (res.failed > 0) {
          toast.error(`${res.done - res.failed} خبر دانلود شد · ${res.failed} ناموفق`);
        } else {
          toast.success(`${res.done} خبر برای حالت آفلاین ذخیره شد.`);
        }
      } catch (e: Error | unknown) {
        toast.error((e as Error)?.message ?? "دانلود آفلاین با خطا مواجه شد.");
      } finally {
        setDlBusy(false);
        dlAbortRef.current = null;
        setTimeout(() => setDlProgress(null), 1500);
        if (mode === "selected") {
          setSelectedUrls(new Set());
          setSelectMode(false);
        }
      }
    },
    [
      allMode,
      allFeed,
      activeFolderId,
      folderFeed,
      feedItems,
      selectedUrls,
      activeSourceId,
      bumpOffline,
    ],
  );

  const cancelPrefetch = useCallback(() => {
    dlAbortRef.current?.abort();
  }, []);

  const toggleSelectUrl = useCallback((url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-[hsl(var(--surface))] text-foreground overflow-x-hidden">
      <NewsHeader
        user={user}
        sharedUrl={sharedUrl}
        onClearSharedUrl={handleClearSharedUrl}
        onChannelAdded={handleChannelAdded}
        addSourceOpen={addSourceOpen}
        onAddSourceOpenChange={setAddSourceOpen}
        onSourceAdded={handleSourceAdded}
        onInstantDigest={handleInstantDigest}
      />

      <main
        className={
          user
            ? "max-w-[1400px] mx-auto px-3 sm:px-6 py-6 grid lg:grid-cols-[260px_minmax(0,1fr)] gap-6 min-w-0"
            : "max-w-3xl mx-auto px-3 sm:px-6 py-6"
        }
      >
        {user && (
          <NewsSidebar
            user={user}
            sources={sources}
            folders={folders}
            savedArticles={savedArticles}
            digests={digests}
            activeSourceId={activeSourceId}
            activeFolderId={activeFolderId}
            allMode={allMode}
            expandedFolders={expandedFolders}
            showSaved={showSaved}
            trBusy={trBusy}
            trProgress={trProgress}
            dlBusy={dlBusy}
            dlProgress={dlProgress}
            selectMode={selectMode}
            selectedUrls={selectedUrls}
            sourcesByFolder={sourcesByFolder}
            onTranslateVisibleTitles={handleTranslateVisibleTitles}
            onPrefetchOffline={handlePrefetchOffline}
            onCancelPrefetch={cancelPrefetch}
            onSelectModeToggle={() => {
              setSelectMode((v) => !v);
              if (selectMode) setSelectedUrls(new Set());
            }}
            onManageOpen={() => setManageOpen(true)}
            setExpandedFolders={setExpandedFolders}
            setActiveFolderId={setActiveFolderId}
            setActiveSourceId={setActiveSourceId}
            setAllMode={setAllMode}
            setSources={setSources}
            setFolders={setFolders}
            setShowSaved={setShowSaved}
            onDeleteSource={handleDeleteSource}
          />
        )}

        <NewsFeed
          publicTopic={publicTopic}
          setPublicTopic={setPublicTopic}
          allMode={allMode}
          allFeed={allFeed}
          allLoading={allLoading}
          refreshAllFeed={refreshAllFeed}
          activeFolderId={activeFolderId}
          folderFeed={folderFeed}
          folderLoading={folderLoading}
          refreshFolderFeed={refreshFolderFeed}
          activeSource={activeSource}
          sources={sources}
          folders={folders}
          feedItems={feedItems}
          feedLoading={feedLoading}
          feedError={feedError}
          refreshFeed={refreshFeed}
          handleTrending={handleTrending}
          trendingBusy={trendingBusy}
          windowHours={windowHours}
          setWindowHours={setWindowHours}
          digestLength={digestLength}
          setDigestLength={setDigestLength}
          handleGenerateDigest={handleGenerateDigest}
          digestBusy={digestBusy}
          titleTr={titleTr}
          selectMode={selectMode}
          selectedUrls={selectedUrls}
          openArticle={openArticle}
          handleOpenArticle={handleOpenArticle}
          handlePublicBrowse={handlePublicBrowse}
          handleAddSampleSources={handleAddSampleSources}
          setAddSourceOpen={setAddSourceOpen}
          onPickFolderSource={handlePickFolderSource}
          user={user}
        />
      </main>

      <ManageNewsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        folders={folders}
        blocked={blocked}
        onFoldersChanged={refreshFolders}
        onBlockedChanged={refreshBlocked}
      />
    </div>
  );
};

export default News;
