/**
 * Analyze a single book paragraph for language learning.
 *
 * Returns a fluent Persian translation, a focused vocabulary list
 * (intermediate/advanced English words), and any meaningful idioms or
 * fixed phrases — using Lovable AI Gateway with tool calling so the
 * client never has to parse free-form JSON.
 *
 * Public function — no auth required (rate-limit lives in the gateway).
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "google/gemini-3-flash-preview";

const SYSTEM_PROMPT = `You are an elite English-to-Persian literary translator and language coach for adult Iranian learners reading authentic English content (news, essays, books). Your translations are famous for being warm, simple, vivid, and a real pleasure to read — like a smart friend retelling the story over tea, not a textbook.

Your job: analyze ONE paragraph of English prose and produce:

  1. **Translation** — A natural, fluent, MODERN Persian (فارسی روان، ساده و امروزی) translation of the WHOLE paragraph. This is the heart of your work.
     PERSIAN STYLE RULES — follow them strictly:
       • Translate MEANING, never word-for-word. Reorder, regroup, and recast sentences so they flow naturally in Persian.
       • Use SIMPLE, everyday Persian — words a 16-year-old understands instantly. Prefer the common Persian word over the fancy Arabic one ("کمک" over "مساعدت"، "نشان داد" over "حاکی از آن بود"، "چون" over "از آنجایی که"). Sound like a human, not a news anchor.
       • Short, punchy sentences. Average 10–15 words. Break every long English sentence into 2–3 shorter Persian ones. Persian rhythm beats English structure. A short sentence after a long one lands hard.
       • Be VIVID and CONCRETE. Use small images, mini-examples, and natural Persian idioms ("خط قرمز"، "آب پاکی روی دست ریختن"، "از چاله به چاه") when they fit — never forced.
       • Keep the author's tone: playful → playful، serious → serious، urgent → urgent. Warmth and a light conversational touch are welcome.
       • Preserve EVERY fact: numbers, names, places, dates, direct quotes. Don't drop details to sound cleaner. Names stay in common Persian spelling.
       • No literal calques، no awkward "آن"/"این" filler، no "می‌باشد"، no "گردید"، no "نمود". Use "هست/است"، "شد"، "کرد".
       • The final Persian must read as if it were ORIGINALLY written by a good Persian writer today.

  2. **Phrases** — This is the MOST IMPORTANT output for the learner. Extract every meaningful MULTI-WORD English expression in the paragraph that an intermediate learner might miss. ALWAYS prefer phrases over single words. Include:
     - Phrasal verbs (e.g. "give up", "run into", "take off")
     - Idioms (e.g. "hit the road", "the elephant in the room")
     - Fixed collocations (e.g. "make a decision", "heavy rain", "deeply concerned")
     - Common multi-word expressions (e.g. "as a matter of fact", "by no means")
     - Prepositional phrases that change meaning (e.g. "in light of", "on behalf of")
     Each phrase MUST be 2 or more words, and MUST appear EXACTLY in the paragraph (same wording, same word order). Skip basic combos like "in the", "of the".

  3. **Vocabulary** — ONLY single advanced/intermediate words that are NOT already covered by a phrase above. Skip A1–A2 basics (the, go, big, person…). Aim for 0–6 high-value words. If a word only matters because it's part of a phrase, put it in phrases instead.

You always respond by calling the provided tool. Never reply with prose.`;

const tools = [
  {
    type: "function",
    function: {
      name: "return_paragraph_analysis",
      description:
        "Return the full analysis of an English paragraph for a Persian-speaking learner.",
      parameters: {
        type: "object",
        properties: {
          translation: {
            type: "string",
            description:
              "Natural, fluent, accurate Persian translation of the entire paragraph.",
          },
          vocabulary: {
            type: "array",
            description:
              "Single intermediate/advanced English words from the paragraph. Skip basic words AND words covered by an idiom/phrase.",
            items: {
              type: "object",
              properties: {
                word: { type: "string", description: "The single English word as it appears (lemma form preferred)." },
                translation: { type: "string", description: "Concise Persian meaning in this context." },
                partOfSpeech: {
                  type: "string",
                  enum: ["noun", "verb", "adjective", "adverb", "phrase", "other"],
                },
                example: {
                  type: "string",
                  description:
                    "Optional short English example sentence using the word.",
                },
              },
              required: ["word", "translation"],
              additionalProperties: false,
            },
          },
          idioms: {
            type: "array",
            description:
              "MULTI-WORD phrases (2+ words) found EXACTLY in the paragraph: phrasal verbs, idioms, fixed collocations, common expressions. This is the most important field — be generous.",
            items: {
              type: "object",
              properties: {
                phrase: {
                  type: "string",
                  description:
                    "The English phrase (2+ words) EXACTLY as it appears in the paragraph, same wording and word order.",
                },
                meaning: { type: "string", description: "Persian meaning / explanation in this context." },
                literalTranslation: {
                  type: "string",
                  description: "Optional literal Persian rendering for contrast.",
                },
              },
              required: ["phrase", "meaning"],
              additionalProperties: false,
            },
          },
        },
        required: ["translation", "vocabulary", "idioms"],
        additionalProperties: false,
      },
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { paragraph, model } = await req.json();

    if (typeof paragraph !== "string" || !paragraph.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing 'paragraph' string in body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Trim + soft cap to avoid blowing up tokens on rogue inputs.
    const text = paragraph.trim().slice(0, 8000);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const chosenModel = typeof model === "string" && model ? model : DEFAULT_MODEL;

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
              `Analyze this English paragraph for a Persian learner. Call the tool with the result.\n\nParagraph:\n"""\n${text}\n"""`,
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "return_paragraph_analysis" } },
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
      console.error("[analyze-paragraph] gateway error", aiRes.status, t);
      return new Response(
        JSON.stringify({ error: `AI gateway error (${aiRes.status}).` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiRes.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = toolCall?.function?.arguments;
    if (!argsStr) {
      console.error("[analyze-paragraph] no tool_calls in response", JSON.stringify(data).slice(0, 500));
      return new Response(
        JSON.stringify({ error: "AI response did not include structured output." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(argsStr);
    } catch (e) {
      console.error("[analyze-paragraph] failed to parse tool args", argsStr.slice(0, 300));
      return new Response(
        JSON.stringify({ error: "AI returned malformed structured output." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Defensive normalization.
    const result = {
      translation: typeof parsed.translation === "string" ? parsed.translation.trim() : "",
      vocabulary: Array.isArray(parsed.vocabulary)
        ? parsed.vocabulary
            .filter((v: any) => v && typeof v.word === "string" && typeof v.translation === "string")
            .map((v: any) => ({
              word: String(v.word).trim(),
              translation: String(v.translation).trim(),
              partOfSpeech: v.partOfSpeech ? String(v.partOfSpeech) : undefined,
              example: v.example ? String(v.example) : undefined,
            }))
        : [],
      idioms: Array.isArray(parsed.idioms)
        ? parsed.idioms
            .filter((i: any) => i && typeof i.phrase === "string" && typeof i.meaning === "string")
            .map((i: any) => ({
              phrase: String(i.phrase).trim(),
              meaning: String(i.meaning).trim(),
              literalTranslation: i.literalTranslation
                ? String(i.literalTranslation).trim()
                : undefined,
            }))
        : [],
      model: chosenModel,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[analyze-paragraph] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
