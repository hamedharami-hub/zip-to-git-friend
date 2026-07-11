/**
 * Discover RSS feeds for a topic.
 *
 * Returns the top publisher domains for the topic (Google News RSS), and
 * for each one, ALL discovered feed URLs (multiple sections — e.g. World,
 * Tech, Sports — are common). The Google News RSS for the topic is
 * always returned as the first row so users still have an "everything"
 * option.
 *
 * Body: { topic: string, region?: string, language?: string, limit?: number }
 * Returns: {
 *   googleNews: { name, url, articleCount },
 *   sites: Array<{ siteName, domain, articleCount, feeds: Array<{ name, url }> }>
 * }
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5",
  "Accept-Language": "en-AU,en;q=0.9",
};

function regionToParams(region?: string, language?: string) {
  const r = (region ?? "AU").toUpperCase();
  const lang = language ?? "en";
  const map: Record<string, { hl: string; gl: string; ceid: string }> = {
    AU: { hl: "en-AU", gl: "AU", ceid: "AU:en" },
    US: { hl: "en-US", gl: "US", ceid: "US:en" },
    GB: { hl: "en-GB", gl: "GB", ceid: "GB:en" },
    CA: { hl: "en-CA", gl: "CA", ceid: "CA:en" },
    NZ: { hl: "en-NZ", gl: "NZ", ceid: "NZ:en" },
    IN: { hl: "en-IN", gl: "IN", ceid: "IN:en" },
    IR: { hl: "fa", gl: "IR", ceid: "IR:fa" },
  };
  return map[r] ?? { hl: `${lang}-${r}`, gl: r, ceid: `${r}:${lang}` };
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}
function stripTags(html: string) {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}
function pick(xml: string, tag: string) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : undefined;
}

async function fetchText(url: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
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
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] },
    });
    clearTimeout(t);
    return res.url || url;
  } catch {
    return url;
  }
}

interface SourceCandidate {
  domain: string;
  siteName: string;
  homepage: string;
  articleCount: number;
}

async function gatherTopDomains(opts: {
  topic: string;
  region?: string;
  language?: string;
}): Promise<SourceCandidate[]> {
  const { hl, gl, ceid } = regionToParams(opts.region, opts.language);
  const q = encodeURIComponent(opts.topic);
  const rssUrl = `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
  const xml = await fetchText(rssUrl);
  if (!xml) return [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const counts = new Map<string, SourceCandidate>();
  const limited = blocks.slice(0, 60);
  const items = await Promise.all(
    limited.map(async (block) => {
      const link = stripTags(pick(block, "link") ?? "");
      const sourceTag = pick(block, "source") ?? "";
      const siteName = stripTags(sourceTag);
      const real = await resolveRealUrl(link);
      try {
        const u = new URL(real);
        return {
          domain: u.hostname.replace(/^www\./, ""),
          homepage: `${u.protocol}//${u.hostname}`,
          siteName: siteName || u.hostname.replace(/^www\./, ""),
        };
      } catch {
        return null;
      }
    }),
  );
  for (const it of items) {
    if (!it) continue;
    const prev = counts.get(it.domain);
    if (prev) prev.articleCount += 1;
    else counts.set(it.domain, { ...it, articleCount: 1 });
  }
  return Array.from(counts.values()).sort((a, b) => b.articleCount - a.articleCount);
}

const COMMON_FEED_PATHS = [
  "/feed",
  "/feed/",
  "/rss",
  "/rss/",
  "/feed.xml",
  "/rss.xml",
  "/index.xml",
  "/atom.xml",
  "/feeds/posts/default",
  "/rss/index.xml",
];

function looksLikeFeed(text: string) {
  return /<\s*(item|entry)\b/i.test(text) && /<\s*(rss|feed)\b/i.test(text);
}

async function validateFeed(url: string): Promise<{ ok: boolean; title?: string }> {
  const text = await fetchText(url, 4000);
  if (!text || !looksLikeFeed(text)) return { ok: false };
  const t = pick(text.slice(0, 4000), "title");
  return { ok: true, title: t ? stripTags(t) : undefined };
}

function discoverFeedsInHtml(
  html: string,
  baseUrl: string,
): Array<{ url: string; title?: string }> {
  const out: Array<{ url: string; title?: string }> = [];
  const re = /<link[^>]+rel=["'][^"']*alternate[^"']*["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    if (!/type=["'](application\/(rss|atom)\+xml|text\/xml)["']/i.test(tag)) continue;
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const titleMatch = tag.match(/title=["']([^"']+)["']/i);
    try {
      const abs = new URL(hrefMatch[1], baseUrl).toString();
      out.push({ url: abs, title: titleMatch?.[1] });
    } catch {
      /* skip */
    }
  }
  return out;
}

async function findAllFeedsFor(
  homepage: string,
  siteName: string,
): Promise<Array<{ name: string; url: string }>> {
  const seen = new Set<string>();
  const out: Array<{ name: string; url: string }> = [];

  // 1) homepage HTML — many sites declare multiple feeds via <link rel=alternate>.
  const html = await fetchText(homepage);
  if (html) {
    const found = discoverFeedsInHtml(html, homepage);
    const checks = await Promise.all(
      found.map(async (f) => {
        const v = await validateFeed(f.url);
        return v.ok ? { name: f.title || v.title || siteName, url: f.url } : null;
      }),
    );
    for (const c of checks) {
      if (c && !seen.has(c.url)) {
        seen.add(c.url);
        out.push(c);
      }
    }
  }

  // 2) common paths — fill in if homepage didn't expose anything.
  if (out.length === 0) {
    const candidates = COMMON_FEED_PATHS.map((p) => homepage.replace(/\/$/, "") + p);
    const checks = await Promise.all(
      candidates.map(async (u) => {
        const v = await validateFeed(u);
        return v.ok ? { name: v.title || siteName, url: u } : null;
      }),
    );
    for (const c of checks) {
      if (c && !seen.has(c.url)) {
        seen.add(c.url);
        out.push(c);
      }
    }
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const topic: string = String(body?.topic ?? "").trim();
    const region: string | undefined = body?.region;
    const language: string | undefined = body?.language;
    const limit: number = Math.max(1, Math.min(30, body?.limit ?? 20));

    if (!topic) {
      return new Response(JSON.stringify({ error: "topic is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { hl, gl, ceid } = regionToParams(region, language);
    const q = encodeURIComponent(topic);
    const googleNewsUrl = `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${gl}&ceid=${ceid}`;

    const domains = await gatherTopDomains({ topic, region, language });
    const top = domains.slice(0, limit);

    const sites = await Promise.all(
      top.map(async (d) => {
        const feeds = await findAllFeedsFor(d.homepage, d.siteName);
        if (feeds.length === 0) return null;
        return { siteName: d.siteName, domain: d.domain, articleCount: d.articleCount, feeds };
      }),
    );

    const valid = sites.filter((s): s is NonNullable<typeof s> => s !== null);

    return new Response(
      JSON.stringify({
        googleNews: { name: `Google News — ${topic}`, url: googleNewsUrl, articleCount: 0 },
        sites: valid,
        topic,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("news-discover-rss error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
