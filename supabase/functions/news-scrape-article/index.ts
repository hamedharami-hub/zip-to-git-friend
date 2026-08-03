/**
 * Scrape a single article URL via Firecrawl and clean/translate the
 * result with AI so the news reader always shows polished English text.
 *
 * Body: { url: string, rewrite?: boolean, fallbackExcerpt?: string,
 *         fallbackImageUrl?: string, fallbackSiteName?: string }
 *
 * Always returns 200 with a JSON body. On scrape failure (Google News
 * redirect resolved but the publisher blocks bots, Firecrawl 402/403,
 * etc.) we return `{ blocked: true, ...fallback fields }` so the
 * frontend can render a graceful fallback (image + RSS excerpt + link
 * to original) instead of an empty error state.
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

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
  const codeMarker = String.fromCharCode(0);
  const codeRe = new RegExp(`${codeMarker}CODE(\\d+)${codeMarker}`, "g");
  s = s.replace(codeRe, (_, i) => {
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

function extractUrl(input: string): string | undefined {
  const start = /https?:\/\//i.exec(input);
  if (!start) return undefined;
  const i = start.index + start[0].length;
  const stop = new Set(['"', "'", "<", ">", "\\"]);
  let j = i;
  while (j < input.length) {
    const ch = input[j];
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0x1f || cp === 0x7f || stop.has(ch) || /\s/.test(ch)) break;
    j++;
  }
  return input.slice(start.index, j);
}

/**
 * Decode a Google News article URL of the form
 *   https://news.google.com/rss/articles/CBMi....
 * Many of these embed the original publisher URL inside a base64-encoded
 * protobuf payload. We brute-scan the decoded bytes for an http(s):// URL.
 */
function decodeGoogleNewsUrl(url: string): string | null {
  try {
    const m = url.match(/news\.google\.com\/(?:rss\/)?articles\/([A-Za-z0-9_-]+)/i);
    if (!m) return null;
    let b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const str = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const um = extractUrl(str);
    if (!um) return null;
    const found = um.replace(/[^\w\-./?=&%#:+,;@~!$()*]+$/, "");
    if (!/^https?:\/\/[^/]+\.[^/]+/.test(found)) return null;
    if (/news\.google\.com/i.test(found)) return null;
    return found;
  } catch {
    return null;
  }
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Resolve a modern Google News article redirect by extracting the signed
 * batchexecute payload from the article page and calling Google's internal
 * Fbv4je rpc. This mirrors the resolution flow the Google News web app uses.
 */
async function resolveGoogleNewsUrl(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const pageRes = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,*/*" },
    });
    clearTimeout(t);
    if (!pageRes.ok) return null;
    const html = await pageRes.text();

    const match = html.match(/<c-wiz[^>]+data-p="([^"]+)"/i);
    if (!match) return null;

    let dataP = unescapeHtml(match[1]);
    if (dataP.startsWith("%.@.")) {
      dataP = dataP.replace("%.@.", '["garturlreq",');
    } else {
      return null;
    }
    if (!dataP.endsWith("]")) dataP += "]";

    const obj = JSON.parse(dataP);
    if (!Array.isArray(obj) || obj.length < 7) return null;
    const rpcInner = JSON.stringify([...obj.slice(0, -6), ...obj.slice(-2)]);
    const fReq = JSON.stringify([[["Fbv4je", rpcInner, "null", "generic"]]]);

    const body = new URLSearchParams({ "f.req": fReq });
    const postCtrl = new AbortController();
    const postT = setTimeout(() => postCtrl.abort(), 8000);
    const res = await fetch(
      "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je",
      {
        method: "POST",
        signal: postCtrl.signal,
        headers: {
          "User-Agent": BROWSER_UA,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Referer: "https://news.google.com/",
        },
        body,
      },
    );
    clearTimeout(postT);
    if (!res.ok) return null;

    let text = await res.text();
    if (text.startsWith(")]}'")) {
      text = text.slice(4);
    }
    text = text.trimStart();
    const firstNewline = text.indexOf("\n");
    const firstLine = firstNewline > 0 ? text.slice(0, firstNewline).trim() : "";
    if (/^\d+$/.test(firstLine)) {
      text = text.slice(firstNewline + 1);
    }

    const envelopes = JSON.parse(text);
    if (!Array.isArray(envelopes)) return null;
    for (const env of envelopes) {
      if (
        Array.isArray(env) &&
        env.length >= 3 &&
        env[0] === "wrb.fr" &&
        env[1] === "Fbv4je" &&
        typeof env[2] === "string"
      ) {
        const payload = JSON.parse(env[2]);
        if (
          Array.isArray(payload) &&
          payload.length >= 2 &&
          payload[0] === "garturlres" &&
          typeof payload[1] === "string" &&
          !/news\.google\.com/i.test(payload[1])
        ) {
          return payload[1];
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveFinalUrl(url: string): Promise<string> {
  const isGoogleNews = /(?:^|\.)news\.google\.com\//i.test(url);
  if (!isGoogleNews) return url;

  const decoded = decodeGoogleNewsUrl(url);
  if (decoded) return decoded;

  const via = await resolveGoogleNewsUrl(url);
  if (via) return via;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,*/*" },
    });
    clearTimeout(t);
    let finalUrl = res.url || url;
    if (/news\.google\.com/i.test(finalUrl)) {
      try {
        const html = await res.text();
        const meta =
          html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+url=([^"'>\s]+)/i)?.[1] ??
          html.match(/data-n-au=["']([^"']+)["']/i)?.[1] ??
          html.match(/href=["'](https?:\/\/(?!news\.google\.com)[^"']+)["']/i)?.[1];
        if (meta) finalUrl = meta;
      } catch {
        /* ignore */
      }
    }
    return finalUrl;
  } catch {
    return url;
  }
}

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

async function aiGatewayCall(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Rate limit exceeded. Try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    throw new Error(`AI gateway error (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

function extractToolArgs(data: Record<string, unknown>, toolName: string): unknown {
  const calls = ((data?.choices as unknown[])?.[0] as Record<string, unknown>)?.message?.tool_calls;
  if (Array.isArray(calls)) {
    const call = calls.find(
      (c: unknown) =>
        (c as Record<string, unknown>).function?.name === toolName ||
        (c as Record<string, unknown>).name === toolName,
    );
    const args =
      (call as Record<string, unknown>)?.function?.arguments ??
      (call as Record<string, unknown>)?.arguments;
    if (args) {
      try {
        return typeof args === "string" ? JSON.parse(args) : args;
      } catch {
        /* fall through */
      }
    }
  }
  // Fallback: some providers return the tool arguments directly in the message content.
  const content = ((data?.choices as unknown[])?.[0] as Record<string, unknown>)?.message?.content;
  if (typeof content === "string" && content.trim().startsWith("{")) {
    try {
      return JSON.parse(content);
    } catch {
      /* ignore */
    }
  }
  throw new Error(`AI returned no ${toolName} output.`);
}

async function aiOutline(
  apiKey: string,
  raw: { title: string; sourceUrl: string; markdown: string },
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
    `Source URL: ${raw.sourceUrl}`,
    `Original title: ${raw.title}`,
    "",
    "RAW MARKDOWN:",
    "```",
    raw.markdown.slice(0, 60_000),
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
  raw: { title: string; sourceUrl: string; markdown: string },
  outline: { title: string; sections: { heading: string; scope: string }[] },
): Promise<BilingualArticle> {
  const system = `You are a top-tier English-language feature writer creating a bilingual article for an intermediate Iranian learner of English.

The source material has already been outlined. Expand every section into vivid, easy-to-read prose. The reader should NEVER feel that facts were skipped or summarised away.

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
    `Source URL: ${raw.sourceUrl}`,
    `Original title: ${raw.title}`,
    "",
    "OUTLINE:",
    "```json",
    JSON.stringify(outline),
    "```",
    "",
    "RAW MARKDOWN:",
    "```",
    raw.markdown.slice(0, 60_000),
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

  // Build English markdown for TTS / raw copy / Telegram fallback.
  const mdParts: string[] = [`# ${art.title}`, "", `*${art.tldr}*`, ""];

  // Build HTML with a hidden bilingual-data payload and per-section phrase lists.
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
  raw: { title: string; sourceUrl: string; markdown: string },
): Promise<{ contentMd: string; contentHtml: string; title: string; wordCount: number }> {
  const outline = await aiOutline(apiKey, raw);
  const art = await aiBilingualSections(apiKey, raw, outline);
  const { contentMd, contentHtml, wordCount } = buildBilingualMdAndHtml(art);
  return { contentMd, contentHtml, title: art.title, wordCount };
}

function buildFallback(opts: {
  url: string;
  finalUrl: string;
  fallbackExcerpt?: string;
  fallbackImageUrl?: string;
  fallbackSiteName?: string;
  reason: string;
}) {
  const { finalUrl, fallbackExcerpt, fallbackImageUrl, fallbackSiteName, reason } = opts;
  let siteName = fallbackSiteName ?? null;
  if (!siteName) {
    try {
      siteName = new URL(finalUrl).hostname.replace(/^www\./, "");
    } catch {
      /* ignore */
    }
  }
  const excerpt = (fallbackExcerpt ?? "").trim();
  const md = excerpt
    ? `> ${excerpt}\n\n[ادامهٔ مطلب در سایت منبع](${finalUrl})`
    : `[این خبر را در سایت منبع بخوان](${finalUrl})`;
  return {
    blocked: true,
    blockedReason: reason,
    finalUrl,
    title: "",
    author: null,
    contentMd: md,
    contentHtml: mdToHtml(md),
    excerpt: excerpt || null,
    imageUrl: fallbackImageUrl ?? null,
    siteName,
    language: null,
    publishedAt: null,
    wordCount: countWords(excerpt),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    const aiKey = Deno.env.get("LOVABLE_API_KEY");
    const body = await req.json().catch(() => ({}));
    const url: string | undefined = body?.url;
    const rewrite: boolean = body?.rewrite !== false;
    const fallbackExcerpt: string | undefined = body?.fallbackExcerpt;
    const fallbackImageUrl: string | undefined = body?.fallbackImageUrl;
    const fallbackSiteName: string | undefined = body?.fallbackSiteName;

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: resolve any redirect (Google News, t.co, lnkd.in, etc.).
    const finalUrl = await resolveFinalUrl(url);

    if (!apiKey) {
      // No Firecrawl key configured — return graceful fallback rather than 500.
      return new Response(
        JSON.stringify(
          buildFallback({
            url,
            finalUrl,
            fallbackExcerpt,
            fallbackImageUrl,
            fallbackSiteName,
            reason: "Firecrawl is not configured.",
          }),
        ),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: scrape the resolved URL via Firecrawl.
    let fcRes: Response;
    try {
      fcRes = await fetch(`${FIRECRAWL_V2}/scrape`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: finalUrl, formats: ["markdown"], onlyMainContent: true }),
      });
    } catch (e) {
      console.error("Firecrawl network error", e);
      return new Response(
        JSON.stringify(
          buildFallback({
            url,
            finalUrl,
            fallbackExcerpt,
            fallbackImageUrl,
            fallbackSiteName,
            reason: "Network error contacting Firecrawl.",
          }),
        ),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await fcRes.json().catch(() => ({}));
    if (!fcRes.ok) {
      console.error("Firecrawl scrape failed", fcRes.status, data);
      // Graceful fallback for blocked/forbidden/payment errors so the UI
      // can render the RSS excerpt + image instead of an error screen.
      return new Response(
        JSON.stringify(
          buildFallback({
            url,
            finalUrl,
            fallbackExcerpt,
            fallbackImageUrl,
            fallbackSiteName,
            reason: data?.error ?? `Firecrawl ${fcRes.status}`,
          }),
        ),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const doc = data?.data ?? data;
    const md: string = doc?.markdown ?? "";
    const meta = doc?.metadata ?? {};

    // If Firecrawl returned essentially no content, fallback gracefully.
    if (!md || md.trim().length < 80) {
      return new Response(
        JSON.stringify(
          buildFallback({
            url,
            finalUrl,
            fallbackExcerpt,
            fallbackImageUrl,
            fallbackSiteName,
            reason: "Publisher returned no readable content.",
          }),
        ),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const siteName = (() => {
      try {
        return meta.siteName ?? new URL(finalUrl).hostname.replace(/^www\./, "");
      } catch {
        return fallbackSiteName ?? null;
      }
    })();

    let finalTitle = String(meta.title ?? meta.ogTitle ?? "Untitled");
    let finalMd = md;
    let language: string | null = meta.language ?? null;

    if (rewrite && aiKey && md.trim().length > 100) {
      try {
        const out = await generateBilingualArticle(aiKey, {
          title: finalTitle,
          sourceUrl: finalUrl,
          markdown: md,
        });
        finalTitle = out.title;
        finalMd = out.contentMd;
        language = "en";

        const result = {
          blocked: false,
          finalUrl,
          title: finalTitle,
          author: meta.author ?? meta.byline ?? null,
          contentMd: out.contentMd,
          contentHtml: out.contentHtml,
          excerpt:
            meta.description ??
            out.contentMd
              .replace(/[#>*_`-]+/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 280),
          imageUrl: meta.ogImage ?? meta.image ?? fallbackImageUrl ?? null,
          siteName,
          language,
          publishedAt: meta.publishedTime ?? meta.publishedAt ?? null,
          wordCount: out.wordCount,
        };
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        console.error("AI bilingual rewrite failed:", e);
      }
    }

    const text = finalMd
      .replace(/[#>*_`-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const result = {
      blocked: false,
      finalUrl,
      title: finalTitle,
      author: meta.author ?? meta.byline ?? null,
      contentMd: finalMd,
      contentHtml: mdToHtml(finalMd),
      excerpt: meta.description ?? text.slice(0, 280),
      imageUrl: meta.ogImage ?? meta.image ?? fallbackImageUrl ?? null,
      siteName,
      language,
      publishedAt: meta.publishedTime ?? meta.publishedAt ?? null,
      wordCount: countWords(text),
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("news-scrape-article error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
