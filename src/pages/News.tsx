import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

const RETURN_KEY = 'news.return.v1';
type ReturnState = { sourceId: string | null; folderId: string | null; url: string; scrollY: number };
import {
  ArrowLeft, Newspaper, Plus, Rss, Globe2, Search, Trash2, Loader2,
  Sparkles, Clock, RefreshCw, TrendingUp, ChevronDown, ChevronRight,
  FolderPlus, Folder, Ban, Bookmark, BookmarkCheck, Settings as SettingsIcon,
  X,
} from 'lucide-react';
import { ImportUrlDialog } from '@/components/news/ImportUrlDialog';
import { LiveDiscoverDialog } from '@/components/news/LiveDiscoverDialog';
import { InstallButton } from '@/components/pwa/InstallButton';
import { loadCachedFeed, mergeIntoCache } from '@/lib/newsFeedCache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/EmptyState';
import { AccountButton } from '@/components/auth/AccountButton';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  addSource, deleteSource, updateSource, discoverRss, fetchRss, fetchTrendingHeadlines,
  generateDigest, getCachedDiscovery, listDigests, listSavedArticles, listSources, searchNews,
  setArticleSaved, upsertArticle,
  listFolders, createFolder, deleteFolder, updateFolder,
  listBlockedDomains, blockDomain, unblockDomain,
  type DiscoveryResult, type DiscoveredSite, type FeedItem, type NewsArticle,
  type NewsDigest, type NewsSource, type NewsSourceKind, type NewsFolder, type BlockedDomain,
} from '@/lib/news';
import { useSettingsStore } from '@/store/settingsStore';
import { coerceBookModel } from '@/lib/aiModels';
import { useLongPress } from '@/hooks/useLongPress';
import { isSeen, markSeen, subscribeSeen } from '@/lib/seenArticles';
import { CheckCircle2 } from 'lucide-react';

const WINDOW_OPTIONS = [
  { value: '1', label: '۱ ساعت اخیر' },
  { value: '4', label: '۴ ساعت اخیر' },
  { value: '6', label: '۶ ساعت اخیر' },
  { value: '24', label: '۲۴ ساعت اخیر' },
  { value: '72', label: '۳ روز اخیر' },
  { value: '168', label: '۱ هفته اخیر' },
];

function formatTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const min = Math.round(diff / 60_000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h}h ago`;
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

function siteFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Detect Persian/Arabic script so titles render RTL with the Persian font. */
const RTL_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
function isRtlText(s?: string | null): boolean {
  return !!s && RTL_RE.test(s);
}

const News = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const settings = useSettingsStore((s) => s.settings);
  const newsModelRef = coerceBookModel(
    settings.newsRewriteModelRef ?? settings.bookRewriteModelRef ?? 'google/gemini-3-flash-preview',
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
      return raw ? JSON.parse(raw) as ReturnState : null;
    } catch { return null; }
  }, []);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(initialReturn?.sourceId ?? null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(initialReturn?.folderId ?? null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [folderFeed, setFolderFeed] = useState<Array<FeedItem & { _sourceName?: string }>>([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [windowHours, setWindowHours] = useState<string>('24');
  const [digestLength, setDigestLength] = useState<'long' | 'max'>('long');
  const [digestBusy, setDigestBusy] = useState(false);
  const [openArticle, setOpenArticle] = useState<string | null>(null);
  const [trendingBusy, setTrendingBusy] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  // Re-render tick when the seen-articles set changes (cross-tab too).
  const [, setSeenTick] = useState(0);
  useEffect(() => subscribeSeen(() => setSeenTick((n) => n + 1)), []);
  // After a back-navigation, scroll the previously opened headline into view once.
  const pendingScrollRef = useRef<string | null>(initialReturn?.url ?? null);
  
  

  // If we arrived from /share?import_url=…, open the importer prefilled.
  const sharedUrl = params.get('import_url');

  useEffect(() => {
    document.title = 'News reader — Language learning';
  }, []);

  useEffect(() => {
    if (sharedUrl) {
      toast.success('لینک از اپ دیگه دریافت شد — در حال آماده‌سازی…');
    }
  }, [sharedUrl]);

  const refreshSavedArticles = useCallback(async () => {
    try {
      const a = await listSavedArticles();
      setSavedArticles(a);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const [s, d, f, b] = await Promise.all([
          listSources(), listDigests(), listFolders(), listBlockedDomains(),
        ]);
        setSources(s);
        setDigests(d);
        setFolders(f);
        setBlocked(b);
        // Re-apply pending return state once data is loaded, so the same
        // source/folder is restored even if the user navigated back before
        // the lists were in memory.
        const ret = initialReturn;
        if (ret?.folderId && f.some((x) => x.id === ret.folderId)) {
          setActiveFolderId(ret.folderId);
        } else if (ret?.sourceId && s.some((x) => x.id === ret.sourceId)) {
          setActiveSourceId(ret.sourceId);
        } else if (s.length && !activeSourceId && !activeFolderId) {
          setActiveSourceId(s[0].id);
        }
        void refreshSavedArticles();
      } catch (e: any) {
        toast.error(e.message ?? 'Failed to load news.');
      }
    })();
  }, [user, activeSourceId, activeFolderId, initialReturn, refreshSavedArticles]);


  const refreshFolders = useCallback(async () => {
    const [f, s] = await Promise.all([listFolders(), listSources()]);
    setFolders(f); setSources(s);
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
      const isBlockedUrl = (url: string) => {
        try {
          const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
          return blockedList.some((b) => host === b || host.endsWith('.' + b));
        } catch { return false; }
      };
      let items: FeedItem[] = [];
      const searchModel = settings.newsSearchModelRef?.model;
      if (activeSource.kind === 'rss' && activeSource.url) {
        const r = await fetchRss(activeSource.url, 30);
        items = r.items.filter((it) => !isBlockedUrl(it.url));
      } else if (activeSource.kind === 'topic') {
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
      } else if (activeSource.kind === 'site' && activeSource.url) {
        items = await searchNews({
          query: activeSource.topic ?? '',
          site: activeSource.url,
          hours: Number(windowHours),
          limit: 15,
          blockedDomains: blockedList,
          model: searchModel,
        });
        if (items.length === 0) {
          items = await searchNews({
            query: activeSource.topic ?? '',
            site: activeSource.url,
            hours: 720,
            limit: 10,
            blockedDomains: blockedList,
            model: searchModel,
          });
        }
      }
      // Merge fresh items into the persistent cache so old titles never disappear.
      const merged = mergeIntoCache(activeSource.id, items).filter((it) => !isBlockedUrl(it.url));
      setFeedItems(merged);
      if (items.length === 0 && merged.length === 0) {
        toast.info('خبر تازه‌ای پیدا نشد. بازه زمانی را تغییر بده.');
      }
    } catch (e: any) {
      setFeedError(e.message ?? 'Failed to load feed.');
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
    const target = pendingScrollRef.current;
    if (!target) return;
    if (feedItems.length === 0 && folderFeed.length === 0) return;
    const id = `news-item-${encodeURIComponent(target)}`;
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'auto' });
        el.classList.add('ring-2', 'ring-primary/40');
        setTimeout(() => el.classList.remove('ring-2', 'ring-primary/40'), 1600);
      }
      pendingScrollRef.current = null;
      try { sessionStorage.removeItem(RETURN_KEY); } catch { /* ignore */ }
    });
  }, [feedItems, folderFeed]);


  // ───── Aggregated folder feed ─────
  const loadFolderFromCache = useCallback((folderId: string) => {
    const sourcesInFolder = sources.filter((s) => s.folderId === folderId);
    const blockedList = blocked.map((b) => b.domain);
    const isBlockedUrl = (url: string) => {
      try {
        const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
        return blockedList.some((b) => host === b || host.endsWith('.' + b));
      } catch { return false; }
    };
    const all: Array<FeedItem & { _sourceName?: string }> = [];
    for (const s of sourcesInFolder) {
      const cached = loadCachedFeed(s.id).filter((it) => !isBlockedUrl(it.url));
      for (const it of cached) all.push({ ...it, _sourceName: s.name });
    }
    all.sort((a, b) => {
      const aT = Date.parse(a.publishedAt ?? '') || 0;
      const bT = Date.parse(b.publishedAt ?? '') || 0;
      return bT - aT;
    });
    setFolderFeed(all);
  }, [sources, blocked]);

  const refreshFolderFeed = useCallback(async () => {
    if (!activeFolderId) return;
    const sourcesInFolder = sources.filter((s) => s.folderId === activeFolderId);
    if (sourcesInFolder.length === 0) {
      setFolderFeed([]);
      return;
    }
    setFolderLoading(true);
    const blockedList = blocked.map((b) => b.domain);
    const isBlockedUrl = (url: string) => {
      try {
        const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
        return blockedList.some((b) => host === b || host.endsWith('.' + b));
      } catch { return false; }
    };
    try {
      let totalFetched = 0;
      let failed = 0;
      const failures: string[] = [];
      await Promise.all(sourcesInFolder.map(async (src) => {
        try {
          let items: FeedItem[] = [];
          const searchModel = settings.newsSearchModelRef?.model;
          if (src.kind === 'rss' && src.url) {
            const r = await fetchRss(src.url, 30);
            items = r.items.filter((it) => !isBlockedUrl(it.url));
          } else if (src.kind === 'topic') {
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
          } else if (src.kind === 'site' && src.url) {
            items = await searchNews({
              query: src.topic ?? '',
              site: src.url,
              hours: Number(windowHours),
              limit: 15,
              blockedDomains: blockedList,
              model: searchModel,
            });
            if (items.length === 0) {
              items = await searchNews({
                query: src.topic ?? '',
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
        } catch (err: any) {
          failed += 1;
          failures.push(`${src.name}: ${err?.message ?? 'خطا'}`);
          console.error('[folder refresh] source failed', src.name, err);
        }
      }));
      loadFolderFromCache(activeFolderId);
      if (failed === sourcesInFolder.length && sourcesInFolder.length > 0) {
        toast.error(`به‌روزرسانی همه‌ی ${failed} منبع شکست خورد. بازه زمانی را بیشتر کن یا منابع را بررسی کن.`);
        console.error('[folder refresh] all sources failed:', failures);
      } else if (totalFetched === 0) {
        toast.info('هیچ خبر جدیدی در این بازه زمانی پیدا نشد. بازه را بیشتر کن.');
      } else {
        toast.success(`فید پوشه به‌روز شد. ${totalFetched} خبر دریافت شد${failed ? ` (${failed} منبع شکست خورد)` : ''}.`);
      }
    } catch (e: any) {
      toast.error(e.message ?? 'به‌روزرسانی پوشه شکست خورد.');
    } finally {
      setFolderLoading(false);
    }
  }, [activeFolderId, sources, blocked, windowHours, loadFolderFromCache, settings.newsSearchModelRef]);


  useEffect(() => {
    if (activeFolderId) loadFolderFromCache(activeFolderId);
  }, [activeFolderId, loadFolderFromCache]);


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
        toast.info('عنوان داغی پیدا نشد.');
      } else {
        setFeedItems(items);
        if (activeSource) mergeIntoCache(activeSource.id, items);
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Trending fetch failed.');
    } finally {
      setTrendingBusy(false);
    }
  }, [activeSource, windowHours]);

  const handleOpenArticle = useCallback(
    async (item: FeedItem) => {
      setOpenArticle(item.url);
      // Remember where the user was so the back button lands on the same headline.
      try {
        const ret: ReturnState = {
          sourceId: activeSourceId,
          folderId: activeFolderId,
          url: item.url,
          scrollY: window.scrollY,
        };
        sessionStorage.setItem(RETURN_KEY, JSON.stringify(ret));
      } catch { /* ignore */ }
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
      } catch (e: any) {
        toast.error(e.message ?? 'Failed to open article.');
      } finally {
        setOpenArticle(null);
      }
    },
    [activeSource, activeSourceId, activeFolderId, navigate],
  );

  const handleGenerateDigest = useCallback(async () => {
    if (feedItems.length === 0) {
      toast.error('No articles to summarise yet.');
      return;
    }
    setDigestBusy(true);
    try {
      const scope =
        activeSource?.kind === 'rss'
          ? 'source'
          : activeSource?.kind === 'site'
          ? 'site'
          : 'topic';
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
      });
      setDigests((prev) => [digest, ...prev]);
      toast.success('خلاصه آماده شد.');
      navigate(`/news/digest/${digest.id}`);
    } catch (e: any) {
      toast.error(e.message ?? 'Digest generation failed.');
    } finally {
      setDigestBusy(false);
    }
  }, [feedItems, digestLength, activeSource, windowHours, navigate]);

  const handleDeleteSource = useCallback(
    async (id: string) => {
      try {
        await deleteSource(id);
        setSources((prev) => prev.filter((s) => s.id !== id));
        if (activeSourceId === id) {
          setActiveSourceId(null);
          setFeedItems([]);
        }
      } catch (e: any) {
        toast.error(e.message ?? 'Failed to delete.');
      }
    },
    [activeSourceId],
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-2">
            <Link to="/">
              <Button variant="ghost" size="icon" aria-label="Back to home">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-lg font-semibold">News</h1>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-6 py-10">
          <EmptyState
            icon={<Newspaper className="h-7 w-7" />}
            title="ابتدا وارد شوید"
            description="برای ساخت فهرست منابع و خلاصه‌های هوش مصنوعی، یک حساب رایگان بسازید."
            action={
              <Link to="/auth">
                <Button size="lg">ورود / ثبت‌نام</Button>
              </Link>
            }
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--surface))] text-foreground overflow-x-hidden">
      <header className="m3-top-app-bar sticky top-0 z-30 border-b border-outline-variant/40">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center gap-2">
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
            <ImportUrlDialog
              initialUrl={sharedUrl ?? undefined}
              autoOpen={!!sharedUrl}
              onClose={() => {
                if (sharedUrl) {
                  const next = new URLSearchParams(params);
                  next.delete('import_url');
                  setParams(next, { replace: true });
                }
              }}
              onChannelAdded={(s) => {
                setSources((prev) => [...prev, s]);
                setActiveSourceId(s.id);
              }}
            />
            <LiveDiscoverDialog />
            <AddSourceDialog
              onAdded={(s) => {
                setSources((prev) => [...prev, s]);
                setActiveSourceId(s.id);
              }}
            />
            <InstallButton />
            <AccountButton />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-6 grid lg:grid-cols-[260px_minmax(0,1fr)] gap-6 min-w-0">
        <aside className="space-y-6 min-w-0">
          <section>
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                منابع
              </h2>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-muted-foreground">{sources.length}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6"
                  onClick={() => setManageOpen(true)} title="مدیریت پوشه‌ها و دامنه‌های بلاک‌شده">
                  <SettingsIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
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
                onPickFolder={(id) => { setActiveFolderId(id); setActiveSourceId(null); }}
                onPickSource={(id) => { setActiveSourceId(id); setActiveFolderId(null); }}
                onDeleteSource={handleDeleteSource}
                onMoveSource={async (sourceId, folderId) => {
                  await updateSource(sourceId, { folderId });
                  setSources((prev) => prev.map((s) => s.id === sourceId ? { ...s, folderId } : s));
                }}
                onRenameSource={async (id, name) => {
                  await updateSource(id, { name });
                  setSources((prev) => prev.map((s) => s.id === id ? { ...s, name } : s));
                  toast.success('نام منبع به‌روز شد.');
                }}
                onRenameFolder={async (id, name) => {
                  await updateFolder(id, { name });
                  setFolders((prev) => prev.map((f) => f.id === id ? { ...f, name } : f));
                  toast.success('نام پوشه به‌روز شد.');
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
                {showSaved ? 'بستن' : `نمایش (${savedArticles.length})`}
              </button>
            </div>
            {showSaved && (
              savedArticles.length === 0 ? (
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
              )
            )}
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
                        {d.length === 'max' ? 'حداکثری' : d.length === 'long' ? 'بلند' : 'کوتاه'} · {formatTime(d.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section className="min-w-0 space-y-4">
          {activeFolderId ? (
            <FolderAggregatedView
              folder={folders.find((f) => f.id === activeFolderId) ?? null}
              items={folderFeed}
              loading={folderLoading}
              onRefresh={refreshFolderFeed}
              onOpenItem={handleOpenArticle}
              onPickSource={(id) => { setActiveSourceId(id); setActiveFolderId(null); }}
              sources={sources}
            />
          ) : !activeSource ? (
            <EmptyState
              icon={<Newspaper className="h-7 w-7" />}
              title="یک منبع انتخاب یا اضافه کن"
              description="فید RSS یک سایت خبری اضافه کن، یا یک موضوع/سایت بنویس تا با هوش مصنوعی جستجو کنیم."
              action={
                <AddSourceDialog
                  onAdded={(s) => {
                    setSources((prev) => [...prev, s]);
                    setActiveSourceId(s.id);
                  }}
                  trigger={
                    <Button size="lg" className="gap-2">
                      <Plus className="h-4 w-4" />
                      افزودن منبع
                    </Button>
                  }
                />
              }
            />
          ) : (
            <>
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {activeSource.kind === 'rss' ? (
                      <Rss className="h-4 w-4 text-primary shrink-0" />
                    ) : activeSource.kind === 'site' ? (
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
                  {activeSource.kind !== 'rss' && (
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
                  <div className="flex items-center gap-1.5 ms-auto">
                    <Tabs value={digestLength} onValueChange={(v) => setDigestLength(v as 'long' | 'max')}>
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
                  {feedItems.map((item) => {
                    const seen = isSeen(item.url);
                    return (
                    <li key={item.url} id={`news-item-${encodeURIComponent(item.url)}`} className="scroll-mt-24 rounded-xl transition-shadow">

                      <button
                        type="button"
                        onClick={() => handleOpenArticle(item)}
                        disabled={openArticle === item.url}
                        className={
                          'group block w-full text-start rounded-xl border border-border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all ' +
                          (seen ? 'opacity-60' : '')
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
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h3
                              dir={isRtlText(item.title) ? 'rtl' : 'ltr'}
                              lang={isRtlText(item.title) ? 'fa' : undefined}
                              className={
                                'font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors ' +
                                (isRtlText(item.title) ? 'font-[Vazirmatn,system-ui,sans-serif] text-start ' : '') +
                                (seen ? 'font-normal text-muted-foreground' : '')
                              }>
                              {seen && <CheckCircle2 className="inline h-3.5 w-3.5 me-1 text-primary/70 align-text-bottom" />}
                              {item.title}
                            </h3>
                            {item.excerpt && (
                              <p
                                dir={isRtlText(item.excerpt) ? 'rtl' : 'ltr'}
                                lang={isRtlText(item.excerpt) ? 'fa' : undefined}
                                className={
                                  'text-sm text-muted-foreground mt-1 line-clamp-2 ' +
                                  (isRtlText(item.excerpt) ? 'font-[Vazirmatn,system-ui,sans-serif] text-start' : '')
                                }>
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
                              {openArticle === item.url && (
                                <Loader2 className="h-3 w-3 animate-spin ms-auto" />
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                    );
                  })}
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

function AddSourceDialog({
  onAdded,
  trigger,
}: {
  onAdded: (s: NewsSource) => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<NewsSourceKind>('rss');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setKind('rss');
    setName('');
    setUrl('');
    setTopic('');
  };

  const handleSubmit = async () => {
    setBusy(true);
    try {
      const finalName = name.trim() ||
        (kind === 'topic'
          ? topic.trim()
          : (() => {
              try {
                return new URL(url).hostname.replace(/^www\./, '');
              } catch {
                return 'Untitled source';
              }
            })());
      const created = await addSource({
        kind,
        name: finalName,
        url: kind === 'topic' ? null : url.trim() || null,
        topic: kind === 'rss' ? null : topic.trim() || null,
        language: null,
      });
      onAdded(created);
      toast.success('منبع اضافه شد.');
      setOpen(false);
      reset();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to add source.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            افزودن
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>افزودن منبع خبر</DialogTitle>
          <DialogDescription>
            فید RSS یک سایت، یا یک موضوع برای جستجو با هوش مصنوعی.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={kind} onValueChange={(v) => setKind(v as NewsSourceKind)} className="mt-2">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="rss" className="gap-1 text-xs">
              <Rss className="h-3.5 w-3.5" />
              RSS
            </TabsTrigger>
            <TabsTrigger value="topic" className="gap-1 text-xs">
              <Search className="h-3.5 w-3.5" />
              موضوع
            </TabsTrigger>
            <TabsTrigger value="site" className="gap-1 text-xs">
              <Globe2 className="h-3.5 w-3.5" />
              سایت
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rss" className="space-y-3 mt-4">
            <div className="space-y-1.5">
              <Label htmlFor="rss-url">لینک فید RSS</Label>
              <Input
                id="rss-url"
                type="url"
                placeholder="https://example.com/feed.xml"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rss-name">نام نمایشی (اختیاری)</Label>
              <Input
                id="rss-name"
                placeholder="BBC News"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                پیدا کردن فید RSS با موضوع
              </div>
              <RssDiscovery
                onPick={(feed) => {
                  setUrl(feed.url);
                  if (!name.trim()) setName(feed.name);
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="topic" className="space-y-3 mt-4">
            <div className="space-y-1.5">
              <Label htmlFor="topic">موضوع</Label>
              <Input
                id="topic"
                placeholder="AI breakthroughs, climate change…"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                هر بار باز کنی، تازه‌ترین خبرهای این موضوع را در بازه انتخابی نشانت می‌دهیم.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topic-name">نام نمایشی (اختیاری)</Label>
              <Input
                id="topic-name"
                placeholder="هوش مصنوعی"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </TabsContent>

          <TabsContent value="site" className="space-y-3 mt-4">
            <div className="space-y-1.5">
              <Label htmlFor="site-url">آدرس سایت</Label>
              <Input
                id="site-url"
                type="url"
                placeholder="https://techcrunch.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-topic">موضوع داخل سایت (اختیاری)</Label>
              <Input
                id="site-topic"
                placeholder="startup funding"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-name">نام نمایشی (اختیاری)</Label>
              <Input
                id="site-name"
                placeholder="TechCrunch — Startups"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            انصراف
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              busy ||
              (kind === 'rss' && !url.trim()) ||
              (kind === 'topic' && !topic.trim()) ||
              (kind === 'site' && !url.trim())
            }
            className="gap-1.5"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            افزودن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RssDiscovery({ onPick }: { onPick: (feed: { name: string; url: string }) => void }) {
  const [topic, setTopic] = useState('');
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const handleSearch = async (forceRefresh = false) => {
    const t = topic.trim();
    if (!t) return;
    setBusy(true);
    setSearched(true);
    try {
      const cached = getCachedDiscovery(t);
      if (cached && !forceRefresh) setResult(cached);
      const fresh = await discoverRss({ topic: t, forceRefresh });
      setResult(fresh);
      if (fresh.sites.length === 0) toast.info('فقط Google News پیدا شد. سایت اختصاصی نبود.');
    } catch (e: any) {
      toast.error(e.message ?? 'جستجو شکست خورد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <Input
          placeholder="مثلاً: تکنولوژی، ورزش، اقتصاد"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void handleSearch(false); }
          }}
          className="h-8 text-sm"
        />
        <Button type="button" size="sm" variant="secondary"
          onClick={() => void handleSearch(false)}
          disabled={busy || !topic.trim()} className="gap-1 shrink-0">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          جستجو
        </Button>
      </div>

      {result && (
        <ul className="max-h-72 overflow-y-auto space-y-1 rounded-md border border-border bg-background p-1">
          {result.googleNews.url && (
            <li>
              <button type="button"
                onClick={() => onPick(result.googleNews)}
                className="w-full text-start rounded px-2 py-1.5 hover:bg-accent transition-colors">
                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-primary" />
                  {result.googleNews.name}
                </div>
                <div className="text-[10px] text-muted-foreground">همه منابع، اخبار جدید</div>
              </button>
            </li>
          )}
          {result.sites.map((site) => {
            const open = expanded[site.domain] ?? false;
            const hasMultiple = site.feeds.length > 1;
            return (
              <li key={site.domain} className="rounded border border-transparent hover:border-border">
                <div className="flex items-center gap-1 px-1">
                  <button type="button"
                    onClick={() => onPick({ name: site.siteName, url: site.feeds[0].url })}
                    className="flex-1 text-start rounded px-2 py-1.5 hover:bg-accent transition-colors min-w-0">
                    <div className="text-sm font-medium truncate">{site.siteName}</div>
                    <div className="text-[10px] text-muted-foreground truncate" dir="ltr">
                      {site.domain} · {site.articleCount} خبر اخیر
                      {hasMultiple ? ` · ${site.feeds.length} فید` : ''}
                    </div>
                  </button>
                  {hasMultiple && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                      onClick={() => setExpanded((e) => ({ ...e, [site.domain]: !open }))}
                      title="نمایش فیدهای دیگر این سایت">
                      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
                {open && hasMultiple && (
                  <ul className="ms-6 mb-1 space-y-0.5 border-s border-border ps-2">
                    {site.feeds.map((f) => (
                      <li key={f.url}>
                        <button type="button"
                          onClick={() => onPick({ name: `${site.siteName} — ${f.name}`, url: f.url })}
                          className="w-full text-start rounded px-2 py-1 hover:bg-accent transition-colors">
                          <div className="text-xs truncate">{f.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate" dir="ltr">{f.url}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {searched && !busy && !result?.sites.length && !result?.googleNews.url && (
        <p className="text-[11px] text-muted-foreground">فیدی پیدا نشد.</p>
      )}
    </div>
  );
}

// ───────────────────── SourcesTree ─────────────────────

function SourceRow({
  source, isActive, folders, onPick, onDelete, onMove, onRename,
}: {
  source: NewsSource;
  isActive: boolean;
  folders: NewsFolder[];
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, folderId: string | null) => void | Promise<void>;
  onRename: (id: string, name: string) => void | Promise<void>;
}) {
  const Icon = source.kind === 'rss' ? Rss : source.kind === 'site' ? Globe2 : Search;
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useLongPress(() => setMenuOpen(true), 450);
  const handleRename = () => {
    const next = window.prompt('نام جدید منبع:', source.name);
    if (next && next.trim() && next.trim() !== source.name) {
      void onRename(source.id, next.trim());
    }
  };
  return (
    <li className="group flex items-center gap-1.5 rounded-xl px-1 py-0.5">
      <button
        type="button"
        onClick={(e) => {
          if (longPress.consumeClick()) { e.preventDefault(); return; }
          onPick(source.id);
        }}
        onDoubleClick={handleRename}
        onTouchStart={longPress.onTouchStart}
        onTouchEnd={longPress.onTouchEnd}
        onTouchMove={longPress.onTouchMove}
        onTouchCancel={longPress.onTouchCancel}
        onContextMenu={longPress.onContextMenu}
        className={
          'flex-1 flex items-center gap-2 rounded-xl border px-2.5 py-2 text-sm text-start transition-colors ' +
          (isActive
            ? 'border-primary/25 bg-primary/10 text-foreground shadow-sm'
            : 'border-transparent hover:border-border/70 hover:bg-accent text-muted-foreground hover:text-foreground')
        }>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background">
          <Icon className="h-3.5 w-3.5 shrink-0" />
        </span>
        <span className="truncate">{source.name}</span>
      </button>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-7 w-7 opacity-60 sm:opacity-0 sm:group-hover:opacity-100">
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleRename}>
            <SettingsIcon className="h-3.5 w-3.5 me-2" /> تغییر نام
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">انتقال به پوشه</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onMove(source.id, null)}>
            <Folder className="h-3.5 w-3.5 me-2" /> بدون پوشه
          </DropdownMenuItem>
          {folders.map((f) => (
            <DropdownMenuItem key={f.id} onClick={() => onMove(source.id, f.id)}>
              <Folder className="h-3.5 w-3.5 me-2" style={f.color ? { color: f.color } : undefined} />
              {f.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onDelete(source.id)} className="text-destructive">
            <Trash2 className="h-3.5 w-3.5 me-2" /> حذف منبع
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function FolderAggregatedView({
  folder, items, loading, onRefresh, onOpenItem, onPickSource, sources,
}: {
  folder: NewsFolder | null;
  items: Array<FeedItem & { _sourceName?: string }>;
  loading: boolean;
  onRefresh: () => void;
  onOpenItem: (item: FeedItem) => void;
  onPickSource: (id: string) => void;
  sources: NewsSource[];
}) {
  if (!folder) return null;
  const sourcesInFolder = sources.filter((s) => s.folderId === folder.id);
  return (
    <>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Folder className="h-4 w-4 shrink-0" style={folder.color ? { color: folder.color } : undefined} />
            <h2 className="font-semibold truncate">{folder.name}</h2>
            <span className="text-[11px] text-muted-foreground">
              {sourcesInFolder.length} منبع · {items.length} خبر
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading} className="gap-1">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
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
          {items.map((item) => {
            const seen = isSeen(item.url);
            return (
              <li key={item.url} id={`news-item-${encodeURIComponent(item.url)}`} className="scroll-mt-24 rounded-xl transition-shadow">
                <button
                  type="button"
                  onClick={() => onOpenItem(item)}
                  className={
                    'group block w-full text-start rounded-xl border border-border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all ' +
                    (seen ? 'opacity-60' : '')
                  }
                >
                  <div className="flex gap-3">
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt="" loading="lazy"
                        className="h-20 w-20 sm:h-24 sm:w-24 rounded-lg object-cover shrink-0 bg-muted"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3
                        dir={isRtlText(item.title) ? 'rtl' : 'ltr'}
                        lang={isRtlText(item.title) ? 'fa' : undefined}
                        className={
                          'font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors ' +
                          (isRtlText(item.title) ? 'font-[Vazirmatn,system-ui,sans-serif] text-start ' : '') +
                          (seen ? 'font-normal text-muted-foreground' : '')
                        }>
                        {seen && <CheckCircle2 className="inline h-3.5 w-3.5 me-1 text-primary/70 align-text-bottom" />}
                        {item.title}
                      </h3>
                      {item.excerpt && (
                        <p
                          dir={isRtlText(item.excerpt) ? 'rtl' : 'ltr'}
                          lang={isRtlText(item.excerpt) ? 'fa' : undefined}
                          className={
                            'text-sm text-muted-foreground mt-1 line-clamp-2 ' +
                            (isRtlText(item.excerpt) ? 'font-[Vazirmatn,system-ui,sans-serif] text-start' : '')
                          }>
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
          })}
        </ul>
      )}
    </>
  );
}

function SourcesTree({
  folders, sourcesByFolder, activeSourceId, activeFolderId, collapsed,
  onToggleFolder, onPickFolder, onPickSource, onDeleteSource, onMoveSource, onRenameSource, onRenameFolder,
}: {
  folders: NewsFolder[];
  sourcesByFolder: Map<string | null, NewsSource[]>;
  activeSourceId: string | null;
  activeFolderId: string | null;
  collapsed: Record<string, boolean>;
  onToggleFolder: (id: string) => void;
  onPickFolder: (id: string) => void;
  onPickSource: (id: string) => void;
  onDeleteSource: (id: string) => void;
  onMoveSource: (id: string, folderId: string | null) => void | Promise<void>;
  onRenameSource: (id: string, name: string) => void | Promise<void>;
  onRenameFolder: (id: string, name: string) => void | Promise<void>;
}) {
  const ungrouped = sourcesByFolder.get(null) ?? [];
  const renameFolder = (f: NewsFolder) => {
    const next = window.prompt('نام جدید پوشه:', f.name);
    if (next && next.trim() && next.trim() !== f.name) void onRenameFolder(f.id, next.trim());
  };
  return (
    <div className="space-y-2">
      {folders.map((folder) => {
        const items = sourcesByFolder.get(folder.id) ?? [];
        const isOpen = collapsed[folder.id] === true;
        const isActive = activeFolderId === folder.id;
        return (
          <div key={folder.id}>
            <div className="group flex items-center gap-1 rounded-2xl border border-border/60 bg-card/60 px-1.5 py-1 shadow-sm">
              <button type="button" onClick={() => onToggleFolder(folder.id)}
                className="p-1 rounded-full hover:bg-accent/50"
                title={isOpen ? 'بستن' : 'بازکردن'}>
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              <button type="button" onClick={() => onPickFolder(folder.id)}
                onDoubleClick={() => renameFolder(folder)}
                className={
                  'flex-1 flex items-center gap-2 px-2 py-1.5 rounded-xl text-xs font-medium transition-colors ' +
                  (isActive ? 'bg-primary/10 text-foreground' : 'hover:bg-accent/50')
                }>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background">
                  <Folder className="h-3.5 w-3.5" style={folder.color ? { color: folder.color } : undefined} />
                </span>
                <span className="truncate flex-1 text-start">{folder.name}</span>
                <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{items.length}</span>
              </button>
              <Button size="icon" variant="ghost"
                className="h-7 w-7 rounded-full opacity-70 sm:opacity-0 sm:group-hover:opacity-100"
                title="تغییر نام پوشه"
                onClick={() => renameFolder(folder)}>
                <SettingsIcon className="h-3 w-3" />
              </Button>
            </div>
            {isOpen && items.length > 0 && (
              <ul className="ms-4 space-y-0.5 mt-0.5 border-s border-border ps-1">
                {items.map((s) => (
                  <SourceRow key={s.id} source={s} isActive={s.id === activeSourceId}
                    folders={folders} onPick={onPickSource}
                    onDelete={onDeleteSource} onMove={onMoveSource} onRename={onRenameSource} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {ungrouped.length > 0 && (
        <ul className="space-y-0.5">
          {folders.length > 0 && (
            <li className="px-1 py-0.5 text-[10px] uppercase text-muted-foreground tracking-wider">بدون پوشه</li>
          )}
          {ungrouped.map((s) => (
            <SourceRow key={s.id} source={s} isActive={s.id === activeSourceId}
              folders={folders} onPick={onPickSource}
              onDelete={onDeleteSource} onMove={onMoveSource} onRename={onRenameSource} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────────────── Manage Dialog ─────────────────────

const FOLDER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6'];

function ManageNewsDialog({
  open, onOpenChange, folders, blocked, onFoldersChanged, onBlockedChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  folders: NewsFolder[];
  blocked: BlockedDomain[];
  onFoldersChanged: () => void | Promise<void>;
  onBlockedChanged: () => void | Promise<void>;
}) {
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState(FOLDER_COLORS[0]);
  const [blockInput, setBlockInput] = useState('');
  const [busy, setBusy] = useState(false);

  const handleCreateFolder = async () => {
    const name = folderName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await createFolder({ name, color: folderColor });
      setFolderName('');
      await onFoldersChanged();
      toast.success('پوشه ساخته شد.');
    } catch (e: any) { toast.error(e.message ?? 'خطا'); }
    finally { setBusy(false); }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('این پوشه حذف بشه؟ منابع داخلش به «بدون پوشه» منتقل می‌شن.')) return;
    try { await deleteFolder(id); await onFoldersChanged(); }
    catch (e: any) { toast.error(e.message ?? 'خطا'); }
  };

  const handleBlock = async () => {
    const d = blockInput.trim();
    if (!d) return;
    setBusy(true);
    try {
      await blockDomain(d);
      setBlockInput('');
      await onBlockedChanged();
      toast.success('دامنه بلاک شد.');
    } catch (e: any) { toast.error(e.message ?? 'خطا'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>مدیریت اخبار</DialogTitle>
          <DialogDescription>پوشه‌های منابع و دامنه‌های بلاک‌شده.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="folders" className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="folders" className="gap-1 text-xs">
              <FolderPlus className="h-3.5 w-3.5" /> پوشه‌ها
            </TabsTrigger>
            <TabsTrigger value="blocked" className="gap-1 text-xs">
              <Ban className="h-3.5 w-3.5" /> دامنه‌های بلاک‌شده
            </TabsTrigger>
          </TabsList>

          <TabsContent value="folders" className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label className="text-xs">پوشه جدید</Label>
              <div className="flex gap-1.5">
                <Input value={folderName} onChange={(e) => setFolderName(e.target.value)}
                  placeholder="مثلاً: تکنولوژی، ورزش"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreateFolder(); } }}
                  className="h-9" />
                <Button onClick={handleCreateFolder} disabled={busy || !folderName.trim()} size="sm">
                  افزودن
                </Button>
              </div>
              <div className="flex gap-1.5">
                {FOLDER_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setFolderColor(c)}
                    className={'h-6 w-6 rounded-full border-2 ' + (folderColor === c ? 'border-foreground' : 'border-transparent')}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-3">
              {folders.length === 0 ? (
                <p className="text-xs text-muted-foreground">هنوز پوشه‌ای نساخته‌ای.</p>
              ) : (
                <ul className="space-y-1 max-h-56 overflow-y-auto">
                  {folders.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent">
                      <Folder className="h-4 w-4" style={f.color ? { color: f.color } : undefined} />
                      <span className="flex-1 text-sm truncate">{f.name}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => handleDeleteFolder(f.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="blocked" className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label className="text-xs">بلاک کردن دامنه</Label>
              <div className="flex gap-1.5">
                <Input value={blockInput} onChange={(e) => setBlockInput(e.target.value)}
                  placeholder="example.com" dir="ltr"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleBlock(); } }}
                  className="h-9" />
                <Button onClick={handleBlock} disabled={busy || !blockInput.trim()} size="sm">
                  بلاک
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                مقالات از این دامنه‌ها در جستجو و فید نمایش داده نمی‌شن.
              </p>
            </div>

            <div className="border-t border-border pt-3">
              {blocked.length === 0 ? (
                <p className="text-xs text-muted-foreground">دامنه‌ای بلاک نشده.</p>
              ) : (
                <ul className="space-y-1 max-h-56 overflow-y-auto">
                  {blocked.map((b) => (
                    <li key={b.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent">
                      <Ban className="h-4 w-4 text-destructive" />
                      <span className="flex-1 text-sm truncate" dir="ltr">{b.domain}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={async () => { await unblockDomain(b.id); await onBlockedChanged(); }}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>بستن</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



export default News;
