// Batch-translate English news titles (and optional excerpts) into Persian.
// One AI call per batch (up to 30) — designed to minimise cost.
//
// Body: { items: Array<{ id: string; title: string; excerpt?: string }>; model?: string }
// Returns: { results: Array<{ id: string; titleFa: string; excerptFa?: string }>, model }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "google/gemini-3-flash-preview";
const MAX_ITEMS = 30;
const MAX_CHARS = 600;

const SYSTEM_PROMPT = `You are a professional English→Persian news translator.
Translate each item's title (and excerpt if provided) into natural, fluent, modern Persian (روان، ساده، امروزی، خبری).
- Keep proper nouns, numbers, and quotes intact.
- Do NOT add commentary or explanations.
- Translate meaning, not word-for-word.
- Return one entry per input, IN THE SAME ORDER, by calling the provided tool.`;

const tool = {
  type: "function",
  function: {
    name: "return_translations",
    description: "Return Persian translations for the input list.",
    parameters: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              titleFa: { type: "string" },
              excerptFa: { type: "string" },
            },
            required: ["titleFa"],
          },
        },
      },
      required: ["results"],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { items, model } = await req.json();
    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "Missing 'items' array." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const cleaned = items.slice(0, MAX_ITEMS).map((it: any, i: number) => ({
      id: String(it?.id ?? i),
      title: String(it?.title ?? "").trim().slice(0, MAX_CHARS),
      excerpt: it?.excerpt ? String(it.excerpt).trim().slice(0, MAX_CHARS) : "",
    })).filter((x) => x.title);

    if (cleaned.length === 0) {
      return new Response(JSON.stringify({ results: [], model: DEFAULT_MODEL }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chosenModel = typeof model === "string" && model ? model : DEFAULT_MODEL;
    const userPrompt =
      `Translate these ${cleaned.length} English news item(s) to Persian. Return one result per item, in the same order.\n\n` +
      cleaned.map((it, i) =>
        `--- ITEM ${i + 1} ---\nTITLE: ${it.title}${it.excerpt ? `\nEXCERPT: ${it.excerpt}` : ""}`
      ).join("\n\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chosenModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "return_translations" } },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[news-translate-titles] gateway error", aiRes.status, t);
      return new Response(JSON.stringify({ error: `AI gateway error (${aiRes.status}).` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const argsStr = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) {
      return new Response(JSON.stringify({ error: "AI returned no structured output." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let parsed: any;
    try { parsed = JSON.parse(argsStr); } catch {
      return new Response(JSON.stringify({ error: "Malformed AI output." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const raw: any[] = Array.isArray(parsed.results) ? parsed.results : [];
    const results = cleaned.map((it, i) => {
      const r = raw[i] ?? {};
      return {
        id: it.id,
        titleFa: typeof r.titleFa === "string" ? r.titleFa.trim() : "",
        excerptFa: typeof r.excerptFa === "string" ? r.excerptFa.trim() : undefined,
      };
    });

    return new Response(JSON.stringify({ results, model: chosenModel }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[news-translate-titles] error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
