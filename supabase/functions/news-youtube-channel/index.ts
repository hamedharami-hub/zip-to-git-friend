/**
 * Resolve a YouTube channel handle/URL into a feed of latest videos.
 *
 * YouTube exposes a public RSS feed for every channel:
 *   https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxxxxxx
 *
 * Body: { url?: string, channel?: { kind: 'id'|'handle'|'user', value: string } }
 * Returns: { channelTitle, channelId, items: FeedItem[] }
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FeedItem {
  title: string;
  url: string;
  excerpt: string;
  publishedAt?: string;
  imageUrl?: string;
  siteName?: string;
  author?: string;
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
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

async function resolveChannelId(channel: {
  kind: "id" | "handle" | "user";
  value: string;
}): Promise<string | null> {
  if (channel.kind === "id") return channel.value;
  // Scrape the channel page for the canonical channel_id.
  const path =
    channel.kind === "handle"
      ? `/${channel.value.startsWith("@") ? channel.value : "@" + channel.value}`
      : `/user/${channel.value}`;
  const res = await fetch(`https://www.youtube.com${path}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const m =
    html.match(/"channelId":"(UC[\w-]{20,})"/) ??
    html.match(/channel_id=([A-Za-z0-9_-]+)"/) ??
    html.match(/<meta itemprop="(?:channelId|identifier)" content="(UC[\w-]{20,})"/);
  return m ? m[1] : null;
}

function youtubeChannelHandle(url: string) {
  try {
    const u = new URL(url);
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
    let m = u.pathname.match(/^\/channel\/(UC[\w-]{20,})/);
    if (m) return { kind: "id" as const, value: m[1] };
    m = u.pathname.match(/^\/(@[A-Za-z0-9_.\-]+)/);
    if (m) return { kind: "handle" as const, value: m[1] };
    m = u.pathname.match(/^\/user\/([^/]+)/);
    if (m) return { kind: "user" as const, value: m[1] };
    m = u.pathname.match(/^\/c\/([^/]+)/);
    if (m) return { kind: "handle" as const, value: "@" + m[1] };
    return null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json();
    let channel = body?.channel as { kind: "id" | "handle" | "user"; value: string } | undefined;
    const url = body?.url as string | undefined;
    if (!channel && url) {
      const c = youtubeChannelHandle(url);
      if (!c) {
        return new Response(JSON.stringify({ error: "Not a YouTube channel URL." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      channel = c;
    }
    if (!channel) {
      return new Response(JSON.stringify({ error: "channel or url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const channelId = await resolveChannelId(channel);
    if (!channelId) {
      return new Response(JSON.stringify({ error: "Could not resolve channel id." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const fRes = await fetch(feedUrl);
    if (!fRes.ok) {
      return new Response(JSON.stringify({ error: `Channel feed fetch failed (${fRes.status})` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const xml = await fRes.text();
    const channelTitle = decode(
      pick(xml.replace(/<entry[\s\S]*$/, ""), "title") ?? "YouTube channel",
    );
    const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
    const items: FeedItem[] = [];
    for (const block of entries) {
      const title = decode(pick(block, "title") ?? "Untitled");
      const link = pickAttr(block, "link", "href");
      if (!link) continue;
      const author = decode(pick(block, "name") ?? "");
      const published = pick(block, "published");
      const description = decode(pick(block, "media:description") ?? pick(block, "summary") ?? "");
      const thumb =
        pickAttr(block, "media:thumbnail", "url") ??
        (() => {
          const v = link.match(/v=([\w-]{6,})/);
          return v ? `https://i.ytimg.com/vi/${v[1]}/hqdefault.jpg` : undefined;
        })();
      items.push({
        title,
        url: link,
        excerpt: description.slice(0, 400),
        author: author || undefined,
        publishedAt: published ? new Date(published).toISOString() : undefined,
        imageUrl: thumb,
        siteName: "YouTube",
      });
    }

    return new Response(JSON.stringify({ channelTitle, channelId, items }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("news-youtube-channel error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
