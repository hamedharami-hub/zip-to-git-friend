// Generates 3 conversational scenarios from a list of practice sentences
// in a subcategory, so the learner can naturally use those sentences in a
// real conversation instead of drilling them in isolation.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  category_name?: string | null;
  subcategory_name?: string | null;
  sentences: { id: string; english: string; expected_intent?: string | null }[];
  count?: number; // default 3
  model?: string;
}

const SYSTEM_PROMPT = `You design SHORT roleplay scenarios for an English learner.
Goal: give the learner a natural conversational situation where they will
have organic opportunities to USE the target sentences (or close paraphrases)
without feeling forced.

Rules:
- Scenarios must connect to the THEME of the target sentences. If they're
  about apologizing to a patient, build a pharmacy/clinic situation.
- For EACH scenario, propose 2-4 DIFFERENT ROLE PAIRS the learner could
  choose from (e.g. Doctor↔Patient, Nurse↔Patient, Pharmacist↔Customer).
  The first role pair is the default. Roles must fit the same scene.
- Each scenario sets a SCENE: who the user is by default, who the AI plays,
  the goal, and the initial situation. 1–3 sentences max per field.
- The AI character should have a clear motivation that gives the user reasons
  to deploy several of the target sentences.
- Keep scenarios distinct from each other (different stakes, different angle).
- Write the AI's OPENING LINE — the first thing the AI says to kick things off.
- Persian (FA) translation of title + scene for the learner's clarity.

You MUST call the "scenarios" tool. Never reply in plain text.`;

const TOOL_DEF = {
  type: "function",
  function: {
    name: "scenarios",
    description: "Return an array of distinct roleplay scenarios.",
    parameters: {
      type: "object",
      properties: {
        scenarios: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title_en: { type: "string", description: "Short title, max 6 words." },
              title_fa: { type: "string", description: "Persian title." },
              user_role: { type: "string", description: "Default user role (used if learner doesn't pick a different one)." },
              ai_role: { type: "string", description: "Default AI role (matches user_role)." },
              role_options: {
                type: "array",
                description: "2-4 distinct role pairs the learner could pick from for THIS same scene. Each pair has user + ai roles. The first item should match user_role / ai_role above.",
                items: {
                  type: "object",
                  properties: {
                    user_role: { type: "string" },
                    ai_role: { type: "string" },
                    label: { type: "string", description: "Short label like '👨‍⚕️ Doctor ↔ 🤒 Patient'." },
                  },
                  required: ["user_role", "ai_role", "label"],
                  additionalProperties: false,
                },
              },
              scene_en: { type: "string", description: "1–3 sentences setting the scene in English (role-neutral when possible)." },
              scene_fa: { type: "string", description: "Same scene in Persian." },
              ai_opening_line: {
                type: "string",
                description: "The very first line the AI says to start the roleplay (assuming default ai_role). Plain text — fed to TTS.",
              },
              goal_en: { type: "string", description: "User's goal in 1 short sentence." },
              difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
            },
            required: ["title_en", "title_fa", "user_role", "ai_role", "role_options", "scene_en", "scene_fa", "ai_opening_line", "goal_en", "difficulty"],
            additionalProperties: false,
          },
        },
      },
      required: ["scenarios"],
      additionalProperties: false,
    },
  },
} as const;

function buildUserPrompt(b: ReqBody): string {
  const lines = [
    `CATEGORY: ${b.category_name ?? "(none)"}`,
    `SUBCATEGORY: ${b.subcategory_name ?? "(none)"}`,
    `COUNT: ${b.count ?? 3} distinct scenarios.`,
    "",
    "TARGET SENTENCES the learner has drilled (they should have natural opportunities to use these or close paraphrases):",
    ...b.sentences.slice(0, 25).map((s, i) => `${i + 1}. "${s.english}"${s.expected_intent ? `  [intent: ${s.expected_intent}]` : ""}`),
  ];
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
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
  if (!Array.isArray(body.sentences) || body.sentences.length === 0) {
    return new Response(JSON.stringify({ error: "Missing 'sentences' array" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
        model: body.model || "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(body) },
        ],
        tools: [TOOL_DEF],
        tool_choice: { type: "function", function: { name: "scenarios" } },
      }),
    });
  } catch (e) {
    console.error("[scenario-generate] network", e);
    return new Response(JSON.stringify({ error: "Upstream network error" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (aiRes.status === 429) {
    return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (aiRes.status === 402) {
    return new Response(JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }), {
      status: 402,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!aiRes.ok) {
    const t = await aiRes.text();
    console.error("[scenario-generate] gateway error", aiRes.status, t);
    return new Response(JSON.stringify({ error: "AI gateway error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const data = await aiRes.json();
  const argStr = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argStr) {
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

  return new Response(JSON.stringify({ scenarios: parsed.scenarios ?? [] }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
