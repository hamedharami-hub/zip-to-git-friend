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

/**
 * Resolve a modern Google News article URL (`.../articles/CBMi...`) to the
 * original publisher URL. Post-2024 URLs require fetching the article landing
 * page to obtain a per-article signature (`data-n-a-sg`) and timestamp
 * (`data-n-a-ts`), then calling the `Fbv4je` batchexecute RPC.
 *
 * Based on the public "Resolve post-2024 style Google News article URLs"
 * approach (scott2b / google-news-url-decoder).
 */
async function resolveViaBatchExecute(articleUrl: string): Promise<string | null> {
  const articleId = articleUrl.match(/articles\/([A-Za-z0-9_-]+)/i)?.[1];
  if (!articleId) return null;

  let html: string;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(articleUrl, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,*/*",
        Referer: "https://news.google.com/",
      },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const sigMatch = html.match(/data-n-a-sg=["']([^"']+)["']/i);
  const tsMatch = html.match(/data-n-a-ts=["']([^"']+)["']/i);
  if (!sigMatch || !tsMatch) return null;
  const signature = sigMatch[1];
  const timestamp = tsMatch[1];

  try {
    const rpcInner = JSON.stringify([
      "garturlreq",
      [
        [
          "X",
          "X",
          ["X", "X"],
          null,
          null,
          1,
          1,
          "US:en",
          null,
          1,
          null,
          null,
          null,
          null,
          null,
          0,
          1,
        ],
        "X",
        "X",
        1,
        [1, 1, 1],
        1,
        1,
        null,
        0,
        0,
        null,
        0,
      ],
      articleId,
      Number(timestamp),
      signature,
    ]);

    const fReq = JSON.stringify([["Fbv4je", rpcInner, null, "generic"]]);
    const body = new URLSearchParams({ "f.req": fReq });

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je",
      {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "User-Agent": BROWSER_UA,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Referer: "https://news.google.com/",
        },
        body,
      },
    );
    clearTimeout(t);
    if (!res.ok) return null;

    let text = await res.text();
    if (text.startsWith(")]}'")) {
      text = text.split("\n").slice(1).join("\n");
    }
    text = text.trimStart();
    const lines = text.split("\n");
    if (/^\d+$/.test(lines[0]?.trim() ?? "")) {
      text = lines.slice(1).join("\n");
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
        if (payload && payload[0] === "garturlres" && typeof payload[1] === "string") {
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

  const viaBatch = await resolveViaBatchExecute(url);
  if (viaBatch) return viaBatch;

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

async function aiCleanAndTranslate(
  apiKey: string,
  raw: { title: string; author?: string; siteName?: string; markdown: string; sourceUrl: string },
): Promise<{ title: string; markdown: string }> {
  const system = `You are a top-tier English-language feature writer (think Vox, The Atlantic, Wired explainer pieces) rewriting raw web articles for an INTERMEDIATE adult Iranian learner of English. Your job is NOT to copy the source — it is to RETELL the story so it is vivid, crystal-clear, and genuinely fun to read. The reader should NEVER feel tired.

VOICE & STYLE — this is the most important part:
- Warm, modern, conversational. A smart friend explaining the news over coffee — never a press release, never Wikipedia, never a stiff bulletin.
- Open with a HOOK: a striking fact, a question, a tiny scene, or a surprising number. Never "In a recent development…" or "According to reports…".
- SHORT sentences. Average ≤ 15 words. Many sentences should be 6–10 words. Mix lengths for rhythm — one short sentence after a long one lands hard.
- SIMPLE words. Strict B1 vocabulary. Pick the everyday word over the fancy one: "use" not "utilise", "show" not "demonstrate", "help" not "facilitate", "start" not "commence", "about" not "regarding". If a technical term is unavoidable, explain it in the same sentence in plain words.
- Be concrete. Use small images, mini-examples, light analogies ("imagine a city the size of Tehran losing power for three days"). Show, don't summarise.
- Active voice. Strong verbs. Cut filler ("it is important to note that", "in order to", "due to the fact that", "needless to say").
- Sound human. An occasional rhetorical question or short aside is welcome — never overdone.

VISUAL READABILITY — the page must look inviting AND scannable at a glance:
- Use **bold** to highlight 2–4 key terms or numbers PER SECTION so the eye can scan (names, dates, key money figures, the core idea of a paragraph). Don't over-bold — only the things that matter most.
- Use the occasional > blockquote (1–2 lines) to spotlight a striking quote or a punchy takeaway. Max one blockquote per section, only when it genuinely lands.
- Keep paragraphs SHORT: 2–4 sentences each. Never a wall of text. White space is your friend.

STRUCTURE (follow this order exactly):
- Single # H1 title that is a real headline — punchy, curiosity-driven, max ~10 words. Never a label like "News Report" or "Article".
- One italic *TL;DR* line right under the title (≤ 25 words) capturing the core "so what".
- A "**Key points**" block right after the TL;DR: 3–5 short bullet lines (each ≤ 14 words, starting with a **bold noun phrase** followed by " — " and a plain-English micro-explanation). This is the ONLY place bullets are allowed and it is REQUIRED.
- A short LEDE paragraph (2–4 sentences) that hooks and frames the stakes.
- 3–6 ## H2 sections, each with a sharp thematic headline (e.g. "## How the Deal Actually Works", "## Why This Caught Everyone Off Guard") — never generic ("Background", "Details", "Conclusion"). Inside sections, use pure prose (no more bullets after the Key points block).
- Where the story has 3+ named people, orgs, numbers, or dates, add ONE optional "## The Cast" (or "## The Numbers" / "## The Timeline") mini-section as a short **bold-label — plain-explanation** paragraph list (still prose, no dash bullets) to help the reader keep track.
- Each H2 section is 2–4 SHORT paragraphs. Build ideas: context → mechanism → why it matters → concrete example.
- End with a final "## The Takeaway" section (1–2 short paragraphs) — what the reader should walk away knowing, in plain language.

HARD RULES:
1. ENGLISH ONLY. Translate from any source language. Never leave foreign words in the body.
2. Strip ALL boilerplate: cookie banners, navigation, "subscribe to our newsletter", related-article lists, ads, social prompts, comment sections, author bios, photo captions that aren't essential.
3. Fix grammar and typos. Preserve EVERY concrete fact: numbers, names, places, direct quotes (keep quotes in quotation marks). Do NOT drop details to sound cleaner.
4. NEVER invent facts, statistics, names, or quotes. If the source is vague, stay vague — don't fill gaps.
5. NO numbered lists. Bullets ONLY inside the "Key points" block described above — nowhere else. No single-sentence paragraphs as filler. NO "In conclusion" / "To summarise" tics.
6. Don't cite the source inline ("Reuters reported…"). Just tell the story.
7. Output valid markdown only. Headings exactly as #, ##. **bold** and > blockquote allowed as described above. No front-matter, no preamble like "Here is the article".

Always respond by calling the provided tool.`;

  const user = [
    `Source URL: ${raw.sourceUrl}`,
    raw.author ? `Author: ${raw.author}` : "",
    raw.siteName ? `Site: ${raw.siteName}` : "",
    `Original title: ${raw.title}`,
    "",
    "RAW MARKDOWN:",
    "```",
    raw.markdown.slice(0, 60_000),
    "```",
  ]
    .filter(Boolean)
    .join("\n");

  const aiRes = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
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
                title: { type: "string" },
                markdown: { type: "string" },
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
    if (aiRes.status === 402) throw new Error("AI credits exhausted.");
    throw new Error(`AI gateway error (${aiRes.status}): ${body.slice(0, 200)}`);
  }
  const data = await aiRes.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returned no article.");
  return JSON.parse(args);
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

async function tryJinaReader(
  url: string,
): Promise<{ title: string; markdown: string; publishedAt?: string } | null> {
  try {
    const target = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(target, {
      method: "GET",
      signal: ctrl.signal,
      headers: { "User-Agent": BROWSER_UA },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.trim().startsWith("{")) return null;

    const titleMatch = text.match(/^Title:\s*(.+)\n/);
    const timeMatch = text.match(/^Published Time:\s*(.+)\n/m);
    const marker = "\n\nMarkdown Content:\n";
    const idx = text.indexOf(marker);
    const markdown = idx >= 0 ? text.slice(idx + marker.length).trim() : text.trim();
    if (!markdown) return null;

    return {
      title: titleMatch?.[1]?.trim() || "Untitled",
      markdown,
      publishedAt: timeMatch?.[1]?.trim(),
    };
  } catch {
    return null;
  }
}

async function finalizeFromMarkdown(opts: {
  finalUrl: string;
  title: string;
  markdown: string;
  siteName?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  imageUrl?: string | null;
  fallbackImageUrl?: string;
  fallbackExcerpt?: string;
  rewrite: boolean;
  aiKey?: string;
}) {
  let finalTitle = opts.title;
  let finalMd = opts.markdown;
  let language: string | null = null;

  if (opts.rewrite && opts.aiKey && finalMd.trim().length > 100) {
    try {
      const out = await aiCleanAndTranslate(opts.aiKey, {
        title: finalTitle,
        author: opts.author ?? undefined,
        siteName: opts.siteName ?? undefined,
        markdown: finalMd,
        sourceUrl: opts.finalUrl,
      });
      finalTitle = out.title;
      finalMd = out.markdown;
      language = "en";
    } catch (e) {
      console.error("AI rewrite skipped:", e);
    }
  }

  const text = finalMd
    .replace(/[#>*_`-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    blocked: false,
    finalUrl: opts.finalUrl,
    title: finalTitle,
    author: opts.author ?? null,
    contentMd: finalMd,
    contentHtml: mdToHtml(finalMd),
    excerpt: (opts.fallbackExcerpt ?? "").trim() || text.slice(0, 280),
    imageUrl: opts.imageUrl ?? opts.fallbackImageUrl ?? null,
    siteName: opts.siteName ?? null,
    language,
    publishedAt: opts.publishedAt ?? null,
    wordCount: countWords(text),
  };
}

async function respondWithMarkdown(
  opts: Parameters<typeof finalizeFromMarkdown>[0],
): Promise<Response> {
  return new Response(JSON.stringify(await finalizeFromMarkdown(opts)), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    const siteName = (() => {
      try {
        return fallbackSiteName ?? new URL(finalUrl).hostname.replace(/^www\./, "");
      } catch {
        return fallbackSiteName ?? null;
      }
    })();

    if (!apiKey) {
      const jina = await tryJinaReader(finalUrl);
      if (jina) {
        return respondWithMarkdown({
          finalUrl,
          title: jina.title,
          markdown: jina.markdown,
          siteName,
          publishedAt: jina.publishedAt,
          fallbackImageUrl,
          fallbackExcerpt,
          rewrite,
          aiKey,
        });
      }
      // No Firecrawl key configured -- return graceful fallback rather than 500.
      return new Response(
        JSON.stringify(
          buildFallback({
            url,
            finalUrl,
            fallbackExcerpt,
            fallbackImageUrl,
            fallbackSiteName,
            reason: "Firecrawl is not configured and Jina Reader failed.",
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
      const jina = await tryJinaReader(finalUrl);
      if (jina) {
        return respondWithMarkdown({
          finalUrl,
          title: jina.title,
          markdown: jina.markdown,
          siteName,
          publishedAt: jina.publishedAt,
          fallbackImageUrl,
          fallbackExcerpt,
          rewrite,
          aiKey,
        });
      }
      return new Response(
        JSON.stringify(
          buildFallback({
            url,
            finalUrl,
            fallbackExcerpt,
            fallbackImageUrl,
            fallbackSiteName,
            reason: "Network error contacting Firecrawl and Jina Reader failed.",
          }),
        ),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await fcRes.json().catch(() => ({}));
    if (!fcRes.ok) {
      console.error("Firecrawl scrape failed", fcRes.status, data);
      const jina = await tryJinaReader(finalUrl);
      if (jina) {
        return respondWithMarkdown({
          finalUrl,
          title: jina.title,
          markdown: jina.markdown,
          siteName,
          publishedAt: jina.publishedAt,
          fallbackImageUrl,
          fallbackExcerpt,
          rewrite,
          aiKey,
        });
      }
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

    if (!md || md.trim().length < 80) {
      const jina = await tryJinaReader(finalUrl);
      if (jina) {
        return respondWithMarkdown({
          finalUrl,
          title: jina.title,
          markdown: jina.markdown,
          siteName,
          publishedAt: jina.publishedAt,
          fallbackImageUrl,
          fallbackExcerpt,
          rewrite,
          aiKey,
        });
      }
      return new Response(
        JSON.stringify(
          buildFallback({
            url,
            finalUrl,
            fallbackExcerpt,
            fallbackImageUrl,
            fallbackSiteName,
            reason: "Publisher returned no readable content and Jina Reader failed.",
          }),
        ),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return respondWithMarkdown({
      finalUrl,
      title: String(meta.title ?? meta.ogTitle ?? "Untitled"),
      markdown: md,
      siteName: meta.siteName || fallbackSiteName || null,
      author: meta.author ?? meta.byline ?? null,
      publishedAt: meta.publishedTime ?? meta.publishedAt ?? null,
      imageUrl: meta.ogImage ?? meta.image ?? null,
      fallbackImageUrl,
      fallbackExcerpt,
      rewrite,
      aiKey,
    });
  } catch (e) {
    console.error("news-scrape-article error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
