/**
 * Generate an AI digest from a list of news articles.
 *
 * Body: {
 *   articles: Array<{ title: string; url: string; siteName?: string;
 *                     excerpt?: string; contentMd?: string;
 *                     publishedAt?: string }>;
 *   length: 'short' | 'long';
 *   topic?: string;
 *   windowHours?: number;
 * }
 *
 * Returns: { title, contentMd, contentHtml, wordCount, model }
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_MODEL = "google/gemini-3-flash-preview";
const ALLOWED_MODELS = new Set([
  "google/gemini-3-flash-preview",
  "google/gemini-3.1-flash-lite-preview",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
]);

const SYSTEM_PROMPT = `You are an award-winning English-language FEATURE WRITER (think long-form magazine: The Atlantic, The New Yorker, Wired) ghostwriting for an INTERMEDIATE adult Iranian learner of English. You take one or more raw source reports (news article OR YouTube transcript) and turn them into ONE engaging, scannable, magazine-style feature — written entirely in the FIRST-PERSON VOICE OF THE ORIGINAL AUTHOR / REPORTER, as if they themselves sat down and wrote a proper piece about their own reporting.

Hard rules:
  1. FIRST-PERSON VOICE. Write as the author: "I", "we", "my", "in my view". NEVER use third-person framings like "the author says", "the reporter explains", "this article covers", "according to the source", "Reuters reported that", "the channel argues". BE the author.
  2. WRITE IN ENGLISH ONLY, in fluent first-person prose. Translate naturally from any source language while keeping intent and tone.
  3. CLARITY BEATS SOPHISTICATION. Use clear, modern, B1–B2 English. Prefer common words over rare or literary ones. Average sentence length ≤ 22 words. The reader is learning English — do not show off vocabulary.
  4. Never invent facts, numbers, names or quotes. Only use information present in the supplied articles. If something is unclear, omit it. Quotes from named third parties (officials, scientists, experts) are fine in quotation marks if they appear in the source.
  5. Do NOT cite sources inline ("Reuters reported", "[BBC](url)" etc). Speak directly as the author.
  6. ARTICLE SHAPE — HYBRID FEATURE + SCANNABLE. Always output this structure:
       - A bold, evocative **# Title** on the first line — a real headline that earns the click, not a label. Keep it under 12 words.
       - A one-line *italic TL;DR* in first person (≤ 22 words) that names the stakes.
       - **## Key Takeaways** as the second section — a tight bullet list of 3–5 punchy bullets (one line each, ≤ 16 words) so the reader gets the gist in 10 seconds.
       - A 2-paragraph LEDE that hooks the reader: open with a concrete scene, a number, a vivid detail or a sharp question — never with "In this article" or "Today I want to talk about". Frame the central question.
       - 5–9 **## H2 sections** with sharp thematic headlines (NOT "Introduction", "Section 1" — use real headlines like "## How the Money Actually Moves" or "## Why This Caught Me Off Guard").
       - Inside each H2 section, mostly write 2–4 paragraphs of 3–6 sentences each so ideas BUILD. WHERE IT GENUINELY HELPS (a short list of steps, a comparison, a set of examples), drop in a **compact bullet list of 3–5 items** — keep each bullet under 15 words. Do not bullet-ify everything; prose carries the argument.
       - Use a single **> blockquote** somewhere in the middle as a pull-quote: a short, punchy sentence that captures the central tension. One per article.
       - End with **## The Bottom Line** — 1 short paragraph (≤ 4 sentences) of personal synthesis, followed by 3 bullets answering "What I'd watch next".
  7. CONCEPTUAL THICKNESS WITHOUT DENSITY. Explain mechanisms, draw cause-and-effect, give one concrete example per abstract claim. Short paragraphs (max 6 sentences). Use transitions. Never write a wall of text.
  8. RHYTHM. Vary sentence length. Mix short, punchy sentences with one longer, descriptive sentence. Avoid "in conclusion" / "to summarise" tics. Don't repeat phrases between sections.
  9. Output VALID markdown only — no front-matter, no commentary about the task, no "Here is the article" preamble. Headings exactly as #, ##, ### — never bold-as-heading.

Always respond by calling the provided tool. Never reply with raw prose.`;

const LONG_INSTRUCTIONS =
  "Write a LONG hybrid feature of ~1100–1600 words. Follow the article-shape rules: # title, italic TL;DR, ## Key Takeaways (3–5 bullets), 2-paragraph lede, 5–7 thematic H2 sections (each 2–3 short paragraphs of 4–6 sentences, plus one compact bullet list where it helps), one blockquote pull-quote, and a closing ## The Bottom Line section. Scannable but substantive.";

const MAX_INSTRUCTIONS =
  "Write a MAXIMUM-LENGTH hybrid feature of ~2200–3000 words covering every distinct point. Follow the article-shape rules: # title, italic TL;DR, ## Key Takeaways (4–5 bullets), 2-paragraph lede, 7–10 thematic H2 sections (each 3–4 short paragraphs of 4–7 sentences + a compact bullet list where useful), ### sub-headings inside sections for natural sub-points, one blockquote pull-quote, and a closing ## The Bottom Line.";

const AUTO_MAX_INSTRUCTIONS =
  "Write the LONGEST DEPTH the source supports as a HYBRID magazine feature aiming for ~2800–4200 words. Cover every fact, sub-point, example, number, name, place and quote. Do NOT trim — expand. Follow the article-shape rules: # title, italic TL;DR, ## Key Takeaways (4–5 punchy bullets), 2-paragraph lede that frames stakes, 8–12 thematic H2 sections each with 3–5 short paragraphs of 4–7 sentences plus a compact bullet list (3–5 items) wherever a list genuinely helps (steps, comparisons, players, risks), ### sub-headings inside sections for natural sub-points, ONE blockquote pull-quote in the middle as the article's beating heart, and a closing ## The Bottom Line (1 paragraph + 3 'what I'd watch next' bullets). DEPTH REQUIREMENTS: (a) every abstract claim paired with at least one concrete example, number, or named person/place; (b) explain MECHANISM step by step; (c) explain IMPLICATIONS — short term, long term, winners, losers, what comes next; (d) explain BACKGROUND the reader needs; (e) for each major idea, briefly note the strongest counter-argument or limitation; (f) draw at least one ANALOGY. Each H2 introduces a distinct angle. Vary sentence length. No filler, no 'the author says' framings.";


// Legacy short fallback (kept so old clients don't 500).
const SHORT_INSTRUCTIONS =
  "Write a concise first-person article of ~320–450 words. Follow the article-shape rules at small scale: bold # title, italic TL;DR, a 1-paragraph lede, then 2–3 short thematic H2 sections of 1–2 paragraphs each, and a tight final ## Where I Land paragraph.";

/** Tiny markdown→HTML converter (mirror of news-scrape-article). */
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { articles, length = "long", topic, windowHours = 24, model: requestedModel } = await req.json();
    if (!Array.isArray(articles) || articles.length === 0) {
      return new Response(JSON.stringify({ error: "articles array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = (requestedModel && ALLOWED_MODELS.has(requestedModel))
      ? requestedModel
      : DEFAULT_MODEL;

    // Cap inputs so we stay within model context. For 'max'/'auto-max' allow more per article.
    const isHugeLength = length === "max" || length === "auto-max";
    const perArticleCap = isHugeLength ? 4500 : 1500;
    const maxArticles = isHugeLength ? 30 : 25;
    const compact = articles.slice(0, maxArticles).map((a: any) => ({
      title: String(a.title ?? "").slice(0, 250),
      url: String(a.url ?? ""),
      siteName: a.siteName ?? null,
      publishedAt: a.publishedAt ?? null,
      content: String(a.contentMd ?? a.excerpt ?? "").slice(0, perArticleCap),
    }));

    const instructions =
      length === "auto-max" ? AUTO_MAX_INSTRUCTIONS :
      length === "max" ? MAX_INSTRUCTIONS :
      length === "short" ? SHORT_INSTRUCTIONS :
      LONG_INSTRUCTIONS;

    const userPrompt = [
      instructions,
      "",
      `Topic / scope: ${topic ?? "general"}.`,
      `Window: last ${windowHours} hour(s).`,
      "",
      "ARTICLES (JSON):",
      "```json",
      JSON.stringify(compact, null, 2),
      "```",
    ].join("\n");

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "emit_digest",
                description: "Return the final digest.",
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Concise digest title (≤ 12 words)." },
                    markdown: { type: "string", description: "The full digest body in markdown." },
                  },
                  required: ["title", "markdown"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "emit_digest" } },
        }),
      },
    );

    if (!aiRes.ok) {
      const errBody = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errBody);
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Top up in workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: `AI gateway error (${aiRes.status})` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiData = await aiRes.json();
    const call =
      aiData?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!call) {
      console.error("No tool call in AI response", aiData);
      return new Response(JSON.stringify({ error: "AI returned no digest." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let parsed: { title: string; markdown: string };
    try {
      parsed = JSON.parse(call);
    } catch (e) {
      return new Response(JSON.stringify({ error: "AI output was not valid JSON." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = mdToHtml(parsed.markdown);
    const text = parsed.markdown.replace(/[#>*_`-]+/g, " ").replace(/\s+/g, " ").trim();

    return new Response(
      JSON.stringify({
        title: parsed.title,
        contentMd: parsed.markdown,
        contentHtml: html,
        wordCount: countWords(text),
        model,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("news-digest error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
