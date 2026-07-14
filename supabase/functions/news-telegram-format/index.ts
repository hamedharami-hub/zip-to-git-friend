/**
 * Rewrite a news article into a polished, blog-style Persian post suitable
 * for pasting into Telegram.
 *
 * Body: {
 *   title: string;
 *   contentMd?: string;       // raw English/source body (preferred)
 *   contentFa?: string;       // optional ready Persian translation
 *   url?: string;
 *   siteName?: string;
 *   model?: string;
 * }
 *
 * Returns: { title, markdown, html, plain, model }
 *
 *  - `markdown` uses Telegram-friendly conventions: **bold** for headings &
 *    key points, single blank line between paragraphs, no HTML tags.
 *  - `html` is the same content rendered with <b>, <p>, <br>; written to the
 *    clipboard alongside the plain text so apps that accept rich-text paste
 *    (Telegram desktop / mobile) keep the bold formatting.
 *  - `plain` is a pure-text fallback with bold markers stripped.
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

const SYSTEM_PROMPT = `تو یک ویراستار فارسی‌زبان حرفه‌ای هستی که خبر را برای کانال تلگرام بازنویسی می‌کنی.

هدف: متن نهایی باید آماده‌ی paste در تلگرام باشد — خوانا، تمیز، با لحن وبلاگی/مقاله‌ای، فارسی روان و درست.

ساختار خروجی (markdown ساده، فقط ** برای bold):
**{عنوان جذاب فارسی، یک خط، حداکثر ۱۲ کلمه}**

یک پاراگراف کوتاه مقدمه (۲ تا ۳ جمله) که خواننده را وارد ماجرا می‌کند.

**{زیرعنوان موضوعی}**
چند جمله توضیح. جمله‌ها کوتاه و واضح. اگر نکته مهمی هست با **bold** برجسته‌اش کن.

**{زیرعنوان موضوعی دیگر}**
ادامه‌ی توضیح…

(در صورت لزوم ۲ تا ۴ زیرعنوان دیگر)

**جمع‌بندی**
یک پاراگراف پایانی کوتاه با برداشت کلی.

قوانین سختگیرانه:
- خروجی فقط markdown باشد، بدون HTML، بدون code fence، بدون پیش‌گفتار.
- فقط از ** برای bold استفاده کن. از *italic* یا __ یا > یا - استفاده نکن.
- بین پاراگراف‌ها یک خط خالی بگذار.
- اعداد و اسامی خاص را دقیق نگه‌دار. چیزی از خودت اضافه نکن.
- اگر تناقض دیدی، صادقانه بگو «گزارش روشن نیست».
- لحن: حرفه‌ای، گرم، نه خبری خشک نه شبکه‌اجتماعی سطحی.
- همیشه با ابزار emit_post پاسخ بده.`;

function stripBold(md: string): string {
  return md.replace(/\*\*([^*]+)\*\*/g, "$1");
}

function mdToTelegramHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (t: string) => esc(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  // Split on blank lines into paragraphs.
  const blocks = md
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks.map((b) => `<p>${inline(b).replace(/\n/g, "<br>")}</p>`).join("\n");
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
    const { title, contentMd, contentFa, url, siteName, model: requestedModel } = await req.json();
    if (!title || typeof title !== "string") {
      return new Response(JSON.stringify({ error: "title is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = String(contentFa ?? contentMd ?? "").trim();
    if (!body) {
      return new Response(JSON.stringify({ error: "contentMd or contentFa is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model =
      requestedModel && ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;

    const userPrompt = [
      `عنوان اصلی: ${title}`,
      siteName ? `منبع: ${siteName}` : "",
      url ? `لینک: ${url}` : "",
      "",
      contentFa ? "متن (فارسی، نیازی به ترجمه نیست):" : "متن خام خبر:",
      "```",
      body.slice(0, 8000),
      "```",
    ]
      .filter(Boolean)
      .join("\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
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
              name: "emit_post",
              description: "Return the Telegram-ready Persian post.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "عنوان فارسی نهایی (یک خط)." },
                  markdown: {
                    type: "string",
                    description: "متن کامل با ** برای bold و خطوط خالی بین پاراگراف‌ها.",
                  },
                },
                required: ["title", "markdown"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_post" } },
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
    const outTitle: string = args.title ?? title;
    let markdown: string = (args.markdown ?? "").trim();
    // Ensure title is part of the markdown (some models put it only in `title`).
    if (!markdown.startsWith("**")) {
      markdown = `**${outTitle}**\n\n${markdown}`;
    }
    const html = mdToTelegramHtml(markdown);
    const plain = stripBold(markdown);

    return new Response(
      JSON.stringify({
        title: outTitle,
        markdown,
        html,
        plain,
        model,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
  } catch (e: any) {
    console.error("news-telegram-format error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
