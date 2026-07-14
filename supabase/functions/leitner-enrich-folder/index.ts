/**
 * Leitner — Enrich folder
 *
 * Iterate over all cards in a folder (sent by client) and use Lovable AI
 * Gateway (gemini-3-flash-preview) to fill in missing pieces:
 *   - exampleSentence (if empty)
 *   - back / definition (if empty or shorter than 3 chars)
 *   - synonyms (3–6 simple English synonyms)
 *   - antonyms (0–4 antonyms when applicable)
 *
 * The function processes cards in small batches and returns the patches
 * keyed by card id. The client persists them via the existing leitnerStore.
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-3-flash-preview";

interface CardIn {
  id: string;
  front: string;
  back?: string;
  exampleSentence?: string;
  synonyms?: string[];
  antonyms?: string[];
}

const SYSTEM = `You are an English vocabulary enrichment assistant for an Iranian Persian-speaking learner.

For EACH card, return missing or weak fields ONLY:
- back: a short Persian translation/definition (≤ 60 chars). Skip if back already exists and is meaningful.
- exampleSentence: ONE natural English example sentence using the term (≤ 18 words). Skip if a real example already exists.
- synonyms: 3–6 simple English synonyms or near-synonyms. Always provide unless the term has none (e.g. proper noun).
- antonyms: 0–4 English antonyms when applicable, otherwise empty array.

Always respond by calling the provided tool with one entry per input id.`;

const tool = {
  type: "function",
  function: {
    name: "return_enrichments",
    description: "Return enrichment patches for the provided cards.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              back: { type: "string" },
              exampleSentence: { type: "string" },
              synonyms: { type: "array", items: { type: "string" } },
              antonyms: { type: "array", items: { type: "string" } },
            },
            required: ["id"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
};

async function enrichBatch(apiKey: string, cards: CardIn[]) {
  const summary = cards.map((c) => ({
    id: c.id,
    front: c.front,
    hasBack: !!(c.back && c.back.trim().length >= 2),
    hasExample: !!(c.exampleSentence && c.exampleSentence.trim().length >= 8),
    hasSynonyms: Array.isArray(c.synonyms) && c.synonyms.length > 0,
    hasAntonyms: Array.isArray(c.antonyms) && c.antonyms.length > 0,
  }));

  const userMsg =
    `Enrich these cards. For each, ONLY include fields that are missing or weak (hasX = false). ` +
    `Always include synonyms unless not applicable.\n\n` +
    JSON.stringify(summary, null, 2);

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMsg },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "return_enrichments" } },
    }),
  });

  if (aiRes.status === 429) throw new Error("rate_limit");
  if (aiRes.status === 402) throw new Error("payment");
  if (!aiRes.ok) {
    const t = await aiRes.text();
    throw new Error(`gateway_${aiRes.status}: ${t.slice(0, 200)}`);
  }

  const data = await aiRes.json();
  const argsStr = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argsStr) throw new Error("no_tool_args");
  const parsed = JSON.parse(argsStr);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];

  // Normalise — strip empty strings; cap arrays.
  return (
    items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
      .map((it: any) => ({
        id: String(it.id ?? "").trim(),
        back:
          typeof it.back === "string" && it.back.trim() ? it.back.trim().slice(0, 200) : undefined,
        exampleSentence:
          typeof it.exampleSentence === "string" && it.exampleSentence.trim()
            ? it.exampleSentence.trim().slice(0, 240)
            : undefined,
        synonyms: Array.isArray(it.synonyms)
          ? it.synonyms
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
              .filter((x: any) => typeof x === "string" && x.trim())
              .map((x: string) => x.trim())
              .slice(0, 8)
          : undefined,
        antonyms: Array.isArray(it.antonyms)
          ? it.antonyms
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
              .filter((x: any) => typeof x === "string" && x.trim())
              .map((x: string) => x.trim())
              .slice(0, 6)
          : undefined,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
      .filter((x: any) => x.id)
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cards } = (await req.json()) as { cards?: CardIn[] };
    if (!Array.isArray(cards) || cards.length === 0) {
      return new Response(
        JSON.stringify({ error: "Body must include a non-empty `cards` array." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process in small batches so a single bad card doesn't kill the run
    // and to keep token usage reasonable.
    const BATCH = 8;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
    const out: any[] = [];
    let lastError: string | undefined;

    for (let i = 0; i < cards.length; i += BATCH) {
      const slice = cards.slice(i, i + BATCH);
      try {
        const patches = await enrichBatch(apiKey, slice);
        out.push(...patches);
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        console.error("[enrich-folder] batch failed", lastError);
        if (lastError === "payment" || lastError === "rate_limit") break;
      }
    }

    return new Response(
      JSON.stringify({
        patches: out,
        processed: out.length,
        total: cards.length,
        lastError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[enrich-folder] fatal", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
