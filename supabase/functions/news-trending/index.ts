/**
 * Trending news headlines via Google News RSS (RAG approach).
 *
 * Architecture:
 *   1) Fetch live XML from Google News RSS for the topic + region.
 *   2) Parse XML natively (no AI). Extract real link/title/pubDate/source.
 *   3) Strict date filter: discard anything older than `hours` (default 48h).
 *   4) Resolve Google News redirect URLs to the real publisher URLs.
 *   5) Pass ONLY the validated titles + snippets to Gemini for a 2-sentence
 *      summary. The model is forbidden from inventing URLs — it must echo
 *      the link/title we gave it and only add `excerpt`.
 *
 * Body: { topic?: string, region?: string, language?: string, limit?: number, hours?: number }
 * Returns: { items: Array<{ title, url, excerpt, siteName, publishedAt }>, source: 'google-news-rss' }
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RawItem {
  title: string;
  url: string;
  excerpt: string;
  siteName?: string;
  publishedAt: string; // ISO
  publishedAtMs: number;
}

function shouldTranslateTitle(title: string): boolean {
  const clean = (title ?? '').trim();
  if (!clean) return false;
  if (/^[\x00-\x7F\s.,:;!?"'()\-_/&%0-9]+$/.test(clean) && /[A-Za-z]{3,}/.test(clean)) return false;
  return /[^\x00-\x7F]/.test(clean) || !/[A-Za-z]{3,}/.test(clean);
}

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

function siteFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * Region presets → (hl, gl, ceid). Default = Australia / English.
 */
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

function buildRssUrl(opts: { topic?: string; region?: string; language?: string }): string {
  const { hl, gl, ceid } = regionToParams(opts.region, opts.language);
  if (opts.topic && opts.topic.trim()) {
    const q = encodeURIComponent(opts.topic.trim());
    return `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
  }
  // Top stories for the region.
  return `https://news.google.com/rss?hl=${hl}&gl=${gl}&ceid=${ceid}`;
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

/**
 * Google News links go through a redirector
 * (`https://news.google.com/rss/articles/...`). Resolve to the real publisher
 * URL by following redirects with a HEAD/GET. Falls back to the original URL.
 */
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

function parseRssItems(xml: string): RawItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const out: RawItem[] = [];
  for (const block of blocks) {
    const title = stripTags(pick(block, "title") ?? "");
    const link = stripTags(pick(block, "link") ?? "");
    if (!title || !link) continue;
    const description = pick(block, "description") ?? "";
    const excerpt = stripTags(description).slice(0, 400);
    // Google News RSS includes <source url="...">Publisher</source>
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

async function summarizeWithGemini(opts: {
  apiKey: string;
  items: RawItem[];
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

  const userPrompt = `Summarize each article below. Preserve the integer id exactly.\n\n${JSON.stringify(list, null, 2)}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
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

  if (!res.ok) {
    const txt = await res.text();
    console.warn(`Gemini summarize failed (${res.status}): ${txt.slice(0, 200)}`);
    return {};
  }
  const json = await res.json();
  const argsStr = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argsStr) return {};
  let parsed: any;
  try {
    parsed = JSON.parse(argsStr);
  } catch {
    return {};
  }
  const map: Record<string, string> = {};
  for (const s of parsed?.summaries ?? []) {
    if (typeof s?.id === "number" && typeof s?.excerpt === "string") {
      map[String(s.id)] = s.excerpt;
    }
  }
  return map;
}

async function translateTitlesWithGemini(opts: {
  apiKey: string;
  items: RawItem[];
}): Promise<Record<string, string>> {
  const list = opts.items
    .map((it, i) => ({ id: i, title: it.title }))
    .filter((it) => shouldTranslateTitle(it.title));
  if (list.length === 0) return {};
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3.1-flash-lite-preview',
      messages: [
        { role: 'system', content: 'Translate non-English news headlines into concise natural English. Return JSON only via the tool.' },
        { role: 'user', content: JSON.stringify(list) },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'return_titles',
          description: 'Return English titles by id.',
          parameters: {
            type: 'object',
            properties: {
              titles: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { id: { type: 'integer' }, title: { type: 'string' } },
                  required: ['id', 'title'],
                  additionalProperties: false,
                },
              },
            },
            required: ['titles'],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'return_titles' } },
    }),
  });
  if (!res.ok) return {};
  const json = await res.json();
  const argsStr = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argsStr) return {};
  const parsed = JSON.parse(argsStr);
  const map: Record<string, string> = {};
  for (const row of parsed?.titles ?? []) {
    if (typeof row?.id === 'number' && typeof row?.title === 'string' && row.title.trim()) {
      map[String(row.id)] = row.title.trim();
    }
  }
  return map;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const topic: string | undefined = body?.topic;
    const region: string | undefined = body?.region;
    const language: string | undefined = body?.language;
    const limit: number = Math.max(1, Math.min(20, body?.limit ?? 10));
    const hours: number = Math.max(1, Math.min(720, body?.hours ?? 48));
    const blockedDomains: string[] = Array.isArray(body?.blockedDomains) ? body.blockedDomains : [];
    const blockedSet = new Set(
      blockedDomains.map((d) => String(d ?? '').toLowerCase().replace(/^www\./, '').trim()).filter(Boolean),
    );
    const isBlocked = (url: string) => {
      const host = siteFromUrl(url)?.toLowerCase() ?? '';
      if (!host) return false;
      for (const b of blockedSet) {
        if (host === b || host.endsWith('.' + b)) return true;
      }
      return false;
    };

    // 1) Fetch RSS (retry up to 3x; Google occasionally returns 503 for fresh IPs)
    const rssUrl = buildRssUrl({ topic, region, language });
    const xml = await fetchRssXml(rssUrl);
    if (!xml) {
      console.warn("news-trending: Google News RSS unreachable, returning empty list");
      return new Response(
        JSON.stringify({ items: [], warning: "Trending feed temporarily unavailable" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2) Parse
    const all = parseRssItems(xml);

    // 3) Strict date filter (hours)
    const cutoff = Date.now() - hours * 3600 * 1000;
    const fresh = all
      .filter((it) => it.publishedAtMs >= cutoff)
      .filter((it) => !isBlocked(it.url))
      .sort((a, b) => b.publishedAtMs - a.publishedAtMs)
      .slice(0, limit);

    if (fresh.length === 0) {
      return new Response(
        JSON.stringify({ items: [], source: "google-news-rss" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4) Resolve redirect URLs in parallel (best-effort)
    const resolved = await Promise.all(
      fresh.map(async (it) => {
        const realUrl = await resolveRealUrl(it.url);
        return { ...it, url: realUrl, siteName: it.siteName ?? siteFromUrl(realUrl) };
      }),
    );

    // 5) Summarize with Gemini (optional — only adds excerpts; never URLs)
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    let summaries: Record<string, string> = {};
    let translatedTitles: Record<string, string> = {};
    if (lovableKey) {
      try {
        summaries = await summarizeWithGemini({ apiKey: lovableKey, items: resolved });
      } catch (e) {
        console.warn("summarize error:", e);
      }
      try {
        translatedTitles = await translateTitlesWithGemini({ apiKey: lovableKey, items: resolved });
      } catch (e) {
        console.warn('title translate error:', e);
      }
    }

    const items = resolved.map((it, i) => ({
      title: translatedTitles[String(i)] || it.title,
      url: it.url,
      excerpt: summaries[String(i)] || it.excerpt || "",
      siteName: it.siteName,
      publishedAt: it.publishedAt,
    }));

    return new Response(JSON.stringify({ items, source: "google-news-rss" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("news-trending error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
