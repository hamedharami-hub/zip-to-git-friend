// Sentence Planner — generates a mixed-folder scenario from selected sentences.
// Input: { topic?: string, role?: string, sentences: { english, persian, category }[] }
// Output: { title, scenario, steps: [{ stepIndex, prompt_fa, prompt_en, target_english, hint?, sourceSentenceId? }] }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InSentence {
  id: string;
  english: string;
  persian?: string | null;
  category?: string | null;
  subcategory?: string | null;
}

interface PlannerRequest {
  topic?: string;
  role?: string;
  sentences: InSentence[];
  model?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as PlannerRequest;
    if (!body?.sentences || !Array.isArray(body.sentences) || body.sentences.length === 0) {
      return new Response(JSON.stringify({ error: "sentences[] required" }), {
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

    const sentenceList = body.sentences
      .slice(0, 25)
      .map(
        (s, i) =>
          `${i + 1}. [${s.id}] (${s.category ?? "-"}/${s.subcategory ?? "-"}) ${s.english}${s.persian ? ` — ${s.persian}` : ""}`,
      )
      .join("\n");

    const sys = `You are an English-coach scenario builder for Persian-speaking IELTS/OET learners.
Build ONE coherent real-life scenario (3-8 turns) that naturally weaves the GIVEN target sentences into the dialogue.
Each step has a Persian prompt the learner sees, an English coaching hint, and the target English the learner must say.
You MUST reuse target sentences from the list when natural. Pick the source sentence id when used.
Return ONLY valid JSON.`;

    const user = `Topic: ${body.topic ?? "general"}
Role: ${body.role ?? "learner"}

Target sentences (use as many as fit naturally; prefer 4-7):
${sentenceList}

Output JSON shape:
{
  "title": "short scenario title",
  "scenario": "1-2 sentence setup in English",
  "steps": [
    {
      "stepIndex": 1,
      "prompt_fa": "موقعیت یا چیزی که طرف مقابل گفت (به فارسی)",
      "prompt_en": "what the other speaker says / situation in English",
      "target_english": "exact English the learner should produce",
      "hint": "optional 1-line tip",
      "sourceSentenceId": "id from the list, or null"
    }
  ]
}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: body.model || "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ error: "AI gateway error", detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid AI JSON", raw: content }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
