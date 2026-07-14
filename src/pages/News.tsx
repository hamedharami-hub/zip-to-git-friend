import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  RETURN_KEY,
  WINDOW_OPTIONS,
  formatTime,
  siteFromUrl,
  isBlockedUrl,
  type ReturnState,
} from "@/lib/newsPageHelpers";
import {
  ArrowLeft,
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
  Settings as SettingsIcon,
  X,
  Languages,
  Download,
  CheckSquare,
  Square,
} from "lucide-react";
import { NewsArticleCard } from "@/components/news/NewsArticleCard";
import { prefetchManyForOffline, isUrlCached, getCachedIdForUrl } from "@/lib/newsOfflineCache";
import {
  useTitleTranslations,
  translateTitlesBatch,
  type TranslatableItem,
} from "@/lib/newsTitleTranslations";
import { ImportUrlDialog } from "@/components/news/ImportUrlDialog";
import { AddSourceDialog } from "@/components/news/AddSourceDialog";
import { SourcesTree } from "@/components/news/SourcesTree";
import { FolderAggregatedView, AllAggregatedView } from "@/components/news/NewsAggregatedViews";
import { ManageNewsDialog } from "@/components/news/ManageNewsDialog";
import { NewsOnboarding } from "@/components/news/NewsOnboarding";
import { SAMPLE_SOURCES, type PublicTopic } from "@/lib/newsPublicTopics";
import { PublicNewsView } from "@/components/news/PublicNewsView";
import { InstallButton } from "@/components/pwa/InstallButton";
import { loadCachedFeed, mergeIntoCache } from "@/lib/newsFeedCache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/EmptyState";
import { AccountButton } from "@/components/auth/AccountButton";
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
  VOICE_LABELS,
  DEFAULT_REWRITE_VOICE,
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

  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const newsModelRef = coerceBookModel(
    settings.newsRewriteModelRef ?? settings.bookRewriteModelRef ?? "google/gemini-3-flash-preview",
  );

  const [sources, setSources] = useState<NewsSource[]>([]);
  const [folders, setFolders] = useState<NewsFolder[]>([]);
  const [blocked, setBlocked] = useState<BlockedDomain[]>([]);
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
      const blockedList = blocked.map((b) => b.domain);
      let items: FeedItem[] = [];
      const searchModel = settings.newsSearchModelRef?.model;
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
  }, [activeSource, windowHours, blocked, settings.newsSearchModelRef]);

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
      const blockedList = blocked.map((b) => b.domain);
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
    [sources, blocked],
  );

  const refreshFolderFeed = useCallback(async () => {
    if (!activeFolderId) return;
    const sourcesInFolder = sources.filter((s) => s.folderId === activeFolderId);
    if (sourcesInFolder.length === 0) {
      setFolderFeed([]);
      return;
    }
    setFolderLoading(true);
    const blockedList = blocked.map((b) => b.domain);
    try {
      let totalFetched = 0;
      let failed = 0;
      const failures: string[] = [];
      await Promise.all(
        sourcesInFolder.map(async (src) => {
          try {
            let items: FeedItem[] = [];
            const searchModel = settings.newsSearchModelRef?.model;
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
    blocked,
    windowHours,
    loadFolderFromCache,
    settings.newsSearchModelRef,
  ]);

  useEffect(() => {
    if (activeFolderId) loadFolderFromCache(activeFolderId);
  }, [activeFolderId, loadFolderFromCache]);

  // ───── All-news aggregated view (across every source / folder) ─────
  const loadAllFromCache = useCallback(() => {
    const blockedList = blocked.map((b) => b.domain);
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
  }, [sources, blocked]);

  const refreshAllFeed = useCallback(async () => {
    if (sources.length === 0) {
      setAllFeed([]);
      return;
    }
    setAllLoading(true);
    const blockedList = blocked.map((b) => b.domain);
    try {
      let totalFetched = 0;
      let failed = 0;
      await Promise.all(
        sources.map(async (src) => {
          try {
            let items: FeedItem[] = [];
            const searchModel = settings.newsSearchModelRef?.model;
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
  }, [sources, blocked, windowHours, loadAllFromCache, settings.newsSearchModelRef]);

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
        blockedDomains: blocked.map((b) => b.domain),
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
  }, [activeSource, windowHours, blocked]);

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
        voice: settings.defaultRewriteVoice ?? DEFAULT_REWRITE_VOICE,
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
    settings.defaultRewriteVoice,
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
          voice: settings.defaultRewriteVoice ?? DEFAULT_REWRITE_VOICE,
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
    [navigate, newsModelRef.model, settings.defaultRewriteVoice],
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
      toast.error(e?.message ?? "ترجمه با خطا مواجه شد.");
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
        toast.error(e?.message ?? "دانلود آفلاین با خطا مواجه شد.");
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
      <header className="m3-top-app-bar sticky top-0 z-30 border-b border-outline-variant/40">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 h-16 flex items-center gap-2">
          <Link to="/">
            <Button variant="ghost" size="icon" aria-label="Back to home" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-[15px] font-semibold flex items-center gap-2 min-w-0">
            <span className="h-9 w-9 rounded-2xl bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))] flex items-center justify-center shrink-0">
              <Newspaper className="h-4 w-4" />
            </span>
            <span className="truncate">News</span>
          </h1>
          <div className="ms-auto flex items-center gap-2">
            {user && (
              <>
                <ImportUrlDialog
                  initialUrl={sharedUrl ?? undefined}
                  autoOpen={!!sharedUrl}
                  onClose={() => {
                    if (sharedUrl) {
                      const next = new URLSearchParams(params);
                      next.delete("import_url");
                      setParams(next, { replace: true });
                    }
                  }}
                  onChannelAdded={(s) => {
                    setSources((prev) => [...prev, s]);
                    setActiveSourceId(s.id);
                  }}
                />
                <AddSourceDialog
                  open={addSourceOpen}
                  onOpenChange={setAddSourceOpen}
                  onAdded={(s) => {
                    setSources((prev) => [...prev, s]);
                    setActiveSourceId(s.id);
                  }}
                  onInstantDigest={handleInstantDigest}
                />
              </>
            )}
            <InstallButton />
            <AccountButton />
          </div>
        </div>
      </header>

      <main
        className={
          user
            ? "max-w-[1400px] mx-auto px-3 sm:px-6 py-6 grid lg:grid-cols-[260px_minmax(0,1fr)] gap-6 min-w-0"
            : "max-w-3xl mx-auto px-3 sm:px-6 py-6"
        }
      >
        {user && (
          <aside className="space-y-6 min-w-0">
            <section>
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  منابع
                </h2>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground">{sources.length}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={handleTranslateVisibleTitles}
                    disabled={trBusy}
                    title="ترجمه‌ی فارسی همه‌ی عنوان‌های انگلیسیِ این لیست (بَچ، کم‌هزینه)"
                  >
                    {trBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Languages className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        disabled={dlBusy}
                        title="دانلود خبر برای حالت آفلاین (متن انگلیسی پردازش‌شده)"
                      >
                        {dlBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="text-xs">دانلود برای آفلاین</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => handlePrefetchOffline("last10")}>
                        ۱۰ خبر آخر
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handlePrefetchOffline("last50")}>
                        ۵۰ خبر آخر
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handlePrefetchOffline("last100")}>
                        ۱۰۰ خبر آخر
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handlePrefetchOffline("all")}>
                        همه‌ی این لیست
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectMode((v) => !v);
                          if (selectMode) setSelectedUrls(new Set());
                        }}
                      >
                        {selectMode ? (
                          <>
                            <Square className="h-3.5 w-3.5 me-2" /> خروج از حالت انتخاب
                          </>
                        ) : (
                          <>
                            <CheckSquare className="h-3.5 w-3.5 me-2" /> انتخاب چند خبر…
                          </>
                        )}
                      </DropdownMenuItem>
                      {selectMode && (
                        <DropdownMenuItem
                          onClick={() => handlePrefetchOffline("selected")}
                          disabled={selectedUrls.size === 0}
                        >
                          <Download className="h-3.5 w-3.5 me-2" />
                          دانلود {selectedUrls.size} انتخاب‌شده
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => setManageOpen(true)}
                    title="مدیریت پوشه‌ها و دامنه‌های بلاک‌شده"
                  >
                    <SettingsIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {trProgress && trProgress.total > 0 && (
                <p className="px-1 mb-2 text-[11px] text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  ترجمه‌ی عنوان‌ها… {trProgress.done}/{trProgress.total}
                </p>
              )}
              {dlProgress && dlProgress.total > 0 && (
                <div className="px-1 mb-2 text-[11px] text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  <span className="truncate flex-1">
                    دانلود آفلاین… {dlProgress.done}/{dlProgress.total}
                    {dlProgress.failed > 0 ? ` · ${dlProgress.failed} ناموفق` : ""}
                  </span>
                  {dlBusy && (
                    <button onClick={cancelPrefetch} className="text-destructive hover:underline">
                      لغو
                    </button>
                  )}
                </div>
              )}
              {selectMode && (
                <div className="px-1 mb-2 text-[11px] text-primary flex items-center gap-1">
                  <CheckSquare className="h-3 w-3" />
                  حالت انتخاب فعال — روی خبرها بزن • {selectedUrls.size} انتخاب‌شده
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setAllMode(true);
                  setActiveFolderId(null);
                  setActiveSourceId(null);
                }}
                className={
                  "mb-2 w-full flex items-center gap-2 rounded-2xl border px-2.5 py-2 text-sm transition-colors " +
                  (allMode
                    ? "border-primary/30 bg-primary/10 text-foreground shadow-sm"
                    : "border-border/60 bg-card/60 hover:bg-accent text-foreground/90")
                }
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background">
                  <Globe2 className="h-3.5 w-3.5 text-primary" />
                </span>
                <span className="truncate flex-1 text-start font-medium">همه‌ی اخبار</span>
                <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {sources.length}
                </span>
              </button>
              {sources.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1">
                  هنوز منبعی اضافه نکرده‌ای. روی «افزودن» بزن.
                </p>
              ) : (
                <SourcesTree
                  folders={folders}
                  sourcesByFolder={sourcesByFolder}
                  activeSourceId={activeSourceId}
                  activeFolderId={activeFolderId}
                  collapsed={expandedFolders}
                  onToggleFolder={(id) => setExpandedFolders((c) => ({ ...c, [id]: !c[id] }))}
                  onPickFolder={(id) => {
                    setActiveFolderId(id);
                    setActiveSourceId(null);
                    setAllMode(false);
                  }}
                  onPickSource={(id) => {
                    setActiveSourceId(id);
                    setActiveFolderId(null);
                    setAllMode(false);
                  }}
                  onDeleteSource={handleDeleteSource}
                  onMoveSource={async (sourceId, folderId) => {
                    await updateSource(sourceId, { folderId });
                    setSources((prev) =>
                      prev.map((s) => (s.id === sourceId ? { ...s, folderId } : s)),
                    );
                  }}
                  onRenameSource={async (id, name) => {
                    await updateSource(id, { name });
                    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
                    toast.success("نام منبع به‌روز شد.");
                  }}
                  onRenameFolder={async (id, name) => {
                    await updateFolder(id, { name });
                    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
                    toast.success("نام پوشه به‌روز شد.");
                  }}
                />
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  اخبار ذخیره‌شده
                </h2>
                <button
                  type="button"
                  onClick={() => setShowSaved((v) => !v)}
                  className="text-[10px] text-primary hover:underline"
                >
                  {showSaved ? "بستن" : `نمایش (${savedArticles.length})`}
                </button>
              </div>
              {showSaved &&
                (savedArticles.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1">هنوز خبری سیو نکرده‌ای.</p>
                ) : (
                  <ul className="space-y-1 max-h-64 overflow-y-auto">
                    {savedArticles.map((a) => (
                      <li key={a.id}>
                        <Link
                          to={`/news/article/${a.id}`}
                          className="block rounded-md px-2 py-1.5 text-xs hover:bg-accent transition-colors"
                        >
                          <span className="block truncate font-medium">{a.title}</span>
                          <span className="block text-[10px] text-muted-foreground truncate">
                            {a.siteName ?? siteFromUrl(a.url)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ))}
            </section>

            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                خلاصه‌های ذخیره‌شده
              </h2>
              {digests.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1">هنوز خلاصه‌ای ساخته نشده.</p>
              ) : (
                <ul className="space-y-1">
                  {digests.slice(0, 12).map((d) => (
                    <li key={d.id}>
                      <Link
                        to={`/news/digest/${d.id}`}
                        className="block rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                      >
                        <span className="block truncate font-medium">{d.title}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {d.length === "max" ? "حداکثری" : d.length === "long" ? "بلند" : "کوتاه"}{" "}
                          · {formatTime(d.createdAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        )}

        <section className="min-w-0 space-y-4">
          {publicTopic ? (
            <PublicNewsView
              topic={publicTopic}
              onBack={() => setPublicTopic(null)}
              onSignIn={() => navigate("/auth")}
              onTopicChange={setPublicTopic}
            />
          ) : allMode ? (
            <AllAggregatedView
              items={allFeed}
              loading={allLoading}
              onRefresh={refreshAllFeed}
              onOpenItem={handleOpenArticle}
              sourceCount={sources.length}
            />
          ) : activeFolderId ? (
            <FolderAggregatedView
              folder={folders.find((f) => f.id === activeFolderId) ?? null}
              items={folderFeed}
              loading={folderLoading}
              onRefresh={refreshFolderFeed}
              onOpenItem={handleOpenArticle}
              onPickSource={(id) => {
                setActiveSourceId(id);
                setActiveFolderId(null);
              }}
              sources={sources}
            />
          ) : !activeSource ? (
            <NewsOnboarding
              isLoggedIn={!!user}
              onBrowsePublic={handlePublicBrowse}
              onAddSampleSources={handleAddSampleSources}
              onAddSource={() => {
                if (user) setAddSourceOpen(true);
                else navigate("/auth");
              }}
              onSignIn={() => navigate("/auth")}
            />
          ) : (
            <>
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {activeSource.kind === "rss" ? (
                      <Rss className="h-4 w-4 text-primary shrink-0" />
                    ) : activeSource.kind === "site" ? (
                      <Globe2 className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <Search className="h-4 w-4 text-primary shrink-0" />
                    )}
                    <h2 className="font-semibold truncate">{activeSource.name}</h2>
                    {activeSource.url && (
                      <a
                        href={activeSource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-muted-foreground truncate hover:text-foreground"
                      >
                        {siteFromUrl(activeSource.url)}
                      </a>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleTrending}
                    disabled={trendingBusy}
                    className="gap-1"
                    title="عنوان‌های داغ همین الان"
                  >
                    {trendingBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <TrendingUp className="h-3.5 w-3.5" />
                    )}
                    داغ‌ها
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={refreshFeed}
                    disabled={feedLoading}
                    className="gap-1"
                  >
                    {feedLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    بروزرسانی
                  </Button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {activeSource.kind !== "rss" && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <Select value={windowHours} onValueChange={setWindowHours}>
                        <SelectTrigger className="h-8 w-[140px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WINDOW_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value} className="text-xs">
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      لحن بازنویسی:
                    </span>
                    <Select
                      value={settings.defaultRewriteVoice ?? DEFAULT_REWRITE_VOICE}
                      onValueChange={(v) => void update({ defaultRewriteVoice: v as RewriteVoice })}
                    >
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(VOICE_LABELS) as RewriteVoice[]).map((v) => (
                          <SelectItem key={v} value={v} className="text-xs">
                            {VOICE_LABELS[v]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1.5 ms-auto">
                    <Tabs
                      value={digestLength}
                      onValueChange={(v) => setDigestLength(v as "long" | "max")}
                    >
                      <TabsList className="h-8">
                        <TabsTrigger value="long" className="text-xs">
                          خلاصه بلند
                        </TabsTrigger>
                        <TabsTrigger value="max" className="text-xs">
                          خلاصه حداکثری
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <Button
                      onClick={handleGenerateDigest}
                      disabled={digestBusy || feedItems.length === 0}
                      size="sm"
                      className="gap-1.5"
                    >
                      {digestBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      ساخت خلاصه AI
                    </Button>
                  </div>
                </div>
              </div>

              {feedError ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  {feedError}
                </div>
              ) : feedLoading ? (
                <div className="py-16 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : feedItems.length === 0 ? (
                <EmptyState
                  icon={<Newspaper className="h-7 w-7" />}
                  title="هیچ خبری پیدا نشد"
                  description="بازه زمانی را عوض کن یا منبع دیگری انتخاب کن."
                />
              ) : (
                <ul className="space-y-3">
                  {feedItems.map((item) => (
                    <NewsArticleCard
                      key={item.url}
                      item={item}
                      titleFa={titleTr[item.url]?.titleFa}
                      isSeen={isSeen(item.url)}
                      isCached={isUrlCached(item.url)}
                      selectMode={selectMode}
                      isSelected={selectedUrls.has(item.url)}
                      isOpening={openArticle === item.url}
                      onOpen={handleOpenArticle}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
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
