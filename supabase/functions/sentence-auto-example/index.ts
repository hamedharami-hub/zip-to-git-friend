// Generates a single short example sentence for a short phrase, plus its
// Persian translation. Used by Sentence Lab to enrich bare phrases with a
// natural usage example. Strict JSON via tool calling.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  sentence_id?: string;
  english: string;
  persian?: string | null;
}

const SYSTEM_PROMPT = `You help language learners. Given a short English phrase
(often just 1–4 words), produce ONE natural, short example sentence (max 12
words) that uses the phrase in everyday context, plus a fluent Persian (Farsi)
translation of that example.

Rules:
- The example MUST contain the original phrase verbatim (or its natural
  inflection if it is a verb).
- Keep it natural, conversational, and useful for spoken practice.
- The Persian translation must be idiomatic Farsi, NOT a word-by-word gloss.
- Always call the "example" tool. Never reply in plain text.`;

const TOOL_DEF = {
  type: "function",
  function: {
    name: "example",
    description: "Return one short example sentence with its Persian translation.",
    parameters: {
      type: "object",
      properties: {
        english: { type: "string", description: "Natural English example sentence using the phrase." },
        persian: { type: "string", description: "Idiomatic Persian translation of the example." },
      },
      required: ["english", "persian"],
      additionalProperties: false,
    },
  },
} as const;

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
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body?.english || typeof body.english !== "string") {
    return new Response(JSON.stringify({ error: "Missing english" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userMsg = [
    `PHRASE (EN): "${body.english}"`,
    body.persian ? `PHRASE (FA): "${body.persian}"` : null,
    `Generate one short natural example sentence (≤12 words) using this phrase, plus its Persian translation.`,
  ]
    .filter(Boolean)
    .join("\n");

  let aiRes: Response;
  try {
    aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: (typeof body.model === 'string' && body.model) || "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
        tools: [TOOL_DEF],
        tool_choice: { type: "function", function: { name: "example" } },
      }),
    });
  } catch (e) {
    console.error("[sentence-auto-example] network", e);
    return new Response(JSON.stringify({ error: "Upstream network error" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (aiRes.status === 429) {
    return new Response(JSON.stringify({ error: "Rate limit" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (aiRes.status === 402) {
    return new Response(JSON.stringify({ error: "Payment required" }), {
      status: 402,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!aiRes.ok) {
    const t = await aiRes.text();
    console.error("[sentence-auto-example] gateway", aiRes.status, t);
    return new Response(JSON.stringify({ error: "AI gateway error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const data = await aiRes.json();
  const argStr = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argStr) {
    return new Response(JSON.stringify({ error: "No structured output" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  let parsed: { english?: string; persian?: string };
  try {
    parsed = typeof argStr === "string" ? JSON.parse(argStr) : argStr;
  } catch {
    return new Response(JSON.stringify({ error: "Bad JSON" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const english = String(parsed.english ?? "").trim();
  const persian = String(parsed.persian ?? "").trim();
  if (!english || !persian) {
    return new Response(JSON.stringify({ error: "Empty example" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ example: { english, persian } }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
