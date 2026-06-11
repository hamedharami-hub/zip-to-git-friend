/**
 * Rewrite a book chapter in different styles for language learners.
 *
 * Output is always English (matching the source book) so the learner can
 * still benefit from interactive vocabulary tools, but the chosen style
 * (summary, key points, simplified, …) makes it easier to digest.
 *
 * Returns: { html, text, model } via Lovable AI Gateway tool calling.
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "google/gemini-3-flash-preview";

const STYLE_INSTRUCTIONS: Record<string, string> = {
  short_summary:
    "Write a SHORT summary (≈ 120–180 words) of the chapter in clear modern English. Capture the central thesis and main moves, skip examples and side stories.",
  detailed_summary:
    "Write a DETAILED summary (≈ 350–600 words) of the chapter in clear modern English. Preserve every important argument, example, and conclusion in the original order. No fluff, no headings other than what the source uses.",
  key_points:
    "Distill the chapter into 6–12 KEY POINTS. Each point is one focused sentence in clear modern English. Keep the order of ideas from the chapter. Use a markdown bullet list.",
  simplified:
    "REWRITE the chapter in SIMPLIFIED English (CEFR B1 level). Same ideas, same order, but shorter sentences, common vocabulary, and no idioms. Length ≈ 60% of the original.",
 everyday_simple:
   "REWRITE the chapter in SIMPLE, EVERYDAY SPOKEN English (CEFR A2–B1) — the exact language a native speaker uses when CHATTING with friends, family or colleagues in daily life. VOCABULARY RULE: aggressively prefer the top ~2000 high-frequency everyday words. Replace any formal/academic/Latinate word with its everyday counterpart ('utilise' → 'use', 'purchase' → 'buy', 'commence' → 'start', 'demonstrate' → 'show', 'subsequently' → 'later', 'approximately' → 'about', 'numerous' → 'a lot of', 'attempt' → 'try', 'require' → 'need', 'assist' → 'help', 'sufficient' → 'enough'). PHRASAL VERBS & IDIOMS RULE: use the high-frequency phrasal verbs, idioms, collocations and discourse markers that show up in real conversation as often as the meaning allows (at least a handful per section): 'find out', 'turn out', 'come up with', 'figure out', 'end up', 'work out', 'set up', 'pull off', 'look into', 'put up with', 'on the other hand', 'at the end of the day', 'to be honest', 'the thing is', 'long story short', 'a big deal', 'keep an eye on', 'pretty much', 'kind of', 'a bunch of'. RHYTHM: short clear sentences (≤ 15 words on average), contractions ('it's', 'don't', 'we'll'). CRITICAL — DO NOT SUMMARISE OR SHORTEN. Preserve EVERY single fact, name, number, date, place, quote, example, statistic and idea in the same order. Output length ≥ original length (≥ 95% of original word count). Pure prose paragraphs, no headings beyond what the source uses, no bullet lists.",
 everyday_simple_b2:
   "REWRITE the chapter in CLEAR, NATURAL SPOKEN English (CEFR B1–B2) — the language a native speaker uses in real conversation. VOCABULARY RULE: prefer common, conversational words; drop formal/Latinate vocabulary when an everyday equivalent exists. PHRASAL VERBS & IDIOMS RULE: lean heavily on the high-frequency phrasal verbs, idioms, collocations and discourse markers from real conversation ('find out', 'turn out', 'end up', 'come up with', 'figure out', 'work out', 'set up', 'put up with', 'on the other hand', 'to be honest', 'the thing is', 'long story short', 'a big deal', 'keep an eye on', 'pretty much'). Use contractions throughout. CRITICAL — DO NOT SUMMARISE OR SHORTEN. Preserve EVERY fact, name, number, date, place, quote, example and idea in the original order. Output length ≥ original length (≥ 95% of original word count). Pure prose, no bullet lists.",
  key_quotes:
    "Extract 5–10 of the MOST POWERFUL or MOST QUOTABLE sentences from the chapter — verbatim, exactly as written. Render each as a markdown blockquote on its own line. After each quote add ONE short italic line (≤ 15 words) explaining why it matters.",
  review_questions:
    "Create 6–10 thought-provoking REVIEW QUESTIONS that check whether the reader understood the chapter. Mix factual recall and reflection. Use a markdown numbered list. Do not include answers.",
  vocabulary_list:
    "Identify 10–15 challenging or high-value words from the chapter. For each, provide the word, its part of speech, a simple definition in English, and a short example sentence based on the chapter context. Use a markdown table.",
  cultural_notes:
    "Identify 5–8 cultural, historical, or idiomatic references in the chapter that might be confusing to a non-native speaker. Explain each briefly in clear English. Use a markdown list.",
};

const SYSTEM_PROMPT = `You are an expert English-language editor helping an Iranian adult who is reading authentic English nonfiction to learn the language.

You will be given the full text of one chapter of a book and a STYLE. Your job:

  1. Produce the rewrite in clean modern ENGLISH (never Persian — the learner needs English input).
  2. Output BOTH a markdown version and a plain-text version of the same content.
  3. Preserve the author's intent and order of ideas. Never invent facts that are not in the source.
  4. Use clear paragraphs. Use bullets / blockquotes / headings ONLY when the style instructions ask for them.

Always respond by calling the provided tool. Never reply with prose.`;

const tools = [
  {
    type: "function",
    function: {
      name: "return_chapter_rewrite",
      description: "Return the rewritten chapter in markdown and plain text.",
      parameters: {
        type: "object",
        properties: {
          markdown: {
            type: "string",
            description:
              "The full rewrite as markdown (paragraphs, bullets, blockquotes, headings as appropriate).",
          },
          text: {
            type: "string",
            description:
              "The same content as plain text (no markdown syntax) — used for TTS and analysis.",
          },
          wordCount: {
            type: "number",
            description: "Approximate word count of the plain-text output.",
          },
        },
        required: ["markdown", "text", "wordCount"],
        additionalProperties: false,
      },
    },
  },
];

/** Tiny markdown → safe HTML converter (paragraphs, headings, lists, blockquotes, bold/italic). */
function mdToHtml(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const inline = (s: string) =>
    escape(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote><p>${inline(buf.join(" "))}</p></blockquote>`);
      continue;
    }
    // Numbered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    // Bullet list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^[-*]\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    // Paragraph (collect until blank line)
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|>|[-*]\s|\d+\.\s)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return out.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { chapterText, chapterTitle, style, model } = await req.json();

    if (typeof chapterText !== "string" || !chapterText.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing 'chapterText'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (typeof style !== "string" || !STYLE_INSTRUCTIONS[style]) {
      return new Response(
        JSON.stringify({ error: `Unknown style '${style}'.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Soft cap input to keep tokens reasonable.
    const text = chapterText.trim().slice(0, 60000);
    const title = typeof chapterTitle === "string" ? chapterTitle.slice(0, 200) : "";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const chosenModel = typeof model === "string" && model ? model : DEFAULT_MODEL;
    const styleInstr = STYLE_INSTRUCTIONS[style];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              `STYLE: ${style}\nINSTRUCTIONS: ${styleInstr}\n\nCHAPTER TITLE: ${title || "(untitled)"}\n\nCHAPTER TEXT:\n"""\n${text}\n"""\n\nCall the tool with the rewrite.`,
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "return_chapter_rewrite" } },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit reached. Please slow down and try again." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiRes.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Add funds in workspace settings." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[rewrite-chapter] gateway error", aiRes.status, t);
      return new Response(
        JSON.stringify({ error: `AI gateway error (${aiRes.status}).` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiRes.json();
    const argsStr = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) {
      console.error("[rewrite-chapter] no tool_calls", JSON.stringify(data).slice(0, 500));
      return new Response(
        JSON.stringify({ error: "AI response did not include structured output." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(argsStr);
    } catch {
      return new Response(
        JSON.stringify({ error: "AI returned malformed structured output." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const markdown = String(parsed.markdown ?? "").trim();
    const plain = String(parsed.text ?? "").trim();
    if (!markdown || !plain) {
      return new Response(
        JSON.stringify({ error: "AI returned empty rewrite." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const html = mdToHtml(markdown);
    const wordCount =
      typeof parsed.wordCount === "number" && parsed.wordCount > 0
        ? Math.round(parsed.wordCount)
        : plain.split(/\s+/).filter(Boolean).length;

    return new Response(
      JSON.stringify({ html, text: plain, wordCount, model: chosenModel }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[rewrite-chapter] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
