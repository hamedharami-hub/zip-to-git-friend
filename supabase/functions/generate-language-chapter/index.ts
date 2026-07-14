/**
 * Generate a language-learning story chapter from a list of target words /
 * phrases / idioms. Returns:
 *   - title (suggested chapter title in English)
 *   - story (a short coherent English story that USES every target item
 *     at least once, naturally, and with the EXACT wording the learner gave)
 *   - usedItems (the items the model actually used; subset of input)
 *   - notes (optional teaching notes about the items)
 *
 * Two modes:
 *   1. "guided"  — user gives both target items AND their own outline /
 *                  story seed / notes; AI weaves them together.
 *   2. "auto"    — user gives ONLY a list of items; AI invents a short
 *                  story around them.
 *
 * Story length is chosen automatically based on how many items the learner
 * wants to practice (≈ 25–40 words per item, capped to keep things readable).
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "google/gemini-3-flash-preview";

const SYSTEM_PROMPT = `You are an expert ESL author who writes short, vivid stories that help adult learners (Persian-speaking) acquire specific vocabulary, phrasal verbs, collocations, and idioms in context.

GOLDEN RULES:
1. Use EVERY target item at least once, EXACTLY as written (same wording, same word order, same form). Never paraphrase a target item.
2. The story must read naturally — like real prose, not a vocabulary drill. Vary sentence length, use dialogue when it helps, build a tiny arc (situation → tension → resolution).
3. Match the requested word count target as closely as possible (within ±15%).
4. Difficulty: keep surrounding language at a clear B1–B2 level so the target items stand out as the only "new" things.
5. Break the story into short, readable paragraphs (2–4 sentences each).
6. If a "guided" outline / seed is provided, follow it faithfully; the items must still appear naturally inside that outline.
7. Output via the tool only — never reply with prose.`;

const tools = [
  {
    type: "function",
    function: {
      name: "return_language_chapter",
      description:
        "Return a story-style chapter that teaches the target vocabulary items in context.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "A short, intriguing English title for the story (max 8 words).",
          },
          story: {
            type: "string",
            description:
              "The full English story. Plain text, paragraphs separated by a blank line. Every target item must appear at least once, EXACTLY as the learner wrote it.",
          },
          usedItems: {
            type: "array",
            description:
              "The exact target items used in the story (subset of input, written EXACTLY as they appear in the story).",
            items: { type: "string" },
          },
          teachingNotes: {
            type: "string",
            description:
              "Optional Persian/English teaching note (1–3 sentences) summarizing the meanings or usage tips of the items in this story. Empty string if not useful.",
          },
        },
        required: ["title", "story", "usedItems"],
        additionalProperties: false,
      },
    },
  },
];

interface Body {
  /** Target items: words, phrases, or idioms (each 1–6 words). */
  items: string[];
  /** "guided" = user provides outline/seed; "auto" = AI invents the story. */
  mode?: "guided" | "auto";
  /** Optional: user's outline, story seed, themes, or teaching notes. */
  outline?: string;
  /** Optional override of the suggested word count (50–1200). */
  targetWordCount?: number;
  model?: string;
}

function pickWordCount(itemCount: number, requested?: number): number {
  if (typeof requested === "number" && requested >= 50 && requested <= 1200) {
    return Math.round(requested);
  }
  // Heuristic: ~30 words per item, with a sensible floor and ceiling.
  const base = Math.max(120, Math.min(700, itemCount * 30));
  return Math.round(base);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Body;
    const items = Array.isArray(body.items)
      ? body.items.map((s) => String(s ?? "").trim()).filter(Boolean)
      : [];
    if (items.length === 0) {
      return new Response(JSON.stringify({ error: "Provide at least one target item." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (items.length > 60) {
      return new Response(JSON.stringify({ error: "Too many items (max 60 per chapter)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mode: "guided" | "auto" = body.mode === "guided" ? "guided" : "auto";
    const outline = (body.outline ?? "").toString().trim().slice(0, 4000);
    const targetWords = pickWordCount(items.length, body.targetWordCount);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const chosenModel = typeof body.model === "string" && body.model ? body.model : DEFAULT_MODEL;

    const itemList = items.map((it, i) => `${i + 1}. ${it}`).join("\n");
    const userMsg =
      mode === "guided" && outline
        ? `Write a coherent English story (~${targetWords} words) that follows this outline / seed and naturally weaves in EVERY target item below.

OUTLINE / SEED FROM THE LEARNER:
"""
${outline}
"""

TARGET ITEMS (use EACH at least once, EXACT wording):
${itemList}

Then call the tool with the result.`
        : `Invent a short coherent English story (~${targetWords} words) that naturally weaves in EVERY target item below. Pick any setting and characters that make the items feel natural.

TARGET ITEMS (use EACH at least once, EXACT wording):
${itemList}

Then call the tool with the result.`;

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
          { role: "user", content: userMsg },
        ],
        tools,
        tool_choice: {
          type: "function",
          function: { name: "return_language_chapter" },
        },
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
        JSON.stringify({
          error: "AI credits exhausted. Add funds in Lovable workspace settings to continue.",
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[generate-language-chapter] gateway error", aiRes.status, t);
      return new Response(JSON.stringify({ error: `AI gateway error (${aiRes.status}).` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = toolCall?.function?.arguments;
    if (!argsStr) {
      console.error(
        "[generate-language-chapter] no tool_calls",
        JSON.stringify(data).slice(0, 500),
      );
      return new Response(
        JSON.stringify({ error: "AI response did not include structured output." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
    let parsed: any;
    try {
      parsed = JSON.parse(argsStr);
    } catch {
      return new Response(JSON.stringify({ error: "AI returned malformed structured output." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const story = String(parsed.story ?? "").trim();
    const title = String(parsed.title ?? "").trim() || "Story";
    const used = Array.isArray(parsed.usedItems)
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
        parsed.usedItems.map((s: any) => String(s ?? "").trim()).filter(Boolean)
      : [];
    const teachingNotes = String(parsed.teachingNotes ?? "").trim();

    if (!story) {
      return new Response(
        JSON.stringify({ error: "AI returned an empty story. Try fewer items." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Sanity check: which items DID appear (case-insensitive substring match)?
    const lower = story.toLowerCase();
    const actuallyUsed = items.filter((it) => lower.includes(it.toLowerCase()));
    const missing = items.filter((it) => !lower.includes(it.toLowerCase()));

    return new Response(
      JSON.stringify({
        title,
        story,
        usedItems: actuallyUsed.length > 0 ? actuallyUsed : used,
        missingItems: missing,
        teachingNotes,
        targetWordCount: targetWords,
        model: chosenModel,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[generate-language-chapter] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
