/**
 * Wrappers around the `leitner-generate-image` and
 * `leitner-generate-example` edge functions. Used by the Leitner UI when
 * the user clicks "Generate image" / "Generate example" on a card.
 */
import { supabase } from "@/integrations/supabase/client";

export interface GeneratedImage {
  imageUrl: string;
}

export async function generateCardImage(input: {
  cardId: string;
  word: string;
  example?: string;
}): Promise<GeneratedImage> {
  const { data, error } = await supabase.functions.invoke("leitner-generate-image", {
    body: input,
  });
  if (error) throw new Error(error.message ?? "Image generation failed");
  if (!data?.imageUrl) throw new Error("No image returned");
  return { imageUrl: data.imageUrl as string };
}

/** Generate 3 fresh example sentences for a word/phrase. */
export async function generateCardExamples(input: {
  word: string;
  existingExample?: string;
}): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke("leitner-generate-example", {
    body: { ...input, mode: "examples" },
  });
  if (error) throw new Error(error.message ?? "Example generation failed");
  const result = data?.result;
  if (Array.isArray(result)) return result.map((s) => String(s));
  // Some models wrap the array in an object key
  if (result && typeof result === "object") {
    const arr = Object.values(result).find((v) => Array.isArray(v));
    if (Array.isArray(arr)) return arr.map((s) => String(s));
  }
  throw new Error("No examples returned");
}

/** Generate a concise English definition + Persian translation. */
export async function generateCardDefinition(input: {
  word: string;
}): Promise<{ definition: string; persian: string }> {
  const { data, error } = await supabase.functions.invoke("leitner-generate-example", {
    body: { ...input, mode: "definition" },
  });
  if (error) throw new Error(error.message ?? "Definition generation failed");
  const result = data?.result;
  if (result && typeof result === "object") {
    return {
      definition: String((result as Record<string, unknown>).definition ?? ""),
      persian: String((result as Record<string, unknown>).persian ?? ""),
    };
  }
  throw new Error("No definition returned");
}
