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
    const items = parseFeed(xml).slice(0, Math.max(1, Math.min(100, limit)));

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
