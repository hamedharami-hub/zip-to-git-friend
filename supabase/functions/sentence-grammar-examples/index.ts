// Generates 3 short contextual examples that drill a specific grammar
// rule the learner just got wrong, anchored in the current topic
// (e.g. Pharmacy / OPRA). Returns strict JSON.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  /** The combined grammar_corrections notes from the session. */
  grammar_notes: string;
  /** Topic anchor — e.g. category/subcategory of the scenario. */
  topic?: string | null;
  /** Optional CEFR level to keep difficulty appropriate. */
  cefr_level?: string | null;
  /** Optional original scenario sentence for extra context. */
  scenario_english?: string | null;
}

const SYSTEM_PROMPT = `You are an English grammar coach for adult learners
preparing for high-stakes exams (OPRA / PTE / OET / IELTS).

The user just made one or more grammar mistakes during a roleplay. Your job:
1) Identify the SINGLE most important grammar rule they violated.
2) Produce exactly 3 SHORT (max 14 words), natural, native-sounding English
   sentences that demonstrate the CORRECT use of that rule, anchored in the
   provided topic context (e.g. pharmacy counter, patient counselling).
3) Each sentence must be standalone, useful in a real conversation, and easy
   to memorise as a flashcard. No quotation marks. No numbering inside the text.

Always call the "examples" tool. Never reply in plain text.`;

const TOOL_DEF = {
  type: "function",
  function: {
    name: "examples",
    description:
      "Return the inferred grammar rule + 3 contextual example sentences.",
    parameters: {
      type: "object",
      properties: {
        rule_label: {
          type: "string",
          description:
            "Short human-readable name of the grammar rule (e.g. 'Preposition: depend ON', 'Past simple vs present perfect').",
        },
        rule_explanation: {
          type: "string",
          description:
            "One sentence (max 25 words) explaining the rule simply.",
        },
        examples: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: { type: "string" },
          description: "Exactly 3 short, native, topic-anchored sentences.",
        },
      },
      required: ["rule_label", "rule_explanation", "examples"],
      additionalProperties: false,
    },
  },
} as const;

function buildUserPrompt(b: ReqBody): string {
  return [
    `TOPIC: ${b.topic ?? "general English conversation"}`,
    `LEARNER LEVEL: ${b.cefr_level ?? "B2"}`,
    `SCENARIO LINE: ${b.scenario_english ?? "(none)"}`,
    "",
    "GRAMMAR FEEDBACK FROM THE SESSION:",
    b.grammar_notes,
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.grammar_notes || typeof body.grammar_notes !== "string" || !body.grammar_notes.trim()) {
    return new Response(
      JSON.stringify({ error: "Missing 'grammar_notes' string" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ error: "LOVABLE_API_KEY is not configured." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let aiRes: Response;
  try {
    aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: (typeof body.model === 'string' && body.model) || "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(body) },
        ],
        tools: [TOOL_DEF],
        tool_choice: { type: "function", function: { name: "examples" } },
      }),
    });
  } catch (e) {
    console.error("[sentence-grammar-examples] network error", e);
    return new Response(JSON.stringify({ error: "Upstream network error" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (aiRes.status === 429) {
    return new Response(
      JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (aiRes.status === 402) {
    return new Response(
      JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
      { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!aiRes.ok) {
    const t = await aiRes.text();
    console.error("[sentence-grammar-examples] AI gateway error", aiRes.status, t);
    return new Response(JSON.stringify({ error: "AI gateway error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const data = await aiRes.json();
  const argStr = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argStr) {
    console.error("[sentence-grammar-examples] no tool call", JSON.stringify(data).slice(0, 500));
    return new Response(JSON.stringify({ error: "AI did not return structured output." }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let parsed: any;
  try {
    parsed = typeof argStr === "string" ? JSON.parse(argStr) : argStr;
  } catch {
    return new Response(JSON.stringify({ error: "Failed to parse AI JSON." }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const examples = Array.isArray(parsed.examples)
    ? parsed.examples.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 3)
    : [];

  return new Response(
    JSON.stringify({
      rule_label: String(parsed.rule_label ?? "Grammar rule"),
      rule_explanation: String(parsed.rule_explanation ?? ""),
      examples,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
  );
});
