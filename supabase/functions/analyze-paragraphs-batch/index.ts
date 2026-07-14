/**
 * Batch-analyze up to 10 paragraphs in a single AI call.
 *
 * Body: { paragraphs: string[]; model?: string }
 * Returns: { results: Array<{ translation, vocabulary, idioms } | { error }>, model }
 *
 * Designed to drastically reduce overhead vs. one-call-per-paragraph
 * (one system prompt + one HTTP round-trip per 10 paragraphs).
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "google/gemini-3-flash-preview";
const MAX_PARAGRAPHS = 10;
const MAX_CHARS_PER_PARAGRAPH = 4000;

const SYSTEM_PROMPT = `You are an elite English-to-Persian literary translator and language coach for adult Iranian learners.

For EACH input paragraph, produce:
  1. translation — natural, fluent, MODERN Persian (روان، ساده، امروزی، صمیمی — مثل دوست باهوشی که ماجرا را تعریف می‌کند). Translate MEANING, never word-for-word. Break long English sentences into 2–3 short Persian ones (avg 10–14 words). Prefer the common Persian word over the fancy Arabic one («کمک» not «مساعدت»، «چون» not «از آنجایی که»، «درباره» not «پیرامون»، «حالا» not «هم‌اکنون»، «گفت» not «اظهار داشت»). BANNED: «می‌باشد»، «گردید»، «نمود» (helper)، «مبنی بر»، «حاکی از»، «در راستای»، «به منظور»، «جهت» (as preposition)، «فوق‌الذکر»، «مذکور»، «لذا». Cut filler «آن/این/که/را» that isn't earning its place. Preserve every number, name, place, date, quote. The final Persian must read as if originally written by a good Persian writer today.
  2. idioms — every meaningful MULTI-WORD English expression (2+ words) appearing EXACTLY in that paragraph: phrasal verbs, idioms, fixed collocations. THIS IS THE MOST IMPORTANT FIELD.
  3. vocabulary — only intermediate/advanced SINGLE words NOT covered by an idiom. 0–6 per paragraph. Skip A1–A2 basics.

Output an array, one entry per input paragraph, in the SAME ORDER. Always respond by calling the provided tool.`;

const tool = {
  type: "function",
  function: {
    name: "return_batch_analysis",
    description: "Return per-paragraph analysis for the input list.",
    parameters: {
      type: "object",
      properties: {
        results: {
          type: "array",
          description: "One entry per input paragraph, in the same order.",
          items: {
            type: "object",
            properties: {
              translation: { type: "string" },
              vocabulary: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    word: { type: "string" },
                    translation: { type: "string" },
                    partOfSpeech: { type: "string" },
                    example: { type: "string" },
                  },
                  required: ["word", "translation"],
                },
              },
              idioms: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    phrase: { type: "string" },
                    meaning: { type: "string" },
                    literalTranslation: { type: "string" },
                  },
                  required: ["phrase", "meaning"],
                },
              },
            },
            required: ["translation", "vocabulary", "idioms"],
          },
        },
      },
      required: ["results"],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const { paragraphs, model } = await req.json();
    if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
      return new Response(JSON.stringify({ error: "Missing 'paragraphs' array." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleaned = paragraphs
      .slice(0, MAX_PARAGRAPHS)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
      .map((p: any) =>
        String(p ?? "")
          .trim()
          .slice(0, MAX_CHARS_PER_PARAGRAPH),
      )
      .filter(Boolean);

    if (cleaned.length === 0) {
      return new Response(JSON.stringify({ error: "No valid paragraphs." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chosenModel = typeof model === "string" && model ? model : DEFAULT_MODEL;

    const userPrompt =
      `Analyze these ${cleaned.length} English paragraph(s) for a Persian learner. Call the tool with one result per paragraph, IN THE SAME ORDER.\n\n` +
      cleaned.map((p, i) => `--- PARAGRAPH ${i + 1} ---\n${p}`).join("\n\n");

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
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "return_batch_analysis" } },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[analyze-paragraphs-batch] gateway error", aiRes.status, t);
      return new Response(JSON.stringify({ error: `AI gateway error (${aiRes.status}).` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const argsStr = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) {
      console.error("[analyze-paragraphs-batch] no tool_calls", JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ error: "AI returned no structured output." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
    let parsed: any;
    try {
      parsed = JSON.parse(argsStr);
    } catch {
      return new Response(JSON.stringify({ error: "Malformed AI output." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
    const rawResults: any[] = Array.isArray(parsed.results) ? parsed.results : [];
    // Normalize and pad to input length so callers can match by index.
    const normalized = cleaned.map((_p, i) => {
      const r = rawResults[i];
      if (!r) return { error: "missing" };
      return {
        translation: typeof r.translation === "string" ? r.translation.trim() : "",
        vocabulary: Array.isArray(r.vocabulary)
          ? r.vocabulary
              .filter(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
                (v: any) => v && typeof v.word === "string" && typeof v.translation === "string",
              )
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
              .map((v: any) => ({
                word: String(v.word).trim(),
                translation: String(v.translation).trim(),
                partOfSpeech: v.partOfSpeech ? String(v.partOfSpeech) : undefined,
                example: v.example ? String(v.example) : undefined,
              }))
          : [],
        idioms: Array.isArray(r.idioms)
          ? r.idioms
              .filter(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
                (x: any) => x && typeof x.phrase === "string" && typeof x.meaning === "string",
              )
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
              .map((x: any) => ({
                phrase: String(x.phrase).trim(),
                meaning: String(x.meaning).trim(),
                literalTranslation: x.literalTranslation
                  ? String(x.literalTranslation).trim()
                  : undefined,
              }))
          : [],
      };
    });

    return new Response(JSON.stringify({ results: normalized, model: chosenModel }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[analyze-paragraphs-batch] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
