import type { SegmentAnalysis } from "@/types";

export class GeminiError extends Error {
  code: "missing_key" | "rate_limit" | "invalid_response" | "network" | "auth" | "unknown";
  constructor(code: GeminiError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "GeminiError";
  }
}

const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(key)}`;

function buildAnalysisPrompt(text: string): string {
  return `You are an English-to-Persian language learning assistant. Analyze this English subtitle line and return ONLY valid JSON (no markdown, no explanation):

Text: "${text.replace(/"/g, '\\"')}"

Return:
{
  "translation": "ترجمه طبیعی و روان فارسی کل جمله",
  "vocabulary": [
    {"word": "...", "translation": "فارسی", "partOfSpeech": "noun|verb|adj|adv", "example": "..."}
  ],
  "idioms": [
    {"phrase": "...", "meaning": "فارسی", "literalTranslation": "..."}
  ]
}

The "translation" field is REQUIRED — a natural, fluent Persian translation of the full sentence (not literal). Include only intermediate/advanced words in vocabulary (skip basic words like "the", "is", "go"). If no idioms, return empty array.`;
}

function stripFences(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return t.trim();
}

async function callGemini(prompt: string, apiKey: string, model: string): Promise<string> {
  if (!apiKey) throw new GeminiError("missing_key", "Gemini API key is not set.");

  let res: Response;
  try {
    res = await fetch(ENDPOINT(model, apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    });
  } catch (e) {
    throw new GeminiError("network", "Network error while contacting Gemini.");
  }

  if (res.status === 429) {
    throw new GeminiError("rate_limit", "Gemini rate limit hit. Slow down or try later.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new GeminiError("auth", "Gemini rejected the API key.");
  }
  if (!res.ok) {
    throw new GeminiError("unknown", `Gemini error (${res.status}).`);
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new GeminiError("invalid_response", "Gemini returned non-JSON.");
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
  if (!text) throw new GeminiError("invalid_response", "Gemini returned empty content.");
  return text;
}

export async function analyzeSegment(
  text: string,
  apiKey: string,
  model: string,
): Promise<SegmentAnalysis> {
  const raw = await callGemini(buildAnalysisPrompt(text), apiKey, model);
  const cleaned = stripFences(raw);
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // last-ditch: try extracting first {...} block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new GeminiError("invalid_response", "Could not parse JSON from Gemini.");
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      throw new GeminiError("invalid_response", "Could not parse JSON from Gemini.");
    }
  }

  const vocabulary = Array.isArray(parsed?.vocabulary)
    ? parsed.vocabulary
        .filter((v: any) => v && typeof v.word === "string" && typeof v.translation === "string")
        .map((v: any) => ({
          word: String(v.word),
          translation: String(v.translation),
          partOfSpeech: v.partOfSpeech ? String(v.partOfSpeech) : undefined,
          example: v.example ? String(v.example) : undefined,
        }))
    : [];
  const idioms = Array.isArray(parsed?.idioms)
    ? parsed.idioms
        .filter((i: any) => i && typeof i.phrase === "string" && typeof i.meaning === "string")
        .map((i: any) => ({
          phrase: String(i.phrase),
          meaning: String(i.meaning),
          literalTranslation: i.literalTranslation ? String(i.literalTranslation) : undefined,
        }))
    : [];

  return {
    vocabulary,
    idioms,
    translation:
      typeof parsed?.translation === "string" ? String(parsed.translation).trim() : undefined,
    analyzedAt: Date.now(),
    model,
  };
}

/**
 * Analyze MANY subtitle cues in a single Gemini request.
 * Returns a Map keyed by cue id. Cues missing from the response are simply
 * absent — the caller can fall back to single-cue analysis for those.
 */
export async function analyzeSegmentsBatch(
  cues: Array<{ id: string; text: string }>,
  apiKey: string,
  model: string,
): Promise<Map<string, SegmentAnalysis>> {
  const out = new Map<string, SegmentAnalysis>();
  if (cues.length === 0) return out;

  // Build a numbered list — using simple short ids keeps the model focused.
  const lines = cues
    .map((c, i) => `[${i + 1}] "${c.text.replace(/"/g, '\\"').replace(/\n/g, " ")}"`)
    .join("\n");

  const prompt = `You are an English-to-Persian language learning assistant.
You will receive ${cues.length} numbered English subtitle lines from the SAME video.
For EACH line independently, produce the same analysis you would for a single line: a fluent natural Persian translation of THAT line, intermediate/advanced vocabulary from THAT line, and any idioms / phrasal verbs / fixed expressions in THAT line.

Treat each line on its own — do NOT merge meaning across lines. Skip basic words (the, is, go, big…). If a line has no idioms, return an empty idioms array for it. The "translation" field is REQUIRED for every line.

Return ONLY valid JSON (no markdown, no code fences, no commentary) in this EXACT shape:
{
  "results": [
    {
      "n": 1,
      "translation": "ترجمه طبیعی فارسی این جمله",
      "vocabulary": [
        {"word":"...","translation":"فارسی","partOfSpeech":"noun|verb|adj|adv","example":"..."}
      ],
      "idioms": [
        {"phrase":"...","meaning":"فارسی","literalTranslation":"..."}
      ]
    },
    ... one object per input line, in order ...
  ]
}

INPUT LINES:
${lines}`;

  const raw = await callGemini(prompt, apiKey, model);
  const cleaned = stripFences(raw);
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new GeminiError("invalid_response", "Could not parse batch JSON from Gemini.");
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      throw new GeminiError("invalid_response", "Could not parse batch JSON from Gemini.");
    }
  }

  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  for (const r of results) {
    const n = Number(r?.n);
    if (!Number.isFinite(n) || n < 1 || n > cues.length) continue;
    const cue = cues[n - 1];
    if (!cue) continue;

    const vocabulary = Array.isArray(r?.vocabulary)
      ? r.vocabulary
          .filter((v: any) => v && typeof v.word === "string" && typeof v.translation === "string")
          .map((v: any) => ({
            word: String(v.word),
            translation: String(v.translation),
            partOfSpeech: v.partOfSpeech ? String(v.partOfSpeech) : undefined,
            example: v.example ? String(v.example) : undefined,
          }))
      : [];
    const idioms = Array.isArray(r?.idioms)
      ? r.idioms
          .filter((i: any) => i && typeof i.phrase === "string" && typeof i.meaning === "string")
          .map((i: any) => ({
            phrase: String(i.phrase),
            meaning: String(i.meaning),
            literalTranslation: i.literalTranslation ? String(i.literalTranslation) : undefined,
          }))
      : [];

    out.set(cue.id, {
      vocabulary,
      idioms,
      translation: typeof r?.translation === "string" ? String(r.translation).trim() : undefined,
      analyzedAt: Date.now(),
      model,
    });
  }

  return out;
}

export async function quickTranslate(
  text: string,
  apiKey: string,
  model: string,
  context?: string,
): Promise<string> {
  const prompt = context
    ? `In the English sentence: "${context.replace(/"/g, '\\"')}"
Translate the word/phrase "${text.replace(/"/g, '\\"')}" into natural Persian as it is used in this sentence. Return only the Persian translation (1-4 words), no explanation, no quotes.`
    : `Translate this English subtitle to natural Persian. Return only the translation, no explanation: ${text}`;
  const raw = await callGemini(prompt, apiKey, model);
  return stripFences(raw)
    .trim()
    .replace(/^["'`]|["'`]$/g, "");
}

export async function pingGemini(apiKey: string, model: string): Promise<boolean> {
  await callGemini("Reply with the single word: ok", apiKey, model);
  return true;
}
