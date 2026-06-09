/**
 * Fetch and parse an RSS / Atom feed.
 *
 * Returns a normalized list of items: { title, url, excerpt, author,
 * publishedAt, imageUrl }. Used by the news reader to populate a feed
 * without needing Firecrawl (free + fast).
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface FeedItem {
  title: string;
  url: string;
  excerpt: string;
  author?: string;
  publishedAt?: string;
  imageUrl?: string;
  siteName?: string;
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

function pickAttr(xml: string, tag: string, attr: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*\\b${attr}=["']([^"']+)["']`, "i");
  const m = xml.match(re);
  return m ? m[1] : undefined;
}

function shouldTranslateTitle(title: string): boolean {
  const clean = (title ?? '').trim();
  if (!clean) return false;
  if (/^[\x00-\x7F\s.,:;!?"'()\-_/&%0-9]+$/.test(clean) && /[A-Za-z]{3,}/.test(clean)) return false;
  return /[^\x00-\x7F]/.test(clean) || !/[A-Za-z]{3,}/.test(clean);
}

async function translateTitles(items: FeedItem[]): Promise<FeedItem[]> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  const targets = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => shouldTranslateTitle(item.title));
  if (!apiKey || targets.length === 0) return items;

  try {
    const payload = targets.map(({ item, index }) => ({ id: index, title: item.title }));
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-lite-preview',
        messages: [
          {
            role: 'system',
            content: 'Translate non-English news headlines into natural concise English. If a title is already English, keep it nearly unchanged. Return JSON only via the provided tool.',
          },
          { role: 'user', content: JSON.stringify(payload) },
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
    if (!res.ok) return items;
    const json = await res.json();
    const argsStr = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) return items;
    const parsed = JSON.parse(argsStr);
    const map = new Map<number, string>();
    for (const row of parsed?.titles ?? []) {
      if (typeof row?.id === 'number' && typeof row?.title === 'string' && row.title.trim()) {
        map.set(row.id, row.title.trim());
      }
    }
    return items.map((item, index) => ({ ...item, title: map.get(index) ?? item.title }));
  } catch {
    return items;
  }
}

function parseFeed(xml: string): FeedItem[] {
  const isAtom = /<feed[\s>]/i.test(xml);
  const itemRe = isAtom
    ? /<entry[\s>][\s\S]*?<\/entry>/gi
    : /<item[\s>][\s\S]*?<\/item>/gi;
  const items: FeedItem[] = [];
  const blocks = xml.match(itemRe) ?? [];
  for (const block of blocks) {
    const title = stripTags(pick(block, "title") ?? "Untitled");
    let url = "";
    if (isAtom) {
      url = pickAttr(block, "link", "href") ?? "";
    } else {
      url = stripTags(pick(block, "link") ?? "");
    }
    if (!url) continue;
    const description =
      pick(block, "description") ??
      pick(block, "summary") ??
      pick(block, "content:encoded") ??
      pick(block, "content") ??
      "";
    const excerpt = stripTags(description).slice(0, 400);
    const author = stripTags(
      pick(block, "dc:creator") ?? pick(block, "author") ?? "",
    );
    const publishedAt =
      pick(block, "pubDate") ??
      pick(block, "published") ??
      pick(block, "updated") ??
      undefined;
    const sourceTag = pick(block, 'source') ?? '';
    const siteName = stripTags(sourceTag) || undefined;
    let imageUrl =
      pickAttr(block, "media:content", "url") ??
      pickAttr(block, "media:thumbnail", "url") ??
      pickAttr(block, "enclosure", "url");
    if (!imageUrl) {
      const m = description.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m) imageUrl = m[1];
    }
    items.push({
      title,
      url,
      excerpt,
      author: author || undefined,
      siteName,
      publishedAt: publishedAt
        ? new Date(publishedAt).toISOString()
        : undefined,
      imageUrl,
    });
  }
  return items;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { url, limit = 30 } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LovableNewsReader/1.0)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!resp.ok) {
      // Upstream feed unreachable (404/410/etc.) — return empty feed so the
      // client UI keeps working instead of surfacing a 502.
      console.warn(`news-fetch-rss: upstream ${resp.status} for ${url}`);
      return new Response(
        JSON.stringify({
          feedTitle: undefined,
          items: [],
          warning: `Feed unavailable (${resp.status})`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const xml = await resp.text();
    const items = await translateTitles(parseFeed(xml).slice(0, Math.max(1, Math.min(100, limit))));

    // Try to pick a feed-level title for nicer UI labels.
    const feedTitle =
      stripTags(
        pick(xml.replace(/<item[\s\S]*$/i, ""), "title") ??
          pick(xml.replace(/<entry[\s\S]*$/i, ""), "title") ??
          "",
      ) || undefined;

    return new Response(
      JSON.stringify({ feedTitle, items }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("news-fetch-rss error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
