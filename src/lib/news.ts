/**
 * Client-side helpers for the news reader feature.
 *
 * Wraps the four edge functions (RSS fetch, search, scrape, digest) and
 * the Supabase tables (`news_sources`, `news_articles`, `news_digests`).
 */
import { supabase } from '@/integrations/supabase/client';

export type NewsSourceKind = 'rss' | 'topic' | 'site';
export type DigestLength = 'short' | 'long' | 'max' | 'auto-max';
export type DigestScope = 'topic' | 'site' | 'source';

export interface NewsSource {
  id: string;
  userId: string;
  kind: NewsSourceKind;
  name: string;
  url: string | null;
  topic: string | null;
  language: string | null;
  folderId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewsFolder {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeedItem {
  title: string;
  url: string;
  excerpt: string;
  author?: string;
  publishedAt?: string;
  imageUrl?: string;
  siteName?: string;
}

export interface NewsArticle {
  id: string;
  userId: string;
  sourceId: string | null;
  url: string;
  title: string;
  author: string | null;
  excerpt: string | null;
  contentMd: string | null;
  contentHtml: string | null;
  imageUrl: string | null;
  siteName: string | null;
  language: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  wordCount: number;
  isSaved: boolean;
}

export interface NewsDigest {
  id: string;
  userId: string;
  sourceId: string | null;
  length: DigestLength;
  scope: DigestScope;
  topic: string | null;
  windowHours: number;
  title: string;
  contentMd: string;
  contentHtml: string;
  sourceArticles: Array<{ title: string; url: string; siteName?: string }>;
  wordCount: number;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─────────── Sources CRUD ───────────

function rowToSource(row: any): NewsSource {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    name: row.name,
    url: row.url,
    topic: row.topic,
    language: row.language,
    folderId: row.folder_id ?? null,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSources(): Promise<NewsSource[]> {
  const { data, error } = await supabase
    .from('news_sources' as never)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data as any[]) ?? []).map(rowToSource);
}

export async function addSource(
  input: Partial<Omit<NewsSource, 'id' | 'userId' | 'createdAt' | 'updatedAt'>> & {
    kind: NewsSourceKind; name: string;
  },
): Promise<NewsSource> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Not signed in.');
  const { data, error } = await supabase
    .from('news_sources' as never)
    .insert({
      user_id: userId,
      kind: input.kind,
      name: input.name,
      url: input.url ?? null,
      topic: input.topic ?? null,
      language: input.language ?? null,
      folder_id: input.folderId ?? null,
      sort_order: input.sortOrder ?? 0,
    } as never)
    .select()
    .single();
  if (error) throw error;
  return rowToSource(data);
}

export async function updateSource(id: string, patch: Partial<{ folderId: string | null; sortOrder: number; name: string }>): Promise<void> {
  const update: Record<string, any> = {};
  if ('folderId' in patch) update.folder_id = patch.folderId;
  if ('sortOrder' in patch) update.sort_order = patch.sortOrder;
  if ('name' in patch) update.name = patch.name;
  const { error } = await supabase.from('news_sources' as never).update(update as never).eq('id', id);
  if (error) throw error;
}

export async function deleteSource(id: string): Promise<void> {
  const { error } = await supabase.from('news_sources' as never).delete().eq('id', id);
  if (error) throw error;
}

// ─────────── Folders ───────────

function rowToFolder(row: any): NewsFolder {
  return {
    id: row.id, userId: row.user_id, name: row.name,
    color: row.color, icon: row.icon, sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function listFolders(): Promise<NewsFolder[]> {
  const { data, error } = await supabase
    .from('news_folders' as never).select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data as any[]) ?? []).map(rowToFolder);
}

export async function createFolder(input: { name: string; color?: string | null; icon?: string | null }): Promise<NewsFolder> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Not signed in.');
  const { data, error } = await supabase.from('news_folders' as never).insert({
    user_id: userId, name: input.name, color: input.color ?? null, icon: input.icon ?? null,
  } as never).select().single();
  if (error) throw error;
  return rowToFolder(data);
}

export async function updateFolder(id: string, patch: Partial<{ name: string; color: string | null }>): Promise<void> {
  const { error } = await supabase.from('news_folders' as never).update(patch as never).eq('id', id);
  if (error) throw error;
}

export async function deleteFolder(id: string): Promise<void> {
  // Move sources out first.
  await supabase.from('news_sources' as never).update({ folder_id: null } as never).eq('folder_id', id);
  const { error } = await supabase.from('news_folders' as never).delete().eq('id', id);
  if (error) throw error;
}

// ─────────── Blocked domains ───────────

export interface BlockedDomain { id: string; domain: string; createdAt: string; }

export async function listBlockedDomains(): Promise<BlockedDomain[]> {
  const { data, error } = await supabase.from('news_blocked_domains' as never)
    .select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return ((data as any[]) ?? []).map((r) => ({ id: r.id, domain: r.domain, createdAt: r.created_at }));
}

export async function blockDomain(domain: string): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Not signed in.');
  const clean = domain.toLowerCase().replace(/^www\./, '').trim();
  if (!clean) return;
  const { error } = await supabase.from('news_blocked_domains' as never)
    .upsert({ user_id: userId, domain: clean } as never, { onConflict: 'user_id,domain' });
  if (error) throw error;
}

export async function unblockDomain(id: string): Promise<void> {
  const { error } = await supabase.from('news_blocked_domains' as never).delete().eq('id', id);
  if (error) throw error;
}

// ─────────── Edge function calls ───────────

export interface FetchedFeed {
  feedTitle?: string;
  items: FeedItem[];
}

export async function fetchRss(url: string, limit = 30): Promise<FetchedFeed> {
  const { data, error } = await supabase.functions.invoke<FetchedFeed>(
    'news-fetch-rss',
    { body: { url, limit } },
  );
  if (error) throw new Error(extractErr(error, 'RSS fetch failed.'));
  return data ?? { items: [] };
}

export async function searchNews(opts: {
  query?: string;
  site?: string;
  hours?: number;
  limit?: number;
  language?: string;
  blockedDomains?: string[];
}): Promise<FeedItem[]> {
  const { data, error } = await supabase.functions.invoke<{ items: FeedItem[] }>(
    'news-search',
    { body: opts },
  );
  if (error) throw new Error(extractErr(error, 'News search failed.'));
  return data?.items ?? [];
}

export async function fetchTrendingHeadlines(opts: {
  topic?: string;
  region?: string;
  language?: string;
  hours?: number;
  limit?: number;
  blockedDomains?: string[];
}): Promise<FeedItem[]> {
  const { data, error } = await supabase.functions.invoke<{ items: FeedItem[] }>(
    'news-trending',
    { body: opts },
  );
  if (error) throw new Error(extractErr(error, 'Trending fetch failed.'));
  return data?.items ?? [];
}

export interface DiscoveredFeed { name: string; url: string; }
export interface DiscoveredSite {
  siteName: string;
  domain: string;
  articleCount: number;
  feeds: DiscoveredFeed[];
}
export interface DiscoveryResult {
  googleNews: DiscoveredFeed;
  sites: DiscoveredSite[];
}

const RSS_DISCOVERY_CACHE_KEY = 'news.rssDiscovery.v2';

interface DiscoveryCacheEntry { topic: string; result: DiscoveryResult; cachedAt: number; }

function loadDiscoveryCache(): Record<string, DiscoveryCacheEntry> {
  try { return JSON.parse(localStorage.getItem(RSS_DISCOVERY_CACHE_KEY) || '{}'); } catch { return {}; }
}
function saveDiscoveryCache(map: Record<string, DiscoveryCacheEntry>) {
  try { localStorage.setItem(RSS_DISCOVERY_CACHE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export function getCachedDiscovery(topic: string): DiscoveryResult | null {
  const map = loadDiscoveryCache();
  return map[topic.trim().toLowerCase()]?.result ?? null;
}

export async function discoverRss(opts: {
  topic: string; region?: string; language?: string; limit?: number; forceRefresh?: boolean;
}): Promise<DiscoveryResult> {
  const key = opts.topic.trim().toLowerCase();
  const cache = loadDiscoveryCache();
  if (!opts.forceRefresh) {
    const entry = cache[key];
    if (entry && Date.now() - entry.cachedAt < 24 * 3600 * 1000) return entry.result;
  }
  const { data, error } = await supabase.functions.invoke<DiscoveryResult>('news-discover-rss', {
    body: { topic: opts.topic, region: opts.region, language: opts.language, limit: opts.limit ?? 20 },
  });
  if (error) throw new Error(extractErr(error, 'RSS discovery failed.'));
  const result: DiscoveryResult = data ?? { googleNews: { name: opts.topic, url: '' }, sites: [] };
  cache[key] = { topic: opts.topic, result, cachedAt: Date.now() };
  saveDiscoveryCache(cache);
  return result;
}

export interface ScrapedArticle {
  title: string;
  author: string | null;
  contentMd: string;
  contentHtml: string;
  excerpt: string | null;
  imageUrl: string | null;
  siteName: string | null;
  language: string | null;
  publishedAt: string | null;
  wordCount: number;
  blocked?: boolean;
  blockedReason?: string;
  finalUrl?: string;
}

export async function scrapeArticle(
  url: string,
  fallback?: { excerpt?: string; imageUrl?: string; siteName?: string },
): Promise<ScrapedArticle> {
  const { data, error } = await supabase.functions.invoke<ScrapedArticle>(
    'news-scrape-article',
    {
      body: {
        url,
        fallbackExcerpt: fallback?.excerpt,
        fallbackImageUrl: fallback?.imageUrl,
        fallbackSiteName: fallback?.siteName,
      },
    },
  );
  if (error) throw new Error(extractErr(error, 'Article scrape failed.'));
  if (!data) throw new Error('Article scrape returned empty result.');
  return data;
}

// ─────────── Articles CRUD ───────────

function rowToArticle(row: any): NewsArticle {
  return {
    id: row.id,
    userId: row.user_id,
    sourceId: row.source_id,
    url: row.url,
    title: row.title,
    author: row.author,
    excerpt: row.excerpt,
    contentMd: row.content_md,
    contentHtml: row.content_html,
    imageUrl: row.image_url,
    siteName: row.site_name,
    language: row.language,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    wordCount: row.word_count ?? 0,
    isSaved: !!row.is_saved,
  };
}

export async function getArticleByUrl(url: string): Promise<NewsArticle | null> {
  const { data, error } = await supabase
    .from('news_articles' as never)
    .select('*')
    .eq('url', url)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToArticle(data) : null;
}

export async function getArticleById(id: string): Promise<NewsArticle | null> {
  const { data, error } = await supabase
    .from('news_articles' as never)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToArticle(data) : null;
}

export async function upsertArticle(input: {
  sourceId?: string | null;
  url: string;
  title: string;
  author?: string | null;
  excerpt?: string | null;
  contentMd?: string | null;
  contentHtml?: string | null;
  imageUrl?: string | null;
  siteName?: string | null;
  language?: string | null;
  publishedAt?: string | null;
  wordCount?: number;
}): Promise<NewsArticle> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Not signed in.');
  const { data, error } = await supabase
    .from('news_articles' as never)
    .upsert(
      {
        user_id: userId,
        source_id: input.sourceId ?? null,
        url: input.url,
        title: input.title,
        author: input.author ?? null,
        excerpt: input.excerpt ?? null,
        content_md: input.contentMd ?? null,
        content_html: input.contentHtml ?? null,
        image_url: input.imageUrl ?? null,
        site_name: input.siteName ?? null,
        language: input.language ?? null,
        published_at: input.publishedAt ?? null,
        word_count: input.wordCount ?? 0,
      } as never,
      { onConflict: 'user_id,url' },
    )
    .select()
    .single();
  if (error) throw error;
  return rowToArticle(data);
}

export async function setArticleSaved(id: string, isSaved: boolean): Promise<void> {
  const { error } = await supabase
    .from('news_articles' as never)
    .update({ is_saved: isSaved } as never)
    .eq('id', id);
  if (error) throw error;
}

export async function listSavedArticles(): Promise<NewsArticle[]> {
  const { data, error } = await supabase
    .from('news_articles' as never)
    .select('*')
    .eq('is_saved', true)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data as any[]) ?? []).map(rowToArticle);
}

// ─────────── Digests ───────────

function rowToDigest(row: any): NewsDigest {
  return {
    id: row.id,
    userId: row.user_id,
    sourceId: row.source_id,
    length: row.length,
    scope: row.scope,
    topic: row.topic,
    windowHours: row.window_hours,
    title: row.title,
    contentMd: row.content_md,
    contentHtml: row.content_html,
    sourceArticles: (row.source_articles as any) ?? [],
    wordCount: row.word_count,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listDigests(): Promise<NewsDigest[]> {
  const { data, error } = await supabase
    .from('news_digests' as never)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data as any[]) ?? []).map(rowToDigest);
}

export async function getDigestById(id: string): Promise<NewsDigest | null> {
  const { data, error } = await supabase
    .from('news_digests' as never)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToDigest(data) : null;
}

export async function deleteDigest(id: string): Promise<void> {
  const { error } = await supabase.from('news_digests' as never).delete().eq('id', id);
  if (error) throw error;
}

export async function generateDigest(opts: {
  articles: Array<{
    title: string;
    url: string;
    siteName?: string;
    excerpt?: string;
    contentMd?: string;
    publishedAt?: string;
  }>;
  length: DigestLength;
  scope: DigestScope;
  sourceId?: string | null;
  topic?: string;
  windowHours?: number;
  model?: string;
}): Promise<NewsDigest> {
  const { data, error } = await supabase.functions.invoke<{
    title: string;
    contentMd: string;
    contentHtml: string;
    wordCount: number;
    model: string;
  }>('news-digest', {
    body: {
      articles: opts.articles,
      length: opts.length,
      topic: opts.topic,
      windowHours: opts.windowHours ?? 24,
      model: opts.model,
    },
  });
  if (error) throw new Error(extractErr(error, 'Digest generation failed.'));
  if (!data) throw new Error('Digest returned empty.');

  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const sources = opts.articles.map((a) => ({
    title: a.title,
    url: a.url,
    siteName: a.siteName,
  }));

  const { data: row, error: insErr } = await supabase
    .from('news_digests' as never)
    .insert({
      user_id: userId,
      source_id: opts.sourceId ?? null,
      length: opts.length,
      scope: opts.scope,
      topic: opts.topic ?? null,
      window_hours: opts.windowHours ?? 24,
      title: data.title,
      content_md: data.contentMd,
      content_html: data.contentHtml,
      source_articles: sources,
      word_count: data.wordCount,
      model: data.model,
    } as never)
    .select()
    .single();
  if (insErr) throw insErr;
  return rowToDigest(row);
}

// ─────────── URL/YouTube import ───────────

export interface ImportedArticle {
  title: string;
  author: string | null;
  contentMd: string;
  contentHtml: string;
  excerpt: string;
  imageUrl: string | null;
  siteName: string | null;
  language: string | null;
  publishedAt: string | null;
  wordCount: number;
}

export type ImportResult =
  | { kind: 'article' | 'youtube'; article: ImportedArticle }
  | { kind: 'youtube_channel'; channel: { kind: 'id' | 'handle' | 'user'; value: string } };

export async function importUrl(url: string): Promise<ImportResult> {
  const { data, error } = await supabase.functions.invoke<ImportResult>('news-import-url', {
    body: { url },
  });
  if (error) throw new Error(extractErr(error, 'Import failed.'));
  if (!data) throw new Error('Import returned empty result.');
  return data;
}

export async function youtubeChannelFeed(opts: {
  url?: string;
  channel?: { kind: 'id' | 'handle' | 'user'; value: string };
}): Promise<{ channelTitle: string; channelId: string; items: FeedItem[] }> {
  const { data, error } = await supabase.functions.invoke<{
    channelTitle: string;
    channelId: string;
    items: FeedItem[];
  }>('news-youtube-channel', { body: opts });
  if (error) throw new Error(extractErr(error, 'Channel fetch failed.'));
  if (!data) throw new Error('Channel returned empty.');
  return data;
}

// ─────────── Related-news comparison ───────────

export interface CompareResult {
  title: string;
  contentMd: string;
  contentHtml: string;
  wordCount: number;
  model: string;
}

export async function compareRelatedArticles(opts: {
  main: { title: string; siteName?: string | null; contentMd?: string | null; excerpt?: string | null };
  related: Array<{ title: string; url: string; siteName?: string | null; excerpt?: string | null; contentMd?: string | null }>;
  model?: string;
}): Promise<CompareResult> {
  const { data, error } = await supabase.functions.invoke<CompareResult>('news-compare', {
    body: opts,
  });
  if (error) throw new Error(extractErr(error, 'AI compare failed.'));
  if (!data) throw new Error('Compare returned empty.');
  return data;
}


// ─────────── Helpers ───────────

function extractErr(error: any, fallback: string): string {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === 'function') {
      // can't await here; just use message
    }
    return error?.message || fallback;
  } catch {
    return fallback;
  }
}
