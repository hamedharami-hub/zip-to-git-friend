/**
 * Discover fresh news on a topic using Gemini 3.5 Flash with
 * Google Search Grounding (built-in google_search tool).
 *
 * Body: { topic: string; windowHours?: number; maxResults?: number; language?: string }
 *
 * Returns: {
 *   items: Array<{ title, url, source, publishedAt?, summary }>,
 *   combinedArticle: { title, markdown },
 *   sources: Array<{ title, url }>,  // raw grounding URIs
 *   model: string
 * }
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL = "google/gemini-3.5-flash";

function buildSystemPrompt(nowIso: string): string {
  return `You are a real-time news researcher. The current date and time is ${nowIso} (UTC). Use Google Search to find the FRESHEST, most recent news on the user's topic — published as close to NOW as possible. NEVER return articles older than the requested time window. Prefer reputable mainstream sources. Diversify outlets.

Return ONLY valid minified JSON (no markdown, no commentary) matching exactly:
{
  "items": [
    { "title": string, "url": string, "source": string, "publishedAt": string | null, "summary": string }
  ],
  "combinedArticle": { "title": string, "markdown": string }
}

Rules:
- Every "url" MUST be a real article URL discovered via Google Search — NEVER invent.
- "publishedAt" MUST be an ISO-8601 date that falls within the requested time window relative to ${nowIso}. If you cannot verify a recent publication date, DO NOT include the item.
- "summary" is 2-3 sentences in English, factual.
- "combinedArticle.markdown" is a single coherent magazine-style English article (~600-900 words) that synthesises the items, with ## H2 sections. Use first-person voice. No bullet lists. End with a "## Sources" section listing each source as a markdown link.
- Output JSON only. No prose around it. No \`\`\` fences.`;
}

function safeParseJson(text: string): any | null {
  if (!text) return null;
  // strip fences if any
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  // try direct
  try { return JSON.parse(s); } catch { /* fall through */ }
  // try first {...} block
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch { /* ignore */ }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { topic, windowHours = 24, maxResults = 10, language = "any" } = await req.json();
    if (!topic || typeof topic !== "string") {
      return new Response(JSON.stringify({ error: "topic is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const cutoff = new Date(now.getTime() - windowHours * 3600 * 1000);
    const cutoffIso = cutoff.toISOString();

    const userPrompt = [
      `Current date/time (UTC): ${nowIso}`,
      `Topic: ${topic}`,
      `Time window: ONLY news published between ${cutoffIso} and ${nowIso} (i.e. within the last ${windowHours} hour(s)). Reject anything older.`,
      `Return at most ${Math.min(Math.max(maxResults, 3), 15)} items.`,
      `Preferred language of sources: ${language}.`,
      "",
      `Use Google Search NOW (today is ${now.toUTCString()}) to find the freshest articles, then return the JSON. Discard any result whose publication date is before ${cutoffIso}.`,
    ].join("\n");

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 8000,
          messages: [
            { role: "system", content: buildSystemPrompt(nowIso) },
            { role: "user", content: userPrompt },
          ],
          // Built-in Google Search grounding tool.
          tools: [{ google_search: {} }],
        }),
      },
    );

    if (!aiRes.ok) {
      const errBody = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errBody);
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Top up in workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: `AI gateway error (${aiRes.status}): ${errBody.slice(0, 300)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiData = await aiRes.json();
    const message = aiData?.choices?.[0]?.message;
    const text: string = message?.content ?? "";

    // Try to extract grounding sources from various possible shapes.
    const groundingSources: Array<{ title: string; url: string }> = [];
    const gm =
      message?.grounding_metadata ??
      message?.groundingMetadata ??
      aiData?.choices?.[0]?.grounding_metadata ??
      aiData?.grounding_metadata ??
      null;
    const chunks: any[] =
      gm?.grounding_chunks ?? gm?.groundingChunks ?? [];
    for (const c of chunks) {
      const w = c?.web ?? c;
      if (w?.uri) {
        groundingSources.push({
          title: String(w.title ?? w.uri),
          url: String(w.uri),
        });
      }
    }

    const parsed = safeParseJson(text);
    if (!parsed || !Array.isArray(parsed.items)) {
      console.error("news-discover-live: failed to parse JSON", text.slice(0, 500));
      return new Response(
        JSON.stringify({
          error: "Model did not return valid JSON.",
          raw: text.slice(0, 800),
          sources: groundingSources,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Sanitise items + drop anything older than the requested window when a date is present.
    const cutoffMs = cutoff.getTime();
    const items = (parsed.items as any[])
      .filter((it) => it && typeof it.url === "string" && /^https?:\/\//i.test(it.url))
      .slice(0, 20)
      .map((it) => ({
        title: String(it.title ?? "").slice(0, 400),
        url: String(it.url),
        source: String(it.source ?? "").slice(0, 120),
        publishedAt: it.publishedAt ? String(it.publishedAt).slice(0, 80) : null,
        summary: String(it.summary ?? "").slice(0, 1200),
      }))
      .filter((it) => {
        if (!it.publishedAt) return true;
        const t = Date.parse(it.publishedAt);
        if (!Number.isFinite(t)) return true;
        return t >= cutoffMs;
      });

    const combinedArticle = parsed.combinedArticle && typeof parsed.combinedArticle === "object"
      ? {
          title: String(parsed.combinedArticle.title ?? topic).slice(0, 300),
          markdown: String(parsed.combinedArticle.markdown ?? ""),
        }
      : { title: topic, markdown: "" };

    return new Response(
      JSON.stringify({
        items,
        combinedArticle,
        sources: groundingSources,
        model: MODEL,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("news-discover-live error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
