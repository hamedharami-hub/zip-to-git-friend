// Roleplay controller for Sentence Lab.
// Receives the user's spoken transcript + expected intent + counter prompt,
// asks Lovable AI (Gemini 3 Flash) to play the role of a conversational
// partner, and returns strict JSON with reply / corrections / harvested phrases.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  transcript: string;
  expected_intent?: string | null;
  ai_counter_prompt?: string | null;
  scenario_english?: string | null;
  scenario_persian?: string | null;
  expected_duration_seconds?: number | null;
  spoken_duration_seconds?: number | null;
  /** Who the USER is playing. AI takes the opposite role. */
  role_mode?: "professional" | "candidate" | null;
  history?: { role: "user" | "assistant"; content: string }[];
}

const SYSTEM_PROMPT = `You are an English conversation partner used inside a high-stakes
language exam simulator (PTE / OPRA / OET / IELTS / interview style). Your job is two things at once:

1. ROLEPLAY: Stay STRICTLY in character as the partner described in the scenario
   and produce a natural, native-sounding spoken reply (1–3 sentences) that keeps the
   conversation moving.
   - Honor the ROLE ASSIGNMENT exactly. If the user is the "Pharmacist/Professional"
     then YOU are the Patient/Examiner (challenging, asks questions, may be confused
     or anxious). If the user is the "Patient/Candidate" then YOU are the
     Pharmacist/Professional/Examiner (authoritative, probing, evaluating).
   - If the user's transcript MATCHES the "expected_intent", respond naturally to
     continue the dialogue.
   - DIGRESSION CONTROL: If the user has gone off-topic, smoothly pivot back using
     the provided "ai_counter_prompt" as your guiding nudge (do NOT quote it
     verbatim — paraphrase, but stay firmly on the medical/exam topic).

2. EVALUATE: Silently grade the user's transcript and harvest reusable native
   phrases YOU used in your reply.
   - Produce GRANULAR grammar_markers: pinpoint each individual mistake with the
     EXACT erroneous substring from the user's transcript, the correction, a
     short rule label, and one-sentence explanation. If the transcript is clean,
     return an empty array.
   - Fluency penalty: If ACTUAL spoken duration exceeds EXPECTED duration by more
     than 20%, mention pacing in fluency_penalty_notes.

You MUST call the "respond" tool with strict JSON. Never reply in plain text.`;

function buildUserPrompt(b: ReqBody): string {
  const userRole = b.role_mode === "candidate" ? "Patient/Candidate" : "Pharmacist/Professional";
  const aiRole = b.role_mode === "candidate" ? "Pharmacist/Examiner" : "Patient/Examiner";
  const expected = b.expected_duration_seconds ?? null;
  const spoken = b.spoken_duration_seconds ?? null;
  const overBudget =
    expected && spoken && spoken > expected * 1.2
      ? `YES (spoke ${Math.round(((spoken - expected) / expected) * 100)}% over the expected duration)`
      : "no";
  const lines = [
    `ROLE ASSIGNMENT — USER plays: ${userRole}. YOU play: ${aiRole}.`,
    `SCENARIO (EN): ${b.scenario_english ?? "(none)"}`,
    `SCENARIO (FA): ${b.scenario_persian ?? "(none)"}`,
    `EXPECTED INTENT: ${b.expected_intent ?? "(none)"}`,
    `COUNTER-PIVOT PROMPT (use only if user digresses): ${b.ai_counter_prompt ?? "(none)"}`,
    `EXPECTED SPEAKING DURATION (s): ${expected ?? "?"}`,
    `ACTUAL SPOKEN DURATION (s): ${spoken ?? "?"}`,
    `FLUENCY OVER BUDGET: ${overBudget}`,
    "",
    `USER TRANSCRIPT: """${b.transcript}"""`,
  ];
  return lines.join("\n");
}

const TOOL_DEF = {
  type: "function",
  function: {
    name: "respond",
    description: "Reply in character AND grade the user's transcript. Always call this tool.",
    parameters: {
      type: "object",
      properties: {
        ai_audio_response: {
          type: "string",
          description:
            "Your in-character spoken reply, 1–3 natural sentences. Plain text only — this will be fed to TTS.",
        },
        grammar_corrections: {
          type: "string",
          description:
            "Concise feedback on grammar / word choice mistakes in the user's transcript. Empty string if perfect.",
        },
        grammar_markers: {
          type: "array",
          description:
            "Granular per-error markers on the user's transcript. Each marker pinpoints ONE specific mistake (wrong preposition, tense, article, agreement, word choice). Empty array if transcript is clean. Use the EXACT substring from the user's transcript in 'span'.",
          items: {
            type: "object",
            properties: {
              span: {
                type: "string",
                description:
                  "The exact erroneous substring as it appears in the user transcript (case-sensitive). Keep short — 1 to 4 words.",
              },
              correction: {
                type: "string",
                description: "The corrected version of that span.",
              },
              rule_label: {
                type: "string",
                description:
                  "Short grammar rule name, e.g. 'Preposition: depend ON', 'Past simple', 'Article a/an', 'Subject-verb agreement'.",
              },
              explanation: {
                type: "string",
                description: "One short sentence explaining the rule for the learner.",
              },
              severity: {
                type: "string",
                enum: ["minor", "major"],
                description: "minor = stylistic; major = breaks grammar / changes meaning.",
              },
            },
            required: ["span", "correction", "rule_label", "explanation", "severity"],
            additionalProperties: false,
          },
        },
        fluency_penalty_notes: {
          type: "string",
          description:
            "Short note about pacing/fluency. Mention if the user spoke much slower than the expected duration. Empty string if fine.",
        },
        harvested_sentences: {
          type: "array",
          items: { type: "string" },
          description:
            "Native English phrases or full sentences from YOUR ai_audio_response that the learner could reuse (1–4 items).",
        },
        intent_match: {
          type: "string",
          enum: ["green", "yellow", "red"],
          description:
            "green = user matched the expected intent well. yellow = partial / minor digression. red = clear digression or off-topic.",
        },
      },
      required: [
        "ai_audio_response",
        "grammar_corrections",
        "grammar_markers",
        "fluency_penalty_notes",
        "harvested_sentences",
        "intent_match",
      ],
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
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.transcript || typeof body.transcript !== "string") {
    return new Response(JSON.stringify({ error: "Missing 'transcript' string" }), {
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

  const messages: { role: string; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];
  if (Array.isArray(body.history)) {
    for (const m of body.history.slice(-10)) {
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
        model: (typeof body.model === "string" && body.model) || "google/gemini-3-flash-preview",
        messages,
        tools: [TOOL_DEF],
        tool_choice: { type: "function", function: { name: "respond" } },
      }),
    });
  } catch (e) {
    console.error("[sentence-roleplay] network error", e);
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
      JSON.stringify({
        error: "Payment required, please add funds to your Lovable AI workspace.",
      }),
      { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!aiRes.ok) {
    const t = await aiRes.text();
    console.error("[sentence-roleplay] AI gateway error", aiRes.status, t);
    return new Response(JSON.stringify({ error: "AI gateway error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const data = await aiRes.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  const argStr = call?.function?.arguments;
  if (!argStr) {
    console.error(
      "[sentence-roleplay] no tool call in response",
      JSON.stringify(data).slice(0, 500),
    );
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

  const sevs = new Set(["minor", "major"]);
  const grammar_markers = Array.isArray(parsed.grammar_markers)
    ? parsed.grammar_markers
        .map((m: any) => ({
          span: String(m?.span ?? "").trim(),
          correction: String(m?.correction ?? "").trim(),
          rule_label: String(m?.rule_label ?? "").trim(),
          explanation: String(m?.explanation ?? "").trim(),
          severity: sevs.has(m?.severity) ? m.severity : "minor",
        }))
        .filter((m: any) => m.span && m.correction)
    : [];

  const result = {
    ai_audio_response: String(parsed.ai_audio_response ?? ""),
    grammar_corrections: String(parsed.grammar_corrections ?? ""),
    grammar_markers,
    fluency_penalty_notes: String(parsed.fluency_penalty_notes ?? ""),
    harvested_sentences: Array.isArray(parsed.harvested_sentences)
      ? parsed.harvested_sentences.map((s: unknown) => String(s)).filter(Boolean)
      : [],
    intent_match: ["green", "yellow", "red"].includes(parsed.intent_match)
      ? (parsed.intent_match as "green" | "yellow" | "red")
      : "yellow",
  };

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
