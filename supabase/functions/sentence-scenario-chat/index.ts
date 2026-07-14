// Roleplay chat for a Scenario session.
// In addition to playing the AI character, this evaluates which target
// sentences the learner has used (semantically) and detects when the
// scenario goal has been satisfied.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TargetSentence {
  id: string;
  english: string;
}

interface ReqBody {
  scenario: {
    title_en: string;
    user_role: string;
    ai_role: string;
    scene_en: string;
    goal_en: string;
  };
  target_sentences: TargetSentence[];
  /** ids of target sentences already used in earlier turns (skip re-checking those). */
  already_used_ids?: string[];
  transcript: string;
  history?: { role: "user" | "assistant"; content: string }[];
  model?: string;
}

const SYSTEM_PROMPT = `You are an in-character roleplay partner for a high-stakes English speaking
exam (PTE / OPRA / OET / IELTS / interview). You do TWO things:

1. STAY IN CHARACTER as the AI role described in the SCENE. Reply naturally
   in 1–3 spoken sentences that move the conversation forward and (when
   possible) gently create openings for the learner to use the TARGET
   SENTENCES below — without ever quoting them or tipping the learner off.

2. EVALUATE the user's last transcript:
   - GRANULAR grammar markers (each pinpoints one error: span / correction /
     rule label / explanation / severity). Empty array if clean.
   - SEMANTIC USAGE: for EACH target sentence id, decide whether the user's
     latest transcript uses it (or a close paraphrase that covers the same
     intent). Output every id with used=true|false. Be generous about
     paraphrases but reject unrelated wording.
   - SCENARIO COMPLETION: set scenario_complete=true ONLY when the user has
     clearly fulfilled the GOAL of the scenario (or the conversation has run
     its natural course). Otherwise false.

Always call the "respond" tool. Never reply in plain text.`;

const TOOL_DEF = {
  type: "function",
  function: {
    name: "respond",
    description: "Reply in character + evaluate user transcript.",
    parameters: {
      type: "object",
      properties: {
        ai_audio_response: {
          type: "string",
          description: "Your spoken reply, 1–3 sentences. Plain text for TTS.",
        },
        grammar_corrections: {
          type: "string",
          description: "Short summary of grammar issues. Empty if clean.",
        },
        grammar_markers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              span: { type: "string" },
              correction: { type: "string" },
              rule_label: { type: "string" },
              explanation: { type: "string" },
              severity: { type: "string", enum: ["minor", "major"] },
            },
            required: ["span", "correction", "rule_label", "explanation", "severity"],
            additionalProperties: false,
          },
        },
        target_usage: {
          type: "array",
          description:
            "For EACH target sentence id, whether the user's latest transcript used it (or close paraphrase).",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              used: { type: "boolean" },
              similarity: { type: "number", description: "0..1 confidence." },
            },
            required: ["id", "used"],
            additionalProperties: false,
          },
        },
        scenario_complete: { type: "boolean" },
        completion_reason: { type: "string", description: "If complete, one short sentence why." },
        suggestion_for_user: {
          type: "string",
          description:
            "Optional gentle nudge to the user IF they keep ignoring target sentences. Empty otherwise.",
        },
      },
      required: ["ai_audio_response", "grammar_markers", "target_usage", "scenario_complete"],
      additionalProperties: false,
    },
  },
} as const;

function buildUserPrompt(b: ReqBody): string {
  const remaining = b.target_sentences.filter((t) => !(b.already_used_ids ?? []).includes(t.id));
  const lines = [
    `SCENARIO TITLE: ${b.scenario.title_en}`,
    `USER plays: ${b.scenario.user_role}`,
    `YOU play: ${b.scenario.ai_role}`,
    `SCENE: ${b.scenario.scene_en}`,
    `USER GOAL: ${b.scenario.goal_en}`,
    "",
    `TARGET SENTENCES (still unused — try to create openings for these):`,
    ...remaining.map((t) => `  [${t.id}] "${t.english}"`),
    "",
    `ALL TARGET SENTENCES (evaluate ALL ids in target_usage):`,
    ...b.target_sentences.map((t) => `  [${t.id}] "${t.english}"`),
    "",
    `USER TRANSCRIPT: """${b.transcript}"""`,
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
  if (
    !body?.scenario ||
    !Array.isArray(body.target_sentences) ||
    typeof body.transcript !== "string"
  ) {
    return new Response(JSON.stringify({ error: "Missing fields" }), {
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

  const messages: { role: string; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];
  // Cap history to last 6 turns to keep context tight (12 messages).
  if (Array.isArray(body.history)) {
    for (const m of body.history.slice(-12)) {
      if (m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") {
        messages.push({ role: m.role, content: m.content });
      }
    }
  }
  messages.push({ role: "user", content: buildUserPrompt(body) });

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
        messages,
        tools: [TOOL_DEF],
        tool_choice: { type: "function", function: { name: "respond" } },
      }),
    });
  } catch (e) {
    console.error("[scenario-chat] network", e);
    return new Response(JSON.stringify({ error: "Upstream network error" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (aiRes.status === 429) {
    return new Response(
      JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  if (aiRes.status === 402) {
    return new Response(
      JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
      {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  if (!aiRes.ok) {
    const t = await aiRes.text();
    console.error("[scenario-chat] gateway error", aiRes.status, t);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
  let parsed: any;
  try {
    parsed = typeof argStr === "string" ? JSON.parse(argStr) : argStr;
  } catch {
    return new Response(JSON.stringify({ error: "Failed to parse AI JSON." }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sevs = new Set(["minor", "major"]);
  const grammar_markers = Array.isArray(parsed.grammar_markers)
    ? parsed.grammar_markers
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
        .map((m: any) => ({
          span: String(m?.span ?? "").trim(),
          correction: String(m?.correction ?? "").trim(),
          rule_label: String(m?.rule_label ?? "").trim(),
          explanation: String(m?.explanation ?? "").trim(),
          severity: sevs.has(m?.severity) ? m.severity : "minor",
        }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
        .filter((m: any) => m.span && m.correction)
    : [];

  const target_usage = Array.isArray(parsed.target_usage)
    ? parsed.target_usage
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
        .map((u: any) => ({
          id: String(u?.id ?? ""),
          used: !!u?.used,
          similarity: typeof u?.similarity === "number" ? u.similarity : u?.used ? 1 : 0,
        }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
        .filter((u: any) => u.id)
    : [];

  return new Response(
    JSON.stringify({
      ai_audio_response: String(parsed.ai_audio_response ?? ""),
      grammar_corrections: String(parsed.grammar_corrections ?? ""),
      grammar_markers,
      target_usage,
      scenario_complete: !!parsed.scenario_complete,
      completion_reason: String(parsed.completion_reason ?? ""),
      suggestion_for_user: String(parsed.suggestion_for_user ?? ""),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
  );
});
