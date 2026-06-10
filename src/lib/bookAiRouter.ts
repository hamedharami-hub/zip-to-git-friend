/**
 * Provider-aware router for book AI tasks.
 *
 * Resolves a `BookAIModelRef` ({ provider, model }) to either:
 *   - the Lovable AI Gateway (default — uses LOVABLE_API_KEY in the edge fn)
 *   - direct Gemini API (uses the user's `geminiApiKey`)
 *   - direct Groq API (uses the user's `groqApiKey`)
 *
 * Two helpers are exported:
 *   - `analyzeParagraphRouted(...)` — single paragraph
 *   - `rewriteChapterRouted(...)`   — full chapter
 *
 * Each one returns the SAME shape the existing edge functions return,
 * so callers can plug it in transparently.
 */
import { useSettingsStore } from '@/store/settingsStore';
import { coerceBookModel } from '@/lib/aiModels';
import { analyzeParagraph as analyzeParagraphGateway } from '@/lib/bookAnalysis';
import { rewriteChapter as rewriteChapterGateway } from '@/lib/chapterRewrite';
import {
  getParagraphAnalysis,
  paragraphAnalysisKey,
  saveParagraphAnalysis,
  getChapterRewrite,
  rewriteKey,
  saveChapterRewrite,
} from '@/lib/bookDb';
import { hashParagraph } from '@/lib/bookAnalysis';
import { ChapterRewriteError, REWRITE_STYLES } from '@/lib/chapterRewrite';
import { BookAnalysisError } from '@/lib/bookAnalysis';
import type {
  BookAIModelRef,
  BookChapterRewrite,
  BookParagraphAnalysis,
  RewriteStyle,
  VocabItem,
  IdiomItem,
} from '@/types';

// ─── Tool / schema definitions reused by direct API calls ─────────────

const ANALYZE_SYSTEM = `You are an elite English-to-Persian literary translator and language coach for adult Iranian learners reading authentic English content.

Your job: analyze ONE paragraph of English prose and produce:
  1. Translation — warm, simple, vivid, MODERN Persian (فارسی روان، ساده و امروزی) of the WHOLE paragraph. Translate MEANING, never word-for-word. Use SIMPLE everyday Persian a 16-year-old understands instantly — prefer the common Persian word over the heavy Arabic one ("کمک" نه "مساعدت"، "چون" نه "از آنجایی که"). Short, punchy sentences (avg 10–15 words). Break every long English sentence into 2–3 shorter Persian ones. Be vivid and concrete; use natural Persian idioms when they fit, never forced. Match the author's tone (playful / serious / urgent). Preserve EVERY number, name, place, date, and quote. No "می‌باشد"، "گردید"، "نمود" — use "است"، "شد"، "کرد". The result must read as if originally written by a good Persian writer today.
  2. Phrases — every meaningful MULTI-WORD expression (phrasal verbs, idioms, collocations). Each phrase MUST appear EXACTLY in the paragraph. This is the most important field for the learner.
  3. Vocabulary — only intermediate/advanced single words NOT covered by a phrase. 0–6 items.

Always respond by calling the provided tool. Never reply with prose.`;

const ANALYZE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'return_paragraph_analysis',
    description: 'Return the full analysis of an English paragraph for a Persian-speaking learner.',
    parameters: {
      type: 'object',
      properties: {
        translation: { type: 'string' },
        vocabulary: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              word: { type: 'string' },
              translation: { type: 'string' },
              partOfSpeech: { type: 'string' },
              example: { type: 'string' },
            },
            required: ['word', 'translation'],
          },
        },
        idioms: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              phrase: { type: 'string' },
              meaning: { type: 'string' },
              literalTranslation: { type: 'string' },
            },
            required: ['phrase', 'meaning'],
          },
        },
      },
      required: ['translation', 'vocabulary', 'idioms'],
    },
  },
};

const REWRITE_SYSTEM = `You are an expert English-language editor helping an Iranian adult who is reading authentic English nonfiction to learn the language.

Produce the rewrite in clean modern ENGLISH (never Persian). Output BOTH a markdown version and a plain-text version. Preserve the author's intent and order of ideas. Never invent facts.

Always respond by calling the provided tool. Never reply with prose.`;

const REWRITE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'return_chapter_rewrite',
    description: 'Return the rewritten chapter in markdown and plain text.',
    parameters: {
      type: 'object',
      properties: {
        markdown: { type: 'string' },
        text: { type: 'string' },
        wordCount: { type: 'number' },
      },
      required: ['markdown', 'text', 'wordCount'],
    },
  },
};

const STYLE_INSTRUCTIONS: Record<RewriteStyle, string> = {
  short_summary:
    'Write a SHORT summary (≈ 120–180 words) of the chapter in clear modern English. Capture the central thesis and main moves; skip examples.',
  detailed_summary:
    'Write a DETAILED summary (≈ 350–600 words) preserving every important argument and example in the original order.',
  key_points:
    'Distill the chapter into 6–12 KEY POINTS, each one focused sentence in clear modern English. Use a markdown bullet list. Keep the original order.',
  simplified:
    'REWRITE the chapter in SIMPLIFIED English (CEFR B1 level): same ideas, shorter sentences, common vocabulary, no idioms. ≈ 60% of original length.',
  key_quotes:
    'Extract 5–10 of the MOST POWERFUL sentences VERBATIM. Render each as a markdown blockquote. After each, add ONE short italic line (≤ 15 words) explaining why it matters.',
  review_questions:
    'Create 6–10 thought-provoking REVIEW QUESTIONS in a markdown numbered list. Mix factual recall and reflection. No answers.',
};

// ─── Tiny markdown → HTML (mirrors edge fn) ───────────────────────────

function mdToHtml(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) =>
    escape(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote><p>${inline(buf.join(' '))}</p></blockquote>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`); i++;
      }
      out.push(`<ol>${items.join('')}</ol>`); continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^[-*]\s+/, ''))}</li>`); i++;
      }
      out.push(`<ul>${items.join('')}</ul>`); continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|[-*]\s|\d+\.\s)/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

// ─── Direct provider HTTP calls ───────────────────────────────────────

interface ToolResponse<T> {
  args: T;
  modelLabel: string;
}

async function callOpenAICompatible<T>(opts: {
  url: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool: any;
  toolName: string;
  errorTag: string;
}): Promise<ToolResponse<T>> {
  const res = await fetch(opts.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      tools: [opts.tool],
      tool_choice: { type: 'function', function: { name: opts.toolName } },
    }),
  });
  if (res.status === 429) throw new BookAnalysisError('rate_limit', 'Provider rate limit reached.');
  if (res.status === 401 || res.status === 403)
    throw new BookAnalysisError('invalid', 'Invalid or expired API key.');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new BookAnalysisError('network', `${opts.errorTag} ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const argsStr = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argsStr) throw new BookAnalysisError('invalid', 'Provider returned no structured output.');
  try {
    return { args: JSON.parse(argsStr) as T, modelLabel: opts.model };
  } catch {
    throw new BookAnalysisError('invalid', 'Provider returned malformed JSON.');
  }
}

async function callGeminiTool<T>(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolParameters: any;
  toolName: string;
  errorTag: string;
}): Promise<ToolResponse<T>> {
  // Gemini native API uses functionDeclarations + functionCall in candidates.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: 'user', parts: [{ text: opts.user }] }],
    tools: [{ functionDeclarations: [{ name: opts.toolName, parameters: opts.toolParameters }] }],
    toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [opts.toolName] } },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new BookAnalysisError('rate_limit', 'Gemini rate limit reached.');
  if (res.status === 401 || res.status === 403)
    throw new BookAnalysisError('invalid', 'Invalid Gemini API key.');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new BookAnalysisError('network', `${opts.errorTag} ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fnCall = parts.find((p: any) => p?.functionCall?.name === opts.toolName)?.functionCall;
  if (!fnCall?.args) throw new BookAnalysisError('invalid', 'Gemini returned no functionCall.');
  return { args: fnCall.args as T, modelLabel: opts.model };
}

// ─── Public: analyze paragraph (provider-aware) ───────────────────────

interface RawAnalyze {
  translation?: string;
  vocabulary?: VocabItem[];
  idioms?: IdiomItem[];
}

export async function analyzeParagraphRouted(
  bookId: string,
  chapterIndex: number,
  paragraphText: string,
  options: { force?: boolean; modelRef?: BookAIModelRef } = {},
): Promise<BookParagraphAnalysis> {
  const text = paragraphText.trim();
  const hash = hashParagraph(text);

  if (!options.force) {
    const cached = await getParagraphAnalysis(bookId, chapterIndex, hash);
    if (cached) return cached;
  }

  const settings = useSettingsStore.getState().settings;
  const ref = coerceBookModel(
    options.modelRef
      ?? settings.paragraphAnalysisModelRef
      ?? settings.bookSingleAnalysisModelRef
      ?? settings.bookSingleAnalysisModel,
  );

  // Gateway path delegates to the existing edge-function helper.
  if (ref.provider === 'gateway') {
    return analyzeParagraphGateway(bookId, chapterIndex, paragraphText, {
      force: options.force,
      model: ref.model,
    });
  }

  const userPrompt = `Analyze this English paragraph for a Persian learner. Call the tool with the result.\n\nParagraph:\n"""\n${text.slice(0, 8000)}\n"""`;

  let parsed: RawAnalyze;
  let modelLabel: string;
  if (ref.provider === 'gemini') {
    const key = settings.geminiApiKey?.trim();
    if (!key) throw new BookAnalysisError('invalid', 'No Gemini API key configured.');
    const r = await callGeminiTool<RawAnalyze>({
      apiKey: key,
      model: ref.model,
      system: ANALYZE_SYSTEM,
      user: userPrompt,
      toolParameters: ANALYZE_TOOL.function.parameters,
      toolName: ANALYZE_TOOL.function.name,
      errorTag: '[gemini analyze]',
    });
    parsed = r.args;
    modelLabel = `gemini:${r.modelLabel}`;
  } else {
    const key = settings.groqApiKey?.trim();
    if (!key) throw new BookAnalysisError('invalid', 'No Groq API key configured.');
    const r = await callOpenAICompatible<RawAnalyze>({
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: key,
      model: ref.model,
      system: ANALYZE_SYSTEM,
      user: userPrompt,
      tool: ANALYZE_TOOL,
      toolName: ANALYZE_TOOL.function.name,
      errorTag: '[groq analyze]',
    });
    parsed = r.args;
    modelLabel = `groq:${r.modelLabel}`;
  }

  const record: BookParagraphAnalysis = {
    id: paragraphAnalysisKey(bookId, chapterIndex, hash),
    bookId,
    chapterIndex,
    paragraphHash: hash,
    translation: (parsed.translation ?? '').trim(),
    vocabulary: Array.isArray(parsed.vocabulary) ? parsed.vocabulary : [],
    idioms: Array.isArray(parsed.idioms) ? parsed.idioms : [],
    analyzedAt: Date.now(),
    model: modelLabel,
  };
  await saveParagraphAnalysis(record);
  return record;
}

// ─── Public: rewrite chapter (provider-aware) ─────────────────────────

interface RawRewrite {
  markdown?: string;
  text?: string;
  wordCount?: number;
}

export async function rewriteChapterRouted(
  bookId: string,
  chapterIndex: number,
  chapterTitle: string,
  chapterText: string,
  style: RewriteStyle,
  options: { force?: boolean; modelRef?: BookAIModelRef } = {},
): Promise<BookChapterRewrite> {
  if (!options.force) {
    const cached = await getChapterRewrite(bookId, chapterIndex, style);
    if (cached) return cached;
  }
  const settings = useSettingsStore.getState().settings;
  const ref = coerceBookModel(
    options.modelRef
      ?? settings.rewriteModelRef
      ?? settings.bookRewriteModelRef
      ?? settings.bookRewriteModel,
  );

  if (ref.provider === 'gateway') {
    return rewriteChapterGateway(bookId, chapterIndex, chapterTitle, chapterText, style, {
      force: options.force,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: ref.model as any,
    });
  }

  const styleInstr = STYLE_INSTRUCTIONS[style] ?? STYLE_INSTRUCTIONS.short_summary;
  const userPrompt = `STYLE: ${style}\nINSTRUCTIONS: ${styleInstr}\n\nCHAPTER TITLE: ${chapterTitle || '(untitled)'}\n\nCHAPTER TEXT:\n"""\n${chapterText.slice(0, 60000)}\n"""\n\nCall the tool with the rewrite.`;

  let parsed: RawRewrite;
  let modelLabel: string;
  if (ref.provider === 'gemini') {
    const key = settings.geminiApiKey?.trim();
    if (!key) throw new ChapterRewriteError('invalid', 'No Gemini API key configured.');
    const r = await callGeminiTool<RawRewrite>({
      apiKey: key,
      model: ref.model,
      system: REWRITE_SYSTEM,
      user: userPrompt,
      toolParameters: REWRITE_TOOL.function.parameters,
      toolName: REWRITE_TOOL.function.name,
      errorTag: '[gemini rewrite]',
    });
    parsed = r.args;
    modelLabel = `gemini:${r.modelLabel}`;
  } else {
    const key = settings.groqApiKey?.trim();
    if (!key) throw new ChapterRewriteError('invalid', 'No Groq API key configured.');
    const r = await callOpenAICompatible<RawRewrite>({
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: key,
      model: ref.model,
      system: REWRITE_SYSTEM,
      user: userPrompt,
      tool: REWRITE_TOOL,
      toolName: REWRITE_TOOL.function.name,
      errorTag: '[groq rewrite]',
    });
    parsed = r.args;
    modelLabel = `groq:${r.modelLabel}`;
  }

  const md = String(parsed.markdown ?? '').trim();
  const txt = String(parsed.text ?? '').trim();
  if (!md || !txt) throw new ChapterRewriteError('invalid', 'Provider returned empty rewrite.');
  const html = mdToHtml(md);
  const record: BookChapterRewrite = {
    id: rewriteKey(bookId, chapterIndex, style),
    bookId,
    chapterIndex,
    style,
    html,
    text: txt,
    wordCount:
      typeof parsed.wordCount === 'number' && parsed.wordCount > 0
        ? Math.round(parsed.wordCount)
        : txt.split(/\s+/).filter(Boolean).length,
    model: modelLabel,
    createdAt: Date.now(),
  };
  await saveChapterRewrite(record);
  return record;
}

// Keep style list re-exported for convenience.
export { REWRITE_STYLES };
