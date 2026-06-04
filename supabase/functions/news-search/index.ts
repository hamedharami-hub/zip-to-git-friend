/**
 * Search recent news on a topic (or restricted to a single site).
 *
 * Strict RAG strategy (no AI-invented URLs):
 *   1) Build a Google News RSS query URL (supports `site:` operator).
 *   2) Fetch + parse XML natively to get REAL link/title/pubDate/source.
 *   3) Strict date filter using `hours` (default 168h / 1 week).
 *   4) Resolve Google News redirect URLs to publisher URLs.
 *   5) Use Gemini ONLY to write a 2-sentence excerpt per article. The model
 *      receives titles + snippets only and is forbidden from inventing URLs.
 *
 * If FIRECRAWL_API_KEY is set, Firecrawl is tried first (it returns real
 * crawled URLs as well), and falls back to the RSS pipeline on any error.
 *
 * Body: { query?: string, site?: string, hours?: number, limit?: number, language?: string, region?: string }
 * Returns: { items: Array<{ title, url, excerpt, siteName, publishedAt? }>, source }
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

function tbsForHours(hours?: number): string | undefined {
  if (!hours) return undefined;
  if (hours <= 1) return "qdr:h";
  if (hours <= 24) return "qdr:d";
  if (hours <= 168) return "qdr:w";
  if (hours <= 720) return "qdr:m";
  return "qdr:y";
}

interface SearchItem {
  title: string;
  url: string;
  excerpt: string;
  siteName?: string;
  publishedAt?: string;
}

function siteFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

// ───────────────────── Google News RSS pipeline ─────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function pick(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : undefined;
}

function regionToParams(region?: string, language?: string): {
  hl: string;
  gl: string;
  ceid: string;
} {
  const r = (region ?? "AU").toUpperCase();
  const lang = language ?? "en";
  const map: Record<string, { hl: string; gl: string; ceid: string }> = {
    AU: { hl: "en-AU", gl: "AU", ceid: "AU:en" },
    US: { hl: "en-US", gl: "US", ceid: "US:en" },
    GB: { hl: "en-GB", gl: "GB", ceid: "GB:en" },
    UK: { hl: "en-GB", gl: "GB", ceid: "GB:en" },
    CA: { hl: "en-CA", gl: "CA", ceid: "CA:en" },
    NZ: { hl: "en-NZ", gl: "NZ", ceid: "NZ:en" },
    IN: { hl: "en-IN", gl: "IN", ceid: "IN:en" },
    IR: { hl: "fa", gl: "IR", ceid: "IR:fa" },
  };
  if (map[r]) return map[r];
  return { hl: `${lang}-${r}`, gl: r, ceid: `${r}:${lang}` };
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  Accept:
    "application/rss+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5",
  "Accept-Language": "en-AU,en;q=0.9",
  "Accept-Encoding": "gzip, deflate",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

async function fetchRssXml(url: string, retries = 3): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (res.ok) {
        const text = await res.text();
        if (text && text.includes("<item")) return text;
      } else {
        console.warn(`RSS attempt ${i + 1} failed: ${res.status}`);
      }
    } catch (e) {
      console.warn(`RSS attempt ${i + 1} error:`, e);
    }
    await new Promise((r) => setTimeout(r, 300 + i * 400));
  }
  return null;
}

function buildRssSearchUrl(opts: {
  query?: string;
  site?: string;
  region?: string;
  language?: string;
}): string {
  const { hl, gl, ceid } = regionToParams(opts.region, opts.language);
  const parts: string[] = [];
  if (opts.query && opts.query.trim()) parts.push(opts.query.trim());
  if (opts.site) {
    const s = opts.site.replace(/^https?:\/\//, "").replace(/\/$/, "");
    parts.push(`site:${s}`);
  }
  const q = encodeURIComponent(parts.join(" ").trim() || "news");
  return `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
}

interface RawRssItem extends SearchItem {
  publishedAtMs: number;
}

function parseRssItems(xml: string): RawRssItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const out: RawRssItem[] = [];
  for (const block of blocks) {
    const title = stripTags(pick(block, "title") ?? "");
    const link = stripTags(pick(block, "link") ?? "");
    if (!title || !link) continue;
    const description = pick(block, "description") ?? "";
    const excerpt = stripTags(description).slice(0, 400);
    const sourceTag = pick(block, "source") ?? "";
    const sourceName = stripTags(sourceTag);
    const pubDateRaw = pick(block, "pubDate") ?? "";
    const ms = pubDateRaw ? Date.parse(pubDateRaw) : NaN;
    if (!Number.isFinite(ms)) continue;
    out.push({
      title,
      url: link,
      excerpt,
      siteName: sourceName || siteFromUrl(link),
      publishedAt: new Date(ms).toISOString(),
      publishedAtMs: ms,
    });
  }
  return out;
}

async function resolveRealUrl(url: string, timeoutMs = 4000): Promise<string> {
  if (!/news\.google\.com\/rss\/articles/.test(url)) return url;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36" },
    });
    clearTimeout(t);
    return res.url || url;
  } catch {
    return url;
  }
}

async function summarizeWithGemini(opts: {
  apiKey: string;
  items: SearchItem[];
  model?: string;
}): Promise<Record<string, string>> {
  if (opts.items.length === 0) return {};
  const list = opts.items.map((it, i) => ({
    id: i,
    title: it.title,
    snippet: it.excerpt,
    siteName: it.siteName ?? "",
  }));

  const systemPrompt =
    "You are an analyzer. DO NOT invent URLs and DO NOT search the web. " +
    "You will be given a list of news articles (id, title, snippet). " +
    "For each item, write a concise 2-sentence neutral summary in English. " +
    "Return ONLY JSON via the provided tool — never free text.";

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model || "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Summarize each article below. Preserve the integer id exactly.\n\n${JSON.stringify(list, null, 2)}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_summaries",
            description: "Return a 2-sentence excerpt per article id.",
            parameters: {
              type: "object",
              properties: {
                summaries: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      excerpt: { type: "string" },
                    },
                    required: ["id", "excerpt"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["summaries"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_summaries" } },
    }),
  });
  if (!res.ok) return {};
  const json = await res.json();
  const argsStr = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argsStr) return {};
  let parsed: any;
  try { parsed = JSON.parse(argsStr); } catch { return {}; }
  const map: Record<string, string> = {};
  for (const s of parsed?.summaries ?? []) {
    if (typeof s?.id === "number" && typeof s?.excerpt === "string") {
      map[String(s.id)] = s.excerpt;
    }
  }
  return map;
}

async function searchWithRss(opts: {
  query?: string;
  site?: string;
  hours: number;
  limit: number;
  language?: string;
  region?: string;
  lovableKey?: string;
}): Promise<SearchItem[]> {
  const url = buildRssSearchUrl(opts);
  const xml = await fetchRssXml(url);
  if (!xml) throw new Error(`RSS search failed after retries`);
  const all = parseRssItems(xml);
  const cutoff = Date.now() - opts.hours * 3600 * 1000;
  const fresh = all
    .filter((it) => it.publishedAtMs >= cutoff)
    .sort((a, b) => b.publishedAtMs - a.publishedAtMs)
    .slice(0, opts.limit);

  const resolved = await Promise.all(
    fresh.map(async (it) => {
      const real = await resolveRealUrl(it.url);
      return { ...it, url: real, siteName: it.siteName ?? siteFromUrl(real) };
    }),
  );

  let summaries: Record<string, string> = {};
  if (opts.lovableKey) {
    try {
      summaries = await summarizeWithGemini({ apiKey: opts.lovableKey, items: resolved });
    } catch (e) {
      console.warn("summarize error:", e);
    }
  }

  return resolved.map((it, i) => ({
    title: it.title,
    url: it.url,
    excerpt: summaries[String(i)] || it.excerpt || "",
    siteName: it.siteName,
    publishedAt: it.publishedAt,
  }));
}

// ───────────────────── Firecrawl pipeline (optional first-try) ─────────────────────

async function searchWithFirecrawl(opts: {
  apiKey: string;
  finalQuery: string;
  hours?: number;
  limit: number;
  language?: string;
}): Promise<SearchItem[]> {
  const fcRes = await fetch(`${FIRECRAWL_V2}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: opts.finalQuery,
      limit: Math.max(1, Math.min(30, opts.limit)),
      tbs: tbsForHours(opts.hours),
      lang: opts.language,
    }),
  });
  const data = await fcRes.json();
  if (!fcRes.ok) {
    const err = new Error(data?.error ?? `Firecrawl search failed (${fcRes.status})`);
    (err as any).status = fcRes.status;
    throw err;
  }
  const raw: any[] =
    (Array.isArray(data?.data) && data.data) ||
    data?.web?.results ||
    data?.web ||
    [];
  return raw
    .filter((r) => r?.url || r?.link)
    .map((r) => ({
      title: String(r.title ?? r.url ?? "Untitled"),
      url: String(r.url ?? r.link),
      excerpt: String(r.description ?? r.snippet ?? "").slice(0, 400),
      siteName: siteFromUrl(r.url ?? r.link),
    }));
}

// ───────────────────── Handler ─────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const {
      query,
      site,
      hours = 168,
      limit = 12,
      language,
      region,
      blockedDomains = [],
    } = body ?? {};
    const blockedSet = new Set<string>(
      (Array.isArray(blockedDomains) ? blockedDomains : [])
        .map((d: string) => String(d ?? '').toLowerCase().replace(/^www\./, '').trim())
        .filter(Boolean),
    );
    const isBlocked = (url: string) => {
      const host = siteFromUrl(url)?.toLowerCase() ?? '';
      if (!host) return false;
      for (const b of blockedSet) {
        if (host === b || host.endsWith('.' + b)) return true;
      }
      return false;
    };

    if ((!query || typeof query !== "string") && !site) {
      return new Response(JSON.stringify({ error: "query or site is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const finalQuery = site
      ? `${query ? query + " " : ""}site:${site.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
      : query;

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    let items: SearchItem[] = [];
    let usedSource: "firecrawl" | "google-news-rss" = "google-news-rss";
    let firecrawlError: string | null = null;

    if (firecrawlKey) {
      try {
        items = await searchWithFirecrawl({
          apiKey: firecrawlKey,
          finalQuery,
          hours,
          limit,
          language,
        });
        usedSource = "firecrawl";
      } catch (e: any) {
        firecrawlError = e?.message ?? "Firecrawl error";
        console.warn("Firecrawl failed, falling back to Google News RSS:", firecrawlError);
        items = [];
      }
    }

    if (items.length === 0) {
      items = await searchWithRss({
        query,
        site,
        hours,
        limit,
        language,
        region,
        lovableKey,
      });
      usedSource = "google-news-rss";
    }

    if (blockedSet.size > 0) {
      items = items.filter((it) => !isBlocked(it.url));
    }

    // Always return 200 with items (possibly empty). The client decides how to display.
    return new Response(
      JSON.stringify({
        items,
        source: usedSource,
        warning: items.length === 0
          ? (firecrawlError ? `جستجو نتیجه نداشت (${firecrawlError})` : "نتیجه‌ای یافت نشد.")
          : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("news-search error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
