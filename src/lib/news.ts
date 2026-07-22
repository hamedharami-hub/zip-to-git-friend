/**
 * Client-side helpers for the news reader feature.
 *
 * Wraps the four edge functions (RSS fetch, search, scrape, digest) and
 * the Supabase tables (`news_sources`, `news_articles`, `news_digests`).
 */
import { supabase } from "@/integrations/supabase/client";
import type { RewriteLength, RewriteVoice } from "@/types";

export type NewsSourceKind = "rss" | "topic" | "site";
export type DigestLength = "short" | RewriteLength;
export type DigestScope = "topic" | "site" | "source";

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
  voice: RewriteVoice;
  createdAt: string;
  updatedAt: string;
}

export function rewriteKey(length: DigestLength, voice: RewriteVoice): string {
  return `${length}:${voice}`;
}

/** Persian labels for the available digest personas. */
export const VOICE_LABELS: Record<RewriteVoice, string> = {
  journalist: "خبرنگار (کوتاه و تحلیلی)",
  teacher: "معلم (با توضیح و مثال)",
  storyteller: "داستان‌سرا (صحنه و روایت)",
  copilot: "کمک‌هوشمند (Copilot + ایموجی)",
};

/** Default persona used when the user has not explicitly chosen one. */
export const DEFAULT_REWRITE_VOICE: RewriteVoice = "journalist";

/** Maps old/legacy voices to the new reduced set. */
const LEGACY_VOICE_MAP: Record<string, RewriteVoice> = {
  auto: "journalist",
  friend: "teacher",
  socratic: "storyteller",
};

/** Normalize any voice string to a valid current voice. */
export function normalizeVoice(voice: string | null | undefined): RewriteVoice {
  const v = (voice ?? DEFAULT_REWRITE_VOICE).trim();
  if (v in VOICE_LABELS) return v as RewriteVoice;
  return LEGACY_VOICE_MAP[v] ?? DEFAULT_REWRITE_VOICE;
}

// ─────────── Sources CRUD ───────────

function rowToSource(row: Record<string, unknown>): NewsSource {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    kind: row.kind as NewsSourceKind,
    name: row.name as string,
    url: row.url as string | null,
    topic: row.topic as string | null,
    language: row.language as string | null,
    folderId: (row.folder_id as string | null | undefined) ?? null,
    sortOrder: (row.sort_order as number | null | undefined) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listSources(): Promise<NewsSource[]> {
  const { data, error } = await supabase
    .from("news_sources" as never)
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map(rowToSource);
}

export async function addSource(
  input: Partial<Omit<NewsSource, "id" | "userId" | "createdAt" | "updatedAt">> & {
    kind: NewsSourceKind;
    name: string;
  },
): Promise<NewsSource> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("Not signed in.");
  const { data, error } = await supabase
    .from("news_sources" as never)
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
  return rowToSource(data as Record<string, unknown>);
}

export async function updateSource(
  id: string,
  patch: Partial<{ folderId: string | null; sortOrder: number; name: string }>,
): Promise<void> {
  const update: Record<string, unknown> = {};
  if ("folderId" in patch) update.folder_id = patch.folderId;
  if ("sortOrder" in patch) update.sort_order = patch.sortOrder;
  if ("name" in patch) update.name = patch.name;
  const { error } = await supabase
    .from("news_sources" as never)
    .update(update as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSource(id: string): Promise<void> {
  const { error } = await supabase
    .from("news_sources" as never)
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ─────────── Folders ───────────

function rowToFolder(row: Record<string, unknown>): NewsFolder {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    color: row.color as string | null,
    icon: row.icon as string | null,
    sortOrder: (row.sort_order as number | null | undefined) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listFolders(): Promise<NewsFolder[]> {
  const { data, error } = await supabase
    .from("news_folders" as never)
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map(rowToFolder);
}

export async function createFolder(input: {
  name: string;
  color?: string | null;
  icon?: string | null;
}): Promise<NewsFolder> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("Not signed in.");
  const { data, error } = await supabase
    .from("news_folders" as never)
    .insert({
      user_id: userId,
      name: input.name,
      color: input.color ?? null,
      icon: input.icon ?? null,
    } as never)
    .select()
    .single();
  if (error) throw error;
  return rowToFolder(data as Record<string, unknown>);
}

export async function updateFolder(
  id: string,
  patch: Partial<{ name: string; color: string | null }>,
): Promise<void> {
  const { error } = await supabase
    .from("news_folders" as never)
    .update(patch as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteFolder(id: string): Promise<void> {
  // Move sources out first.
  await supabase
    .from("news_sources" as never)
    .update({ folder_id: null } as never)
    .eq("folder_id", id);
  const { error } = await supabase
    .from("news_folders" as never)
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ─────────── Blocked domains ───────────

export interface BlockedDomain {
  id: string;
  domain: string;
  createdAt: string;
}

export async function listBlockedDomains(): Promise<BlockedDomain[]> {
  const { data, error } = await supabase
    .from("news_blocked_domains" as never)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    id: r.id as string,
    domain: r.domain as string,
    createdAt: r.created_at as string,
  }));
}

export async function blockDomain(domain: string): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("Not signed in.");
  const clean = domain
    .toLowerCase()
    .replace(/^www\./, "")
    .trim();
  if (!clean) return;
  const { error } = await supabase
    .from("news_blocked_domains" as never)
    .upsert({ user_id: userId, domain: clean } as never, { onConflict: "user_id,domain" });
  if (error) throw error;
}

export async function unblockDomain(id: string): Promise<void> {
  const { error } = await supabase
    .from("news_blocked_domains" as never)
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ─────────── Edge function calls ───────────

export interface FetchedFeed {
  feedTitle?: string;
  items: FeedItem[];
}

export async function fetchRss(url: string, limit = 30): Promise<FetchedFeed> {
  const { data, error } = await supabase.functions.invoke<FetchedFeed>("news-fetch-rss", {
    body: { url, limit },
  });
  if (error) throw new Error(extractErr(error, "RSS fetch failed."));
  return data ?? { items: [] };
}

export async function searchNews(opts: {
  query?: string;
  site?: string;
  hours?: number;
  limit?: number;
  language?: string;
  blockedDomains?: string[];
  /** Optional AI model id used by the edge function for headline summaries. */
  model?: string;
}): Promise<FeedItem[]> {
  const { data, error } = await supabase.functions.invoke<{ items: FeedItem[] }>("news-search", {
    body: opts,
  });
  if (error) throw new Error(extractErr(error, "News search failed."));
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
  const { data, error } = await supabase.functions.invoke<{ items: FeedItem[] }>("news-trending", {
    body: opts,
  });
  if (error) throw new Error(extractErr(error, "Trending fetch failed."));
  return data?.items ?? [];
}

export interface DiscoveredFeed {
  name: string;
  url: string;
}
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

const RSS_DISCOVERY_CACHE_KEY = "news.rssDiscovery.v2";

interface DiscoveryCacheEntry {
  topic: string;
  result: DiscoveryResult;
  cachedAt: number;
}

function loadDiscoveryCache(): Record<string, DiscoveryCacheEntry> {
  try {
    return JSON.parse(localStorage.getItem(RSS_DISCOVERY_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveDiscoveryCache(map: Record<string, DiscoveryCacheEntry>) {
  try {
    localStorage.setItem(RSS_DISCOVERY_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getCachedDiscovery(topic: string): DiscoveryResult | null {
  const map = loadDiscoveryCache();
  return map[topic.trim().toLowerCase()]?.result ?? null;
}

export async function discoverRss(opts: {
  topic: string;
  region?: string;
  language?: string;
  limit?: number;
  forceRefresh?: boolean;
}): Promise<DiscoveryResult> {
  const key = opts.topic.trim().toLowerCase();
  const cache = loadDiscoveryCache();
  if (!opts.forceRefresh) {
    const entry = cache[key];
    if (entry && Date.now() - entry.cachedAt < 24 * 3600 * 1000) return entry.result;
  }
  const { data, error } = await supabase.functions.invoke<DiscoveryResult>("news-discover-rss", {
    body: {
      topic: opts.topic,
      region: opts.region,
      language: opts.language,
      limit: opts.limit ?? 20,
    },
  });
  if (error) throw new Error(extractErr(error, "RSS discovery failed."));
  const result: DiscoveryResult = data ?? { googleNews: { name: opts.topic, url: "" }, sites: [] };
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
  const { data, error } = await supabase.functions.invoke<ScrapedArticle>("news-scrape-article", {
    body: {
      url,
      fallbackExcerpt: fallback?.excerpt,
      fallbackImageUrl: fallback?.imageUrl,
      fallbackSiteName: fallback?.siteName,
    },
  });
  if (error) throw new Error(extractErr(error, "Article scrape failed."));
  if (!data) throw new Error("Article scrape returned empty result.");
  return data;
}

// ─────────── Articles CRUD ───────────

function rowToArticle(row: Record<string, unknown>): NewsArticle {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    sourceId: (row.source_id as string | null | undefined) ?? null,
    url: row.url as string,
    title: row.title as string,
    author: (row.author as string | null | undefined) ?? null,
    excerpt: (row.excerpt as string | null | undefined) ?? null,
    contentMd: (row.content_md as string | null | undefined) ?? null,
    contentHtml: (row.content_html as string | null | undefined) ?? null,
    imageUrl: (row.image_url as string | null | undefined) ?? null,
    siteName: (row.site_name as string | null | undefined) ?? null,
    language: (row.language as string | null | undefined) ?? null,
    publishedAt: (row.published_at as string | null | undefined) ?? null,
    fetchedAt: row.fetched_at as string,
    wordCount: (row.word_count as number | null | undefined) ?? 0,
    isSaved: !!row.is_saved,
  };
}

export async function getArticleByUrl(url: string): Promise<NewsArticle | null> {
  const { data, error } = await supabase
    .from("news_articles" as never)
    .select("*")
    .eq("url", url)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToArticle(data as Record<string, unknown>) : null;
}

export async function getArticleById(id: string): Promise<NewsArticle | null> {
  const { data, error } = await supabase
    .from("news_articles" as never)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToArticle(data as Record<string, unknown>) : null;
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
  if (!userId) throw new Error("Not signed in.");

  // Only set the body columns when they are explicitly provided so an
  // upsert from the feed list does not wipe an already-scraped article body.
  const payload: Record<string, unknown> = {
    user_id: userId,
    source_id: input.sourceId ?? null,
    url: input.url,
    title: input.title,
    author: input.author ?? null,
    excerpt: input.excerpt ?? null,
    image_url: input.imageUrl ?? null,
    site_name: input.siteName ?? null,
    language: input.language ?? null,
    published_at: input.publishedAt ?? null,
    word_count: input.wordCount ?? 0,
  };
  if (input.contentMd !== undefined) payload.content_md = input.contentMd ?? null;
  if (input.contentHtml !== undefined) payload.content_html = input.contentHtml ?? null;

  const { data, error } = await supabase
    .from("news_articles" as never)
    .upsert(payload as never, { onConflict: "user_id,url" })
    .select()
    .single();
  if (error) throw error;
  return rowToArticle(data as Record<string, unknown>);
}

export async function setArticleSaved(id: string, isSaved: boolean): Promise<void> {
  const { error } = await supabase
    .from("news_articles" as never)
    .update({ is_saved: isSaved } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function listSavedArticles(): Promise<NewsArticle[]> {
  const { data, error } = await supabase
    .from("news_articles" as never)
    .select("*")
    .eq("is_saved", true)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map(rowToArticle);
}

// ─────────── Digests ───────────

export function rowToDigest(row: Record<string, unknown>): NewsDigest {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    sourceId: (row.source_id as string | null | undefined) ?? null,
    length: row.length as DigestLength,
    scope: row.scope as DigestScope,
    topic: (row.topic as string | null | undefined) ?? null,
    windowHours: (row.window_hours as number | null | undefined) ?? 24,
    title: row.title as string,
    contentMd: row.content_md as string,
    contentHtml: row.content_html as string,
    sourceArticles: (row.source_articles as NewsDigest["sourceArticles"]) ?? [],
    wordCount: (row.word_count as number | null | undefined) ?? 0,
    model: row.model as string | null,
    voice: normalizeVoice(row.voice as string),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listDigests(): Promise<NewsDigest[]> {
  const { data, error } = await supabase
    .from("news_digests" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map(rowToDigest);
}

export async function getDigestById(id: string): Promise<NewsDigest | null> {
  const { data, error } = await supabase
    .from("news_digests" as never)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToDigest(data as Record<string, unknown>) : null;
}

export async function deleteDigest(id: string): Promise<void> {
  const { error } = await supabase
    .from("news_digests" as never)
    .delete()
    .eq("id", id);
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
  simplifyLevel?: "a2-b1" | "b1-b2";
  voice?: RewriteVoice;
}): Promise<NewsDigest> {
  const voice = normalizeVoice(opts.voice);
  const { data, error } = await supabase.functions.invoke<{
    title: string;
    contentMd: string;
    contentHtml: string;
    wordCount: number;
    model: string;
  }>("news-digest", {
    body: {
      articles: opts.articles,
      length: opts.length,
      voice,
      topic: opts.topic,
      windowHours: opts.windowHours ?? 24,
      model: opts.model,
      simplifyLevel: opts.simplifyLevel,
    },
  });
  if (error) throw new Error(extractErr(error, "Digest generation failed."));
  if (!data) throw new Error("Digest returned empty.");

  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const sources = opts.articles.map((a) => ({
    title: a.title,
    url: a.url,
    siteName: a.siteName,
  }));

  const { data: row, error: insErr } = await supabase
    .from("news_digests" as never)
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
      voice,
    } as never)
    .select()
    .single();
  if (insErr) {
    // Fallback when the new `voice` column or extended length check has not
    // been applied yet. We still return a usable digest and persist it locally.
    const code = (insErr as { code?: string }).code;
    if (code === "42703" || code === "23514") {
      return {
        id: `local-${crypto.randomUUID()}`,
        userId,
        sourceId: opts.sourceId ?? null,
        length: opts.length,
        scope: opts.scope,
        topic: opts.topic ?? null,
        windowHours: opts.windowHours ?? 24,
        title: data.title,
        contentMd: data.contentMd,
        contentHtml: data.contentHtml,
        sourceArticles: sources,
        wordCount: data.wordCount,
        model: data.model,
        voice,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    throw insErr;
  }
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
  | { kind: "article" | "youtube"; article: ImportedArticle }
  | { kind: "youtube_channel"; channel: { kind: "id" | "handle" | "user"; value: string } };

export async function importUrl(url: string): Promise<ImportResult> {
  const { data, error } = await supabase.functions.invoke<ImportResult>("news-import-url", {
    body: { url },
  });
  if (error) throw new Error(extractErr(error, "Import failed."));
  if (!data) throw new Error("Import returned empty result.");
  return data;
}

export async function youtubeChannelFeed(opts: {
  url?: string;
  channel?: { kind: "id" | "handle" | "user"; value: string };
}): Promise<{ channelTitle: string; channelId: string; items: FeedItem[] }> {
  const { data, error } = await supabase.functions.invoke<{
    channelTitle: string;
    channelId: string;
    items: FeedItem[];
  }>("news-youtube-channel", { body: opts });
  if (error) throw new Error(extractErr(error, "Channel fetch failed."));
  if (!data) throw new Error("Channel returned empty.");
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
  main: {
    title: string;
    siteName?: string | null;
    contentMd?: string | null;
    excerpt?: string | null;
  };
  related: Array<{
    title: string;
    url: string;
    siteName?: string | null;
    excerpt?: string | null;
    contentMd?: string | null;
  }>;
  model?: string;
}): Promise<CompareResult> {
  const { data, error } = await supabase.functions.invoke<CompareResult>("news-compare", {
    body: opts,
  });
  if (error) throw new Error(extractErr(error, "AI compare failed."));
  if (!data) throw new Error("Compare returned empty.");
  return data;
}

// ─────────── Telegram-ready Persian post ───────────

export interface TelegramFormatResult {
  title: string;
  markdown: string;
  html: string;
  plain: string;
  model: string;
}

export async function formatForTelegram(opts: {
  title: string;
  contentMd?: string | null;
  contentFa?: string | null;
  url?: string;
  siteName?: string | null;
  model?: string;
}): Promise<TelegramFormatResult> {
  const { data, error } = await supabase.functions.invoke<TelegramFormatResult>(
    "news-telegram-format",
    { body: opts },
  );
  if (error) throw new Error(extractErr(error, "AI format failed."));
  if (!data) throw new Error("Format returned empty.");
  return data;
}

// ─────────── Helpers ───────────

function extractErr(error: unknown, fallback: string): string {
  try {
    if (typeof error === "string") return error || fallback;
    if (error instanceof Error) return error.message || fallback;
    const msg = (error as { message?: string }).message;
    return msg || fallback;
  } catch {
    return fallback;
  }
}
