import { supabase } from "@/integrations/supabase/client";
import { useSettingsStore } from "@/store/settingsStore";
import { coerceBookModel } from "@/lib/aiModels";
import type { BookAIModelRef } from "@/types";

export class HtmlFilenameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HtmlFilenameError";
  }
}

function cleanFilename(input: string): string {
  return (
    input
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/["'“”‘’`]/g, "")
      .replace(/\.html?$/i, "")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "متن خبری"
  );
}

function prompt(title: string, excerpt?: string, siteName?: string | null): string {
  return `برای این متن خبری یک نام فایل فارسی کوتاه، طبیعی و واضح پیشنهاد بده.

قواعد:
- فقط خود نام را بنویس؛ بدون توضیح، بدون گیومه، بدون پسوند html.
- فارسی باشد.
- ۳ تا ۸ کلمه.
- مناسب ذخیره فایل باشد و کاراکترهای ممنوعه فایل نداشته باشد.

عنوان: ${title || "(بدون عنوان)"}
منبع: ${siteName || "(نامشخص)"}
بخشی از متن:
"""
${(excerpt || "").slice(0, 2500)}
"""`;
}

async function suggestWithGemini(
  apiKey: string,
  model: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: userPrompt }] }] }),
    },
  );
  if (res.status === 401 || res.status === 403) throw new HtmlFilenameError("Gemini key rejected.");
  if (!res.ok) throw new HtmlFilenameError(`Gemini filename failed (${res.status}).`);
  const data = await res.json();
  return cleanFilename(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join(" ") ?? "",
  );
}

async function suggestWithGroq(apiKey: string, model: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "You write short Persian filenames. Return only the filename text.",
        },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });
  if (res.status === 401 || res.status === 403) throw new HtmlFilenameError("Groq key rejected.");
  if (!res.ok) throw new HtmlFilenameError(`Groq filename failed (${res.status}).`);
  const data = await res.json();
  return cleanFilename(data?.choices?.[0]?.message?.content ?? "");
}

export async function suggestPersianHtmlFilename(args: {
  title: string;
  excerpt?: string;
  siteName?: string | null;
  url?: string;
  modelRef?: BookAIModelRef;
}): Promise<string> {
  const settings = useSettingsStore.getState().settings;
  const ref = coerceBookModel(
    args.modelRef ?? settings.htmlFilenameModelRef ?? "google/gemini-3.1-flash-lite-preview",
  );
  const userPrompt = prompt(args.title, args.excerpt, args.siteName);

  if (ref.provider === "gateway") {
    const { data, error } = await supabase.functions.invoke<{ filename?: string; error?: string }>(
      "suggest-html-filename",
      {
        body: {
          title: args.title,
          excerpt: args.excerpt,
          siteName: args.siteName,
          url: args.url,
          model: ref.model,
        },
      },
    );
    if (error) throw new HtmlFilenameError(error.message || "AI filename failed.");
    if (!data?.filename) throw new HtmlFilenameError(data?.error || "AI filename failed.");
    return cleanFilename(data.filename);
  }

  if (ref.provider === "gemini") {
    const key = settings.geminiApiKey?.trim();
    if (!key) throw new HtmlFilenameError("Gemini API key is empty.");
    return suggestWithGemini(key, ref.model, userPrompt);
  }

  const key = settings.groqApiKey?.trim();
  if (!key) throw new HtmlFilenameError("Groq API key is empty.");
  return suggestWithGroq(key, ref.model, userPrompt);
}
