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

/**
 * Resolve Google News (and other shortened/redirect) URLs to the actual
 * publisher URL by following redirects. Falls back to the input URL on
 * any error.
 */
async function resolveFinalUrl(url: string): Promise<string> {
  try {
    const isGoogleNews = /(?:^|\.)news\.google\.com\//i.test(url);
    if (!isGoogleNews) return url;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    // GET is more reliable than HEAD for Google News' JS-driven redirects.
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,*/*" },
    });
    clearTimeout(t);
    let finalUrl = res.url || url;

    // Google News sometimes returns an HTML interstitial with a meta refresh
    // or JS rewrite — try to extract the canonical link.
    if (/news\.google\.com/i.test(finalUrl)) {
      try {
        const html = await res.text();
        const meta =
          html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+url=([^"'>\s]+)/i)?.[1] ??
          html.match(/data-n-au=["']([^"']+)["']/i)?.[1] ??
          html.match(/href=["'](https?:\/\/(?!news\.google\.com)[^"']+)["']/i)?.[1];
        if (meta) finalUrl = meta;
      } catch { /* ignore */ }
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
  const system = `You are a senior English-language news editor and language-learning curator.

You will receive raw markdown extracted from a news/article webpage. Produce a polished ENGLISH version ready for a learner.

Rules:
1. ENGLISH ONLY — translate from any source language. Never include the original language in the output.
2. Strip boilerplate at the start/end: cookie banners, navigation, "subscribe to our newsletter", related-article lists, ads, social share prompts, comment sections.
3. Fix grammar and obvious typos. Keep meaning faithful.
4. Structure with markdown: a single H1 title, optional 2–4 H2 sub-sections for longer pieces, well-formed paragraphs.
5. End with a short "## Conclusion" paragraph (2–3 sentences) summarising the takeaway.
6. Do NOT invent facts. Only use information present in the input.
7. Preserve concrete details: numbers, names, places, quotes.

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
  ].filter(Boolean).join("\n");

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
    try { siteName = new URL(finalUrl).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
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
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: resolve any redirect (Google News, t.co, lnkd.in, etc.).
    const finalUrl = await resolveFinalUrl(url);

    if (!apiKey) {
      // No Firecrawl key configured — return graceful fallback rather than 500.
      return new Response(
        JSON.stringify(buildFallback({
          url, finalUrl, fallbackExcerpt, fallbackImageUrl, fallbackSiteName,
          reason: "Firecrawl is not configured.",
        })),
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
        JSON.stringify(buildFallback({
          url, finalUrl, fallbackExcerpt, fallbackImageUrl, fallbackSiteName,
          reason: "Network error contacting Firecrawl.",
        })),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await fcRes.json().catch(() => ({}));
    if (!fcRes.ok) {
      console.error("Firecrawl scrape failed", fcRes.status, data);
      // Graceful fallback for blocked/forbidden/payment errors so the UI
      // can render the RSS excerpt + image instead of an error screen.
      return new Response(
        JSON.stringify(buildFallback({
          url, finalUrl, fallbackExcerpt, fallbackImageUrl, fallbackSiteName,
          reason: data?.error ?? `Firecrawl ${fcRes.status}`,
        })),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const doc = data?.data ?? data;
    const md: string = doc?.markdown ?? "";
    const meta = doc?.metadata ?? {};

    // If Firecrawl returned essentially no content, fallback gracefully.
    if (!md || md.trim().length < 80) {
      return new Response(
        JSON.stringify(buildFallback({
          url, finalUrl, fallbackExcerpt, fallbackImageUrl, fallbackSiteName,
          reason: "Publisher returned no readable content.",
        })),
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
        const out = await aiCleanAndTranslate(aiKey, {
          title: finalTitle,
          author: meta.author ?? meta.byline ?? undefined,
          siteName: siteName ?? undefined,
          markdown: md,
          sourceUrl: finalUrl,
        });
        finalTitle = out.title;
        finalMd = out.markdown;
        language = "en";
      } catch (e) {
        console.error("AI rewrite skipped:", e);
      }
    }

    const text = finalMd.replace(/[#>*_`-]+/g, " ").replace(/\s+/g, " ").trim();

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
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("news-scrape-article error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
