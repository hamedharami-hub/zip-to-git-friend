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
    m = u.pathname.match(/^\/(@[A-Za-z0-9_.-]+)/);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
  const events: any[] = tt?.events ?? [];
  const lines: string[] = [];
  for (const e of events) {
    if (!e.segs) continue;
    const s = e.segs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
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

interface BilingualPhrase {
  phrase: string;
  meaning: string;
}

interface BilingualParagraph {
  en: string;
  fa: string;
  phrases: BilingualPhrase[];
}

interface BilingualSection {
  heading: string;
  headingFa: string;
  paragraphs: BilingualParagraph[];
  phrases: BilingualPhrase[];
}

interface BilingualArticle {
  title: string;
  titleFa: string;
  tldr: string;
  tldrFa: string;
  sections: BilingualSection[];
}

function toBase64(s: string): string {
  return btoa(encodeURIComponent(s)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function countWordsText(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface AiToolCall {
  name?: string;
  arguments?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface AiResponse {
  choices?: {
    message?: {
      content?: string;
      tool_calls?: AiToolCall[];
    };
  }[];
}

async function aiGatewayCall(apiKey: string, body: Record<string, unknown>): Promise<AiResponse> {
  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Rate limit exceeded. Try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Top up in workspace settings.");
    throw new Error(`AI gateway error (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as AiResponse;
}

function extractToolArgs(data: AiResponse, toolName: string): unknown {
  const calls = data.choices?.[0]?.message?.tool_calls;
  if (Array.isArray(calls)) {
    const call = calls.find((c) => c.function?.name === toolName || c.name === toolName);
    const args = call?.function?.arguments ?? call?.arguments;
    if (args) {
      try {
        return typeof args === "string" ? JSON.parse(args) : args;
      } catch {
        /* fall through */
      }
    }
  }
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim().startsWith("{")) {
    try {
      return JSON.parse(content);
    } catch {
      /* ignore */
    }
  }
  throw new Error(`AI returned no ${toolName} output.`);
}

function modeContext(mode: "youtube" | "youtube_meta" | "article"): string {
  if (mode === "youtube") {
    return "INPUT TYPE: YouTube video transcript (auto-captions). Rewrite it as the speaker's own first-person article, preserving all examples, numbers, and quotes.";
  }
  if (mode === "youtube_meta") {
    return "INPUT TYPE: YouTube video metadata only — no transcript was available. Write a first-person article AS THE CREATOR OF THIS VIDEO would have written it, based ONLY on the title, channel, and description. Do not invent specific facts beyond the description; instead expand naturally on the topic in the creator's own voice.";
  }
  return "INPUT TYPE: Web page content (markdown). Rewrite it as the original author's own article — clean, polished, comprehensive.";
}

async function aiOutline(
  apiKey: string,
  source: {
    title: string;
    sourceUrl: string;
    rawText: string;
    mode: "youtube" | "youtube_meta" | "article";
  },
): Promise<{ title: string; sections: { heading: string; scope: string }[] }> {
  const system = `You are a careful editor planning a bilingual (English + Persian) feature article for an intermediate Iranian learner of English.

Your job is to outline the source material into clear, thematic sub-sections so that NO important facts are dropped when the article is rewritten.

Rules:
- Title: a sharp, curiosity-driven English headline (max ~12 words). Not a label like "Article" or "Report".
- 3–8 sections, each with a concrete, thematic English heading. Never generic headings like "Background", "Details", or "Conclusion".
- Each section must state its scope in 1–2 sentences: what concrete facts, numbers, names, quotes, or events it will cover.
- Preserve the narrative order of the source where it helps the reader follow the story.
- Do not write the body text, only the outline.
- Output JSON only, using the provided tool.`;

  const user = [
    modeContext(source.mode),
    `Source URL: ${source.sourceUrl}`,
    `Original title: ${source.title}`,
    "",
    "RAW INPUT:",
    "```",
    source.rawText.slice(0, 60_000),
    "```",
  ].join("\n");

  const data = await aiGatewayCall(apiKey, {
    model: AI_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "emit_outline",
          description: "Return the article outline.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              sections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    heading: { type: "string" },
                    scope: { type: "string" },
                  },
                  required: ["heading", "scope"],
                  additionalProperties: false,
                },
              },
            },
            required: ["title", "sections"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "emit_outline" } },
  });

  const args = extractToolArgs(data, "emit_outline") as {
    title: string;
    sections: { heading: string; scope: string }[];
  };
  if (!Array.isArray(args.sections) || args.sections.length === 0) {
    throw new Error("AI returned an empty outline.");
  }
  return args;
}

async function aiBilingualSections(
  apiKey: string,
  source: {
    title: string;
    sourceUrl: string;
    rawText: string;
    mode: "youtube" | "youtube_meta" | "article";
  },
  outline: { title: string; sections: { heading: string; scope: string }[] },
): Promise<BilingualArticle> {
  const modeNote = modeContext(source.mode);
  const system = `You are a top-tier English-language feature writer creating a bilingual article for an intermediate Iranian learner of English.

The source material has already been outlined. Expand every section into vivid, easy-to-read prose. The reader should NEVER feel that facts were skipped or summarised away.

${modeNote}

VOICE & STYLE:
- Warm, modern, conversational — a smart friend explaining the story over coffee.
- Short, active sentences. B1 vocabulary. Pick the everyday word: "use" not "utilise", "help" not "facilitate", "about" not "regarding".
- Be concrete: numbers, names, places, and direct quotes must be preserved exactly. Never invent facts.
- If a technical term is unavoidable, explain it in the same sentence in plain words.

BILINGUAL STRUCTURE — follow this order for the whole article:
- title: English headline (max ~12 words)
- titleFa: the same headline translated into natural Persian
- tldr: a one-line English summary of the whole story (≤ 25 words)
- tldrFa: Persian translation of the tldr
- sections: array of sections. For each section:
  - heading: the English section heading from the outline
  - headingFa: natural Persian translation of the heading
  - paragraphs: an array of short paragraph objects. Each object has:
      - en: one English paragraph (1–3 short sentences, ≤ 220 characters, plain text, no markdown)
      - fa: the Persian translation of that same paragraph, natural and fluent
      - phrases: an array of key PHRASES or IDIOMS in this English paragraph that an intermediate learner might not know. Each phrase object has:
          - phrase: the exact English phrase as it appears in the paragraph (multi-word, not single words)
          - meaning: a short Persian explanation/translation
        Leave this array EMPTY unless the paragraph genuinely contains a useful phrase or idiom. Do NOT list single vocabulary words.
  - phrases: aggregate all the phrase objects from the paragraphs in this section. Keep each phrase only once.

HARD RULES:
1. Each English paragraph MUST be ≤ 220 characters and plain text (no markdown, no bullets).
2. The Persian translation must correspond sentence-for-sentence to the English paragraph.
3. Do NOT list single vocabulary words in phrases. Only multi-word expressions, collocations, or idioms.
4. Preserve EVERY concrete fact from the source: numbers, names, places, direct quotes.
5. Never invent facts, statistics, names, or quotes. If the source is vague, stay vague.
6. Output valid JSON only, using the provided tool. No preamble.`;

  const user = [
    `Source URL: ${source.sourceUrl}`,
    `Original title: ${source.title}`,
    "",
    "OUTLINE:",
    "```json",
    JSON.stringify(outline),
    "```",
    "",
    "RAW INPUT:",
    "```",
    source.rawText.slice(0, 60_000),
    "```",
  ].join("\n");

  const data = await aiGatewayCall(apiKey, {
    model: AI_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "emit_bilingual_article",
          description: "Return the full bilingual article.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              titleFa: { type: "string" },
              tldr: { type: "string" },
              tldrFa: { type: "string" },
              sections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    heading: { type: "string" },
                    headingFa: { type: "string" },
                    paragraphs: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          en: { type: "string" },
                          fa: { type: "string" },
                          phrases: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                phrase: { type: "string" },
                                meaning: { type: "string" },
                              },
                              required: ["phrase", "meaning"],
                              additionalProperties: false,
                            },
                          },
                        },
                        required: ["en", "fa", "phrases"],
                        additionalProperties: false,
                      },
                    },
                    phrases: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          phrase: { type: "string" },
                          meaning: { type: "string" },
                        },
                        required: ["phrase", "meaning"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["heading", "headingFa", "paragraphs", "phrases"],
                  additionalProperties: false,
                },
              },
            },
            required: ["title", "titleFa", "tldr", "tldrFa", "sections"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "emit_bilingual_article" } },
  });

  const args = extractToolArgs(data, "emit_bilingual_article") as BilingualArticle;
  if (!Array.isArray(args.sections) || args.sections.length === 0) {
    throw new Error("AI returned an empty bilingual article.");
  }
  return args;
}

function buildBilingualMdAndHtml(art: BilingualArticle): {
  contentMd: string;
  contentHtml: string;
  wordCount: number;
} {
  let wordCount = countWordsText(`${art.title} ${art.tldr}`);

  const mdParts: string[] = [`# ${art.title}`, "", `*${art.tldr}*`, ""];
  const htmlParts: string[] = [
    `<article>`,
    `<h1>${escapeHtml(art.title)}</h1>`,
    `<p><em>${escapeHtml(art.tldr)}</em></p>`,
  ];

  for (const section of art.sections) {
    mdParts.push(`## ${section.heading}`, "");
    htmlParts.push(`<section><h2>${escapeHtml(section.heading)}</h2>`);
    for (const para of section.paragraphs) {
      wordCount += countWordsText(para.en);
      mdParts.push(para.en, "");
      htmlParts.push(`<p>${escapeHtml(para.en)}</p>`);
    }

    const sectionPhrases = section.phrases?.length ? section.phrases : [];
    if (sectionPhrases.length > 0) {
      const phrasesJson = JSON.stringify(sectionPhrases);
      htmlParts.push(`<h3>Key phrases</h3>`, `<ul data-phrases-b64="${toBase64(phrasesJson)}">`);
      for (const ph of sectionPhrases) {
        htmlParts.push(
          `<li><strong>${escapeHtml(ph.phrase)}</strong> — ${escapeHtml(ph.meaning)}</li>`,
        );
      }
      htmlParts.push(`</ul>`);
    }
    htmlParts.push(`</section>`);
    mdParts.push("");
  }

  htmlParts.push(`</article>`);
  const payload = toBase64(JSON.stringify(art));
  htmlParts.push(`<script type="application/json" id="bilingual-data">${payload}</script>`);

  return {
    contentMd: mdParts.join("\n").trim(),
    contentHtml: htmlParts.join("\n").trim(),
    wordCount,
  };
}

async function generateBilingualArticle(
  apiKey: string,
  source: {
    title: string;
    sourceUrl: string;
    rawText: string;
    mode: "youtube" | "youtube_meta" | "article";
  },
): Promise<{ contentMd: string; contentHtml: string; title: string; wordCount: number }> {
  const outline = await aiOutline(apiKey, source);
  const art = await aiBilingualSections(apiKey, source, outline);
  const { contentMd, contentHtml, wordCount } = buildBilingualMdAndHtml(art);
  return { contentMd, contentHtml, title: art.title, wordCount };
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

  const out = await generateBilingualArticle(apiKey, {
    title: meta?.title ?? "YouTube video",
    sourceUrl: url,
    rawText: raw,
    mode,
  });

  const excerpt = out.contentMd
    .replace(/[#>*_`-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
  return {
    title: out.title,
    author: meta?.author ?? null,
    contentMd: out.contentMd,
    contentHtml: out.contentHtml,
    excerpt,
    imageUrl: meta?.thumbnail ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    siteName: "YouTube",
    language: "en",
    publishedAt: meta?.publishedAt ?? null,
    wordCount: out.wordCount,
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

  const out = await generateBilingualArticle(aiKey, {
    title: String(meta.title ?? meta.ogTitle ?? "Untitled"),
    sourceUrl: url,
    rawText: md,
    mode: "article",
  });

  const excerpt = out.contentMd
    .replace(/[#>*_`-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
  return {
    title: out.title,
    author: meta.author ?? meta.byline ?? null,
    contentMd: out.contentMd,
    contentHtml: out.contentHtml,
    excerpt,
    imageUrl: meta.ogImage ?? meta.image ?? null,
    siteName,
    language: "en",
    publishedAt: meta.publishedTime ?? meta.publishedAt ?? null,
    wordCount: out.wordCount,
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
