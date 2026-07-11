/**
 * Universal news/article importer.
 *
 * Accepts a single URL — auto-detects YouTube videos, YouTube channels,
 * and regular web pages. Always returns a clean, English, well-structured
 * article ready to render in the news reader.
 *
 * Body: { url: string }
 * Returns: { kind: 'youtube' | 'article', article: {...} }  on success
 *          or { kind: 'youtube_channel', channel: {...} }   when a channel URL is given
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

// ─────────── Helpers ───────────

function youtubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (/(^|\.)youtube\.com$/.test(u.hostname)) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/);
      if (m) return m[2];
    }
    return null;
  } catch {
    return null;
  }
}

function youtubeChannelHandle(
  url: string,
): { kind: "id" | "handle" | "user"; value: string } | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
    let m = u.pathname.match(/^\/channel\/(UC[\w-]{20,})/);
    if (m) return { kind: "id", value: m[1] };
    m = u.pathname.match(/^\/(@[A-Za-z0-9_.\-]+)/);
    if (m) return { kind: "handle", value: m[1] };
    m = u.pathname.match(/^\/user\/([^/]+)/);
    if (m) return { kind: "user", value: m[1] };
    m = u.pathname.match(/^\/c\/([^/]+)/);
    if (m) return { kind: "handle", value: "@" + m[1] };
    return null;
  } catch {
    return null;
  }
}

function mdToHtml(md: string): string {
  let s = md.replace(/\r\n/g, "\n").trim();
  const codeBlocks: string[] = [];
  s = s.replace(/```([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(code);
    return `\u0000CODE${codeBlocks.length - 1}\u0000`;
  });
  s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  s = s.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  s = s.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  s = s.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  s = s.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");
  s = s.replace(/^>\s?(.+)$/gm, "<blockquote>$1</blockquote>");
  s = s.replace(/(^(?:-|\*|\d+\.)\s+.+(?:\n(?:-|\*|\d+\.)\s+.+)*)/gm, (block) => {
    const ordered = /^\d+\./.test(block);
    const items = block
      .split("\n")
      .map((l) => l.replace(/^(?:-|\*|\d+\.)\s+/, "").trim())
      .filter(Boolean)
      .map((l) => `<li>${l}</li>`)
      .join("");
    return ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  const paragraphs = s.split(/\n{2,}/).map((p) => {
    const t = p.trim();
    if (!t) return "";
    if (/^<(h\d|ul|ol|blockquote|pre|p|table)/i.test(t)) return t;
    return `<p>${t.replace(/\n/g, "<br/>")}</p>`;
  });
  s = paragraphs.join("\n");
  s = s.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => {
    return `<pre><code>${codeBlocks[Number(i)]
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</code></pre>`;
  });
  return s;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ─────────── YouTube transcript ───────────

interface YtMeta {
  title: string;
  author: string;
  thumbnail: string;
  description: string;
  publishedAt: string | null;
}

async function fetchYoutubeMetadata(videoId: string): Promise<YtMeta | null> {
  try {
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        "https://www.youtube.com/watch?v=" + videoId,
      )}&format=json`,
    );
    if (!oembedRes.ok) return null;
    const o = await oembedRes.json();
    return {
      title: String(o.title ?? "YouTube video"),
      author: String(o.author_name ?? ""),
      thumbnail: String(o.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
      description: "",
      publishedAt: null,
    };
  } catch {
    return null;
  }
}

/** Fetch transcript via the public timedtext endpoint. Returns plain text or null. */
async function fetchYoutubeTranscript(
  videoId: string,
): Promise<{ text: string; lang: string } | null> {
  const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

  async function getTracks(): Promise<any[]> {
    // Strategy A: parse watch HTML
    try {
      const watchRes = await fetch(
        `https://www.youtube.com/watch?v=${videoId}&hl=en&bpctr=9999999999`,
        {
          headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
        },
      );
      if (watchRes.ok) {
        const html = await watchRes.text();
        const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var|<\/script>)/);
        if (m) {
          try {
            const player = JSON.parse(m[1]);
            const t = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
            if (t.length > 0) return t;
          } catch {
            /* noop */
          }
        }
      }
    } catch {
      /* noop */
    }

    // Strategy B: Innertube API (public web client)
    try {
      const ir = await fetch(
        "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": UA },
          body: JSON.stringify({
            videoId,
            context: {
              client: {
                clientName: "WEB",
                clientVersion: "2.20240101.00.00",
                hl: "en",
                gl: "US",
              },
            },
          }),
        },
      );
      if (ir.ok) {
        const j = await ir.json();
        const t = j?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
        if (t.length > 0) return t;
      }
    } catch {
      /* noop */
    }

    return [];
  }

  const tracks = await getTracks();
  if (tracks.length === 0) return null;

  // Prefer English; fall back to first or auto-translated to English.
  const preferred =
    tracks.find((t) => /^en/i.test(t.languageCode) && !t.kind) ??
    tracks.find((t) => /^en/i.test(t.languageCode)) ??
    tracks[0];
  let baseUrl: string = preferred.baseUrl;
  if (!/^en/i.test(preferred.languageCode)) baseUrl += "&tlang=en";
  const lang: string = preferred.languageCode ?? "unknown";

  const ttRes = await fetch(baseUrl + "&fmt=json3", { headers: { "User-Agent": UA } });
  if (!ttRes.ok) return null;
  const tt = await ttRes.json();
  const events: any[] = tt?.events ?? [];
  const lines: string[] = [];
  for (const e of events) {
    if (!e.segs) continue;
    const s = e.segs
      .map((x: any) => x.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (s) lines.push(s);
  }
  const text = lines.join("\n");
  if (!text.trim()) return null;
  return { text, lang };
}

// ─────────── AI rewrites ───────────

async function aiRewriteToArticle(
  apiKey: string,
  source: {
    title: string;
    author?: string;
    siteName?: string;
    rawText: string;
    sourceUrl: string;
    mode: "youtube" | "youtube_meta" | "article";
  },
): Promise<{ title: string; markdown: string }> {
  const system = `You are a ghostwriter. You take raw source material (a webpage, a transcript, a video description) and rewrite it as a comprehensive English feature article spoken in the FIRST-PERSON VOICE OF THE ORIGINAL AUTHOR / SPEAKER, as if they wrote the article themselves.

Hard rules:
1. FIRST-PERSON VOICE. Write as the author/speaker: "I", "we", "my", "in my view". NEVER use third-person framings like "the author says", "the host explains", "this person mentions", "in this article", "according to the speaker", "the channel argues", "this video covers", "the writer notes". Do NOT refer to the source as an external thing — BE the author.
2. ENGLISH ONLY — translate naturally from any source language while keeping the author's intent and tone.
3. Strip boilerplate: ads, sponsor reads, "like and subscribe", intros/outros, navigation, cookie banners, paywalls.
4. COMPREHENSIVE — keep every distinct point, example, number, name, place, quote, and argument from the source. Do not summarise away substance. Aim for ~700–1500 words depending on source length.
5. Fluent multi-sentence paragraphs (4–8 sentences). NO bullet lists, NO single-word lines. Smooth narrative flow with transitions.
6. Structure: a single H1 title (a real title, not "My article"), an italic one-line TL;DR written in the author's first-person voice, then 3–6 H2 sections (## Heading), each 1–2 substantial paragraphs. Close with a "## Final Thoughts" or "## Where I Land" paragraph in first person.
7. Never invent facts. If a detail is unclear, omit it. When the source quotes other people, you may quote them too — but YOUR narration stays first-person as the original author.
8. Preserve concrete details: numbers, names, places, direct quotes (in quotation marks).

Always respond by calling the provided tool. Never reply with prose.`;

  const user = [
    source.mode === "youtube"
      ? "INPUT TYPE: YouTube video transcript (auto-captions). Rewrite as the speaker's own first-person article."
      : source.mode === "youtube_meta"
        ? "INPUT TYPE: YouTube video metadata only — no transcript was available. Write a first-person article AS THE CREATOR OF THIS VIDEO would have written it, based ONLY on the title, channel, and description. Do not invent specific facts beyond the description; instead expand naturally on the topic in the creator's own voice ('In this piece I want to walk through …'). Never use phrases like 'in this video the channel explores' — speak as the creator."
        : "INPUT TYPE: Web page content (markdown). Rewrite it as the original author's own first-person article — clean, polished, comprehensive.",
    `Source URL: ${source.sourceUrl}`,
    source.author ? `Author / Channel: ${source.author}` : "",
    source.siteName ? `Site: ${source.siteName}` : "",
    `Original title: ${source.title}`,
    "",
    "RAW INPUT:",
    "```",
    source.rawText.slice(0, 60_000),
    "```",
  ]
    .filter(Boolean)
    .join("\n");

  const aiRes = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "emit_article",
            description: "Return the polished article.",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Polished English title (≤ 14 words)." },
                markdown: {
                  type: "string",
                  description: "Full article body in valid markdown, in English only.",
                },
              },
              required: ["title", "markdown"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "emit_article" } },
    }),
  });

  if (!aiRes.ok) {
    const body = await aiRes.text();
    if (aiRes.status === 429) throw new Error("Rate limit exceeded. Try again in a moment.");
    if (aiRes.status === 402)
      throw new Error("AI credits exhausted. Top up in workspace settings.");
    throw new Error(`AI gateway error (${aiRes.status}): ${body.slice(0, 200)}`);
  }
  const data = await aiRes.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returned no article.");
  return JSON.parse(args);
}

// ─────────── Handlers ───────────

interface ArticlePayload {
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

async function fetchYoutubeDescription(videoId: string): Promise<string> {
  try {
    const r = await fetch(
      "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          context: {
            client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en", gl: "US" },
          },
        }),
      },
    );
    if (!r.ok) return "";
    const j = await r.json();
    const desc =
      j?.videoDetails?.shortDescription ??
      j?.microformat?.playerMicroformatRenderer?.description?.simpleText ??
      "";
    return String(desc);
  } catch {
    return "";
  }
}

async function handleYoutube(
  url: string,
  videoId: string,
  apiKey: string,
): Promise<ArticlePayload> {
  const meta = await fetchYoutubeMetadata(videoId);
  const transcript = await fetchYoutubeTranscript(videoId);
  let raw = "";
  let mode: "youtube" | "youtube_meta" = "youtube";
  if (transcript && transcript.text.length >= 60) {
    raw = transcript.text;
  } else {
    // Fallback: title + description (better than failing).
    const desc = await fetchYoutubeDescription(videoId);
    const combined = [meta?.title, meta?.author ? `Channel: ${meta.author}` : "", desc]
      .filter(Boolean)
      .join("\n\n");
    if (combined.length < 40) {
      throw new Error(
        "This video has no captions and no usable description. Try a different video.",
      );
    }
    raw = combined;
    mode = "youtube_meta";
  }

  const { title, markdown } = await aiRewriteToArticle(apiKey, {
    title: meta?.title ?? "YouTube video",
    author: meta?.author,
    siteName: "YouTube",
    sourceUrl: url,
    rawText: raw,
    mode,
  });

  const html = mdToHtml(markdown);
  const text = markdown
    .replace(/[#>*_`-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    title,
    author: meta?.author ?? null,
    contentMd: markdown,
    contentHtml: html,
    excerpt: text.slice(0, 280),
    imageUrl: meta?.thumbnail ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    siteName: "YouTube",
    language: "en",
    publishedAt: meta?.publishedAt ?? null,
    wordCount: countWords(text),
  };
}

async function handleArticle(
  url: string,
  firecrawlKey: string,
  aiKey: string,
): Promise<ArticlePayload> {
  const fcRes = await fetch(`${FIRECRAWL_V2}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firecrawlKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  const data = await fcRes.json();
  if (!fcRes.ok) {
    if (fcRes.status === 402) throw new Error("Firecrawl credits exhausted.");
    throw new Error(`Scrape failed (${fcRes.status}): ${data?.error ?? "unknown"}`);
  }
  const doc = data?.data ?? data;
  const md: string = doc?.markdown ?? "";
  const meta = doc?.metadata ?? {};
  if (!md.trim()) throw new Error("No content could be extracted from this URL.");

  const siteName = (() => {
    try {
      return meta.siteName ?? new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  })();

  const { title, markdown } = await aiRewriteToArticle(aiKey, {
    title: String(meta.title ?? meta.ogTitle ?? "Untitled"),
    author: meta.author ?? meta.byline ?? undefined,
    siteName: siteName ?? undefined,
    sourceUrl: url,
    rawText: md,
    mode: "article",
  });

  const html = mdToHtml(markdown);
  const text = markdown
    .replace(/[#>*_`-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    title,
    author: meta.author ?? meta.byline ?? null,
    contentMd: markdown,
    contentHtml: html,
    excerpt: text.slice(0, 280),
    imageUrl: meta.ogImage ?? meta.image ?? null,
    siteName,
    language: "en",
    publishedAt: meta.publishedTime ?? meta.publishedAt ?? null,
    wordCount: countWords(text),
  };
}

// ─────────── Server ───────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const aiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!aiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const url: string = (body?.url ?? "").trim();
    if (!url) {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Detect content type.
    const channel = youtubeChannelHandle(url);
    const ytId = youtubeVideoId(url);

    if (ytId) {
      const article = await handleYoutube(url, ytId, aiKey);
      return new Response(JSON.stringify({ kind: "youtube", article }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (channel) {
      // Defer to channel feed function via signal — client can call news-youtube-channel.
      return new Response(JSON.stringify({ kind: "youtube_channel", channel }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({
          error: "FIRECRAWL_API_KEY is not configured. Connect Firecrawl in Connectors.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const article = await handleArticle(url, firecrawlKey, aiKey);
    return new Response(JSON.stringify({ kind: "article", article }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("news-import-url error", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
