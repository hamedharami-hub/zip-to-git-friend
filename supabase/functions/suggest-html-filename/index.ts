// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "google/gemini-3.1-flash-lite-preview";

function cleanFilename(input: string): string {
  return (
    (input || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/["'“”‘’`]/g, "")
      .replace(/\.html?$/i, "")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "متن خبری"
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { title, excerpt, siteName, model } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const prompt = `برای این متن خبری یک نام فایل فارسی کوتاه، طبیعی و واضح پیشنهاد بده.

قواعد:
- فقط خود نام را بنویس؛ بدون توضیح، بدون گیومه، بدون پسوند html.
- فارسی باشد.
- ۳ تا ۸ کلمه.
- مناسب ذخیره فایل باشد و کاراکترهای ممنوعه فایل نداشته باشد.

عنوان: ${String(title || "(بدون عنوان)").slice(0, 250)}
منبع: ${String(siteName || "(نامشخص)").slice(0, 100)}
بخشی از متن:
"""
${String(excerpt || "").slice(0, 2500)}
"""`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: typeof model === "string" && model ? model : DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content: "You write short Persian filenames. Return only the filename text.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: `AI gateway error (${aiRes.status}): ${t.slice(0, 160)}` }),
        {
          status: aiRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const data = await aiRes.json();
    const filename = cleanFilename(data?.choices?.[0]?.message?.content ?? "");
    return new Response(JSON.stringify({ filename }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "Failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
