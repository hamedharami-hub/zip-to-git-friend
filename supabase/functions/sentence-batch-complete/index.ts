// Batch-complete missing fields on sentence_lab using Lovable AI Gateway.
// Fills: english_aussie, expected_intent, ai_counter_prompt for sentences
// where any of these is null. Processes up to `limit` rows per call.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SentenceRow {
  id: string;
  english: string;
  persian: string | null;
  english_aussie: string | null;
  expected_intent: string | null;
  ai_counter_prompt: string | null;
  category: string | null;
  subcategory: string | null;
}

async function completeOne(s: SentenceRow): Promise<Partial<SentenceRow>> {
  const need = {
    aussie: !s.english_aussie,
    intent: !s.expected_intent,
    counter: !s.ai_counter_prompt,
  };
  if (!need.aussie && !need.intent && !need.counter) return {};

  const sys = `You enrich English-learning sentences for an Australian-English learner app.
Always return strict JSON. No markdown, no commentary.`;
  const user = `Sentence: "${s.english}"
${s.persian ? `Persian translation: "${s.persian}"` : ""}
Category: ${s.category ?? "general"} / ${s.subcategory ?? "misc"}

Return JSON with these keys${need.aussie ? "" : ' (omit "english_aussie")'}${need.intent ? "" : ' (omit "expected_intent")'}${need.counter ? "" : ' (omit "ai_counter_prompt")'}:
${need.aussie ? '- "english_aussie": natural Australian-English version (slang/idiom OK if appropriate, otherwise same sentence)\n' : ""}${need.intent ? '- "expected_intent": one short phrase describing communicative goal (e.g. "asking for clarification", "polite refusal")\n' : ""}${need.counter ? '- "ai_counter_prompt": one realistic line another speaker would say in reply, to use in roleplay practice\n' : ""}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) {
    throw new Error(`AI ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json();
  const txt = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(txt);
  } catch {
    parsed = {};
  }
  const out: Partial<SentenceRow> = {};
  if (need.aussie && typeof parsed.english_aussie === "string")
    out.english_aussie = parsed.english_aussie;
  if (need.intent && typeof parsed.expected_intent === "string")
    out.expected_intent = parsed.expected_intent;
  if (need.counter && typeof parsed.ai_counter_prompt === "string")
    out.ai_counter_prompt = parsed.ai_counter_prompt;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const limit: number = Math.min(Math.max(Number(body.limit) || 25, 1), 100);
    const category: string | undefined = body.category;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    let q = supabase
      .from("sentence_lab")
      .select(
        "id, english, persian, english_aussie, expected_intent, ai_counter_prompt, category, subcategory",
      )
      .eq("status", "published")
      .or("english_aussie.is.null,expected_intent.is.null,ai_counter_prompt.is.null")
      .limit(limit);
    if (category) q = q.eq("category", category);

    const { data: rows, error } = await q;
    if (error) throw error;

    let updated = 0;
    let failed = 0;
    const results: Array<{ id: string; ok: boolean; fields?: string[]; error?: string }> = [];

    for (const row of rows ?? []) {
      try {
        const patch = await completeOne(row as SentenceRow);
        if (Object.keys(patch).length > 0) {
          const { error: upErr } = await supabase
            .from("sentence_lab")
            .update(patch)
            .eq("id", row.id);
          if (upErr) throw upErr;
          updated++;
          results.push({ id: row.id, ok: true, fields: Object.keys(patch) });
        } else {
          results.push({ id: row.id, ok: true, fields: [] });
        }
        // gentle pacing
        await new Promise((r) => setTimeout(r, 250));
      } catch (e: any) {
        failed++;
        results.push({ id: row.id, ok: false, error: String(e?.message ?? e) });
      }
    }

    return new Response(JSON.stringify({ scanned: rows?.length ?? 0, updated, failed, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
