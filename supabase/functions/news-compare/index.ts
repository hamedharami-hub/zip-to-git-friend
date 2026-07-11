/**
 * Compare related news coverage.
 *
 * Body: {
 *   main: { title: string; siteName?: string; contentMd?: string; excerpt?: string };
 *   related: Array<{ title: string; url: string; siteName?: string; excerpt?: string; contentMd?: string }>;
 *   model?: string;
 * }
 *
 * Returns: { title, contentMd, contentHtml, model }
 *
 * The AI compares what OTHER outlets add, contradict, or frame differently
 * compared to the main article. Output is Persian (Farsi) markdown so the
 * Iranian learner can quickly grasp how coverage diverges.
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_MODEL = "google/gemini-3-flash-preview";
const ALLOWED_MODELS = new Set([
  "google/gemini-3-flash-preview",
  "google/gemini-3.1-flash-lite-preview",
  "google/gemini-3.5-flash",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
]);

const SYSTEM_PROMPT = `You are a sharp Persian-language news analyst writing for an Iranian reader.
You are given ONE main article (که کاربر همین الان خوانده) و چندین مقاله مرتبط از منابع دیگر.

Your job: یک تحلیل کوتاه و سازمان‌یافته به فارسی بنویس که نشان دهد بقیه‌ی منابع چه چیزی اضافه‌تر، متفاوت یا متناقض می‌گویند.

ساختار خروجی (markdown کاملا فارسی):
# تفاوت پوشش این خبر
*یک جمله TL;DR در یک خط.*

## نکات اضافه که فقط در منابع دیگر آمده
- چند بولت کوتاه. کنار هر بولت در پرانتز نام منبع. مثلا: «(منبع: Reuters)».

## جایی که منابع با هم اختلاف دارند
- بولت‌ها — هر بولت تضاد یا اختلاف عدد/تفسیر را با ذکر منبع‌ها بیان کند.

## زاویه‌ی هر منبع
- **نام منبع ۱:** جمله‌ای کوتاه درباره‌ی زاویه/لحن/تأکید.
- **نام منبع ۲:** ...

## جمع‌بندی
یک پاراگراف کوتاه. اگر منبع جدیدی چیز مهمی اضافه کرده، آن را برجسته کن.

قوانین:
- فقط از اطلاعات ارائه‌شده استفاده کن. چیزی از خودت اختراع نکن.
- اگر در عمل تفاوت معناداری وجود ندارد، صادقانه بگو «همه‌ی منابع تقریباً همان روایت را دارند».
- خروجی فقط markdown باشد. هیچ توضیح اضافه یا پیش‌گفتار درباره‌ی وظیفه نده.
- همیشه با ابزار emit_compare پاسخ بده.`;

function wc(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function mdToHtml(md: string): string {
  // Minimal markdown → HTML (headings, bold, italic, lists, paragraphs).
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inUl = false;
  const flushUl = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
  };
  const inline = (t: string) =>
    esc(t)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushUl();
      continue;
    }
    let m;
    if ((m = line.match(/^#\s+(.*)$/))) {
      flushUl();
      out.push(`<h1>${inline(m[1])}</h1>`);
      continue;
    }
    if ((m = line.match(/^##\s+(.*)$/))) {
      flushUl();
      out.push(`<h2>${inline(m[1])}</h2>`);
      continue;
    }
    if ((m = line.match(/^###\s+(.*)$/))) {
      flushUl();
      out.push(`<h3>${inline(m[1])}</h3>`);
      continue;
    }
    if ((m = line.match(/^[-*]\s+(.*)$/))) {
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    flushUl();
    out.push(`<p>${inline(line)}</p>`);
  }
  flushUl();
  return out.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { main, related, model: requestedModel } = await req.json();
    if (!main || typeof main.title !== "string") {
      return new Response(JSON.stringify({ error: "main { title, ... } is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(related) || related.length === 0) {
      return new Response(JSON.stringify({ error: "related[] is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model =
      requestedModel && ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;

    const mainBlock = {
      title: String(main.title).slice(0, 250),
      siteName: main.siteName ?? null,
      content: String(main.contentMd ?? main.excerpt ?? "").slice(0, 4000),
    };
    const relatedBlock = related.slice(0, 12).map((a: any) => ({
      title: String(a.title ?? "").slice(0, 250),
      url: String(a.url ?? ""),
      siteName: a.siteName ?? null,
      content: String(a.contentMd ?? a.excerpt ?? "").slice(0, 1500),
    }));

    const userPrompt = [
      "MAIN ARTICLE (آنچه کاربر همین الان خوانده):",
      "```json",
      JSON.stringify(mainBlock, null, 2),
      "```",
      "",
      "RELATED COVERAGE (منابع دیگر):",
      "```json",
      JSON.stringify(relatedBlock, null, 2),
      "```",
    ].join("\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "emit_compare",
              description: "Return the comparison analysis in Persian markdown.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "عنوان کوتاه (≤ ۱۲ کلمه)." },
                  markdown: { type: "string", description: "متن کامل تحلیل به markdown فارسی." },
                },
                required: ["title", "markdown"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_compare" } },
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errBody);
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again in a moment." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Top up in workspace settings." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      return new Response(JSON.stringify({ error: `AI gateway error (${aiRes.status})` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI did not return a tool call" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const args = JSON.parse(toolCall.function.arguments);
    const title: string = args.title ?? "تفاوت پوشش این خبر";
    const markdown: string = args.markdown ?? "";

    return new Response(
      JSON.stringify({
        title,
        contentMd: markdown,
        contentHtml: mdToHtml(markdown),
        wordCount: wc(markdown),
        model,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("news-compare error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
