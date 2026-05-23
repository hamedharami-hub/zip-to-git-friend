import type { SegmentAnalysis } from '@/types';

export class GroqChatError extends Error {
  code: 'missing_key' | 'rate_limit' | 'auth' | 'invalid_response' | 'network' | 'unknown';
  constructor(code: GroqChatError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'GroqChatError';
  }
}

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

interface GroqChatChoice {
  message?: { content?: string };
}
interface GroqChatResponse {
  choices?: GroqChatChoice[];
}

async function callGroqChat(
  prompt: string,
  apiKey: string,
  model: string,
  jsonMode = false,
): Promise<string> {
  if (!apiKey) throw new GroqChatError('missing_key', 'Groq API key is not set.');

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        top_p: 0.9,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch {
    throw new GroqChatError('network', 'Network error contacting Groq.');
  }

  if (res.status === 429) throw new GroqChatError('rate_limit', 'Groq rate limit hit.');
  if (res.status === 401 || res.status === 403)
    throw new GroqChatError('auth', 'Groq rejected the API key.');
  if (!res.ok) throw new GroqChatError('unknown', `Groq error (${res.status}).`);

  let data: GroqChatResponse;
  try {
    data = await res.json();
  } catch {
    throw new GroqChatError('invalid_response', 'Groq returned non-JSON.');
  }
  const text = data?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new GroqChatError('invalid_response', 'Groq returned empty content.');
  return text;
}

function stripFences(s: string): string {
  let t = s.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  }
  return t.trim();
}

function buildAnalysisPrompt(text: string): string {
  return `You are an expert English-to-Persian language learning assistant for an adult Iranian learner.

Analyze ONE English subtitle/sentence and return ONLY a JSON object — no prose, no markdown, no code fences, no commentary. Output must be parseable by JSON.parse.

INPUT TEXT:
"${text.replace(/"/g, '\\"')}"

REQUIRED JSON SHAPE (all keys present, exactly this shape):
{
  "translation": "string — natural fluent Persian translation of the WHOLE sentence (professional translator quality, NOT literal, NOT summary). Required, never empty.",
  "vocabulary": [
    {"word": "single English word as it appears", "translation": "concise Persian meaning in this context", "partOfSpeech": "noun|verb|adjective|adverb|other", "example": "optional short English example"}
  ],
  "idioms": [
    {"phrase": "EXACT 2+ word phrase from the sentence", "meaning": "Persian meaning in this context", "literalTranslation": "optional literal Persian rendering"}
  ]
}

STRICT RULES:
1. translation MUST be Persian. NEVER English. Full sentence. Natural and fluent. This field is the most important — never leave it empty.
2. idioms is the second-most important. Be GENEROUS: extract 3–10 multi-word phrases when present. Include phrasal verbs ("give up", "run into"), idioms ("hit the road"), fixed collocations ("make a decision", "heavy rain"), common multi-word expressions ("as a matter of fact"), prepositional phrases that change meaning ("in light of"). Each phrase MUST be 2+ words and appear EXACTLY in the input (same wording, same word order). Skip trivial combos like "in the", "of the".
3. vocabulary is ONLY for single intermediate/advanced words NOT already covered by an idiom/phrase above. Skip A1–A2 basics (the, is, go, big, person…). Aim for 0–6 high-value words. If a word matters only because it's part of a phrase, put it in idioms instead.
4. If there are no idioms or no advanced vocabulary, return an empty array — never invent.
5. NO markdown. NO code fences. NO leading/trailing prose. Output a single JSON object only.

WORKED EXAMPLE
Input: "I ran into an old friend yesterday and we caught up over coffee."
Output:
{"translation":"دیروز اتفاقی به یک دوست قدیمی برخوردم و سر قهوه با هم گپ زدیم.","vocabulary":[],"idioms":[{"phrase":"ran into","meaning":"اتفاقی برخورد کردن، تصادفی دیدن","literalTranslation":"دویدن به سمت"},{"phrase":"caught up","meaning":"از احوال هم باخبر شدن، گپ زدن درباره خبرهای جدید"},{"phrase":"over coffee","meaning":"حین قهوه خوردن، سر قهوه"}]}

Now produce the JSON for the INPUT TEXT above.`;
}

export async function analyzeSegmentGroq(
  text: string,
  apiKey: string,
  model: string,
): Promise<SegmentAnalysis> {
  const raw = await callGroqChat(buildAnalysisPrompt(text), apiKey, model, true);
  const cleaned = stripFences(raw);
  let parsed: { vocabulary?: unknown; idioms?: unknown };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new GroqChatError('invalid_response', 'Could not parse JSON from Groq.');
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      throw new GroqChatError('invalid_response', 'Could not parse JSON from Groq.');
    }
  }

  const vocabulary = Array.isArray(parsed?.vocabulary)
    ? (parsed.vocabulary as Array<Record<string, unknown>>)
        .filter((v) => v && typeof v.word === 'string' && typeof v.translation === 'string')
        .map((v) => ({
          word: String(v.word),
          translation: String(v.translation),
          partOfSpeech: v.partOfSpeech ? String(v.partOfSpeech) : undefined,
          example: v.example ? String(v.example) : undefined,
        }))
    : [];
  const idioms = Array.isArray(parsed?.idioms)
    ? (parsed.idioms as Array<Record<string, unknown>>)
        .filter((i) => i && typeof i.phrase === 'string' && typeof i.meaning === 'string')
        .map((i) => ({
          phrase: String(i.phrase),
          meaning: String(i.meaning),
          literalTranslation: i.literalTranslation ? String(i.literalTranslation) : undefined,
        }))
    : [];

  return {
    vocabulary,
    idioms,
    translation:
      typeof (parsed as { translation?: unknown }).translation === 'string'
        ? String((parsed as { translation?: unknown }).translation).trim()
        : undefined,
    analyzedAt: Date.now(),
    model,
  };
}

/**
 * Analyze MANY subtitle cues in a single Groq request.
 * Returns a Map keyed by cue id. Missing cues fall back to single-cue analysis upstream.
 */
export async function analyzeSegmentsBatchGroq(
  cues: Array<{ id: string; text: string }>,
  apiKey: string,
  model: string,
): Promise<Map<string, SegmentAnalysis>> {
  const out = new Map<string, SegmentAnalysis>();
  if (cues.length === 0) return out;

  const lines = cues
    .map((c, i) => `[${i + 1}] "${c.text.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`)
    .join('\n');

  const prompt = `You are an expert English-to-Persian language learning assistant for an adult Iranian learner.

You will receive ${cues.length} numbered English subtitle lines. For EACH line independently, produce the same analysis you would for a single line.

Return ONLY a single JSON object (no markdown, no code fences, no prose) with this EXACT shape:
{
  "results": [
    {
      "n": 1,
      "translation": "natural fluent Persian translation of THIS line — required, never empty, never English",
      "vocabulary": [
        {"word":"...","translation":"فارسی","partOfSpeech":"noun|verb|adjective|adverb|other","example":"..."}
      ],
      "idioms": [
        {"phrase":"EXACT 2+ word phrase from THIS line","meaning":"فارسی","literalTranslation":"..."}
      ]
    }
    // one object per input line, in order, n = the bracketed index
  ]
}

RULES (apply to every line, independently):
1. "translation" is REQUIRED for every line — fluent Persian, not literal, not summary.
2. "idioms": be generous — phrasal verbs, idioms, fixed collocations, multi-word expressions. Each phrase MUST be 2+ words and appear EXACTLY in that line.
3. "vocabulary": single intermediate/advanced English words NOT already covered by an idiom. Skip A1–A2 basics. 0–6 per line.
4. Empty arrays are fine — never invent.
5. Do NOT merge meaning across lines. Each [n] is independent.

INPUT LINES:
${lines}`;

  const raw = await callGroqChat(prompt, apiKey, model, true);
  const cleaned = stripFences(raw);
  let parsed: { results?: unknown };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new GroqChatError('invalid_response', 'Could not parse batch JSON from Groq.');
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      throw new GroqChatError('invalid_response', 'Could not parse batch JSON from Groq.');
    }
  }

  const results = Array.isArray(parsed?.results) ? (parsed.results as Array<Record<string, unknown>>) : [];
  for (const r of results) {
    const n = Number(r?.n);
    if (!Number.isFinite(n) || n < 1 || n > cues.length) continue;
    const cue = cues[n - 1];
    if (!cue) continue;

    const vocabulary = Array.isArray(r?.vocabulary)
      ? (r.vocabulary as Array<Record<string, unknown>>)
          .filter((v) => v && typeof v.word === 'string' && typeof v.translation === 'string')
          .map((v) => ({
            word: String(v.word),
            translation: String(v.translation),
            partOfSpeech: v.partOfSpeech ? String(v.partOfSpeech) : undefined,
            example: v.example ? String(v.example) : undefined,
          }))
      : [];
    const idioms = Array.isArray(r?.idioms)
      ? (r.idioms as Array<Record<string, unknown>>)
          .filter((i) => i && typeof i.phrase === 'string' && typeof i.meaning === 'string')
          .map((i) => ({
            phrase: String(i.phrase),
            meaning: String(i.meaning),
            literalTranslation: i.literalTranslation ? String(i.literalTranslation) : undefined,
          }))
      : [];

    out.set(cue.id, {
      vocabulary,
      idioms,
      translation:
        typeof (r as { translation?: unknown }).translation === 'string'
          ? String((r as { translation?: unknown }).translation).trim()
          : undefined,
      analyzedAt: Date.now(),
      model,
    });
  }

  return out;
}


export async function quickTranslateGroq(
  text: string,
  apiKey: string,
  model: string,
  context?: string,
): Promise<string> {
  const prompt = context
    ? `You are a precise English→Persian translator.
Sentence context: "${context.replace(/"/g, '\\"')}"
Translate the word/phrase "${text.replace(/"/g, '\\"')}" into natural Persian as it is used in this sentence.
Rules: Output ONLY the Persian translation (1–4 words). NO English. NO quotes. NO parentheses. NO explanation. NO romanization. NO punctuation other than what belongs in the Persian phrase itself.`
    : `Translate the following English text into natural Persian.
Rules: Output ONLY the Persian translation. NO English. NO quotes. NO parentheses. NO explanation.
Text: ${text}`;
  const raw = await callGroqChat(prompt, apiKey, model);
  return stripFences(raw).trim().replace(/^["'`(\[]+|["'`)\]]+$/g, '');
}
