/**
 * Generate an AI digest from a list of news articles or video transcripts.
 *
 * Body: {
 *   articles: Array<{ title: string; url: string; siteName?: string;
 *                     excerpt?: string; contentMd?: string;
 *                     publishedAt?: string }>;
 *   length: 'short' | 'long' | 'max' | 'auto-max' | 'simple';
 *   voice?: 'journalist' | 'teacher' | 'storyteller' | 'copilot';
 *   topic?: string;
 *   windowHours?: number;
 * }
 *
 * Returns: { title, contentMd, contentHtml, wordCount, model }
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
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
]);

const BASE_RULES = `Preserve every fact, name, number, date, place, quote, example, statistic, and idea present in the sources. Do not drop, summarise away, or omit anything. If the source is a video transcript, preserve speaker names, timestamps, and key spoken points.
Do not invent facts, quotes, numbers, or attributions. Use only what the sources provide.
Write in English only. Translate naturally from any source language.
Use clear, modern, B1–B2 English unless a voice explicitly allows a richer register. Explain jargon in-line on first use.
Use valid markdown only: # title, ## section headings, **bold**, *italic*, bullet lists where requested, and blockquotes only for direct source quotes. No front-matter, no commentary about the task, no 'Here is the article' preamble. Headings are # / ## / ### only — never bold-as-heading.
Always respond by calling the provided tool. Never reply with raw prose.`;

const JOURNALIST_SYSTEM_PROMPT = `You are a sharp, deadline-driven English news correspondent writing a hard-news brief for an intermediate Iranian learner of English. Your job is to turn one or more raw source reports (news article markdown or YouTube transcript) into a clean, fast-paced, factual brief. Be direct and neutral. Use third-person reporting and attribute statements to sources when they appear in the transcript (for example, 'officials said' or 'the researcher noted'). Do not editorialize beyond what the facts support.

${BASE_RULES}`;

const JOURNALIST_INSTRUCTIONS = `Write a NEWS BRIEF. Do not output the section numbers below; output only the markdown headings and content.

MANDATORY STRUCTURE:
1. # [Hard-news headline]
   A single-line headline (≤ 15 words) that starts with the key fact. No emojis.
2. ## Lead
   One italic sentence (≤ 35 words) that answers what happened, who is involved, and why it matters now.
3. ## Key Facts
   4–8 bullet lines. Each bullet must start with one relevant emoji (📅, 👤, 📍, ⚡, 🔢, 🏛️, or another fitting emoji), then a **bold noun phrase**, then ' — ' and a 12–20 word plain-English sentence. Cover every distinct fact from the source.
4. ## What Happened
   Chronology in short paragraphs. If events have dates/times, start each paragraph with a bold date/time. Explain the sequence. For long/max/auto-max, expand the number of paragraphs.
5. ## Who Is Involved
   One line per named person, organization, country, company, or group: '**Name** — one-line role or what they did.' Do not leave any named entity out.
6. ## By the Numbers
   Extract every number, percentage, date, price, amount, population, or statistic. Present each as '**number** — what it means in plain language.' Include units and dates. If the source has no numbers, omit this section.
7. ## In Their Words
   Any direct quote from the source, in quotation marks, with attribution. If the source has no direct quote, omit this section. For max/auto-max include up to 3 quotes.
8. ## What This Means
   2–4 short paragraphs of factual analysis: likely impact, next steps, risks, who wins/loses. Stay neutral; avoid personal opinions.
9. ## What to Watch
   1–3 bullet lines of concrete things to monitor next.

Sentence style: short and punchy (≤ 20 words), subject-verb-object, active voice, paragraphs of 1–4 sentences. No first-person 'I'. No editorial adjectives like 'tragic' or 'wonderful' unless inside a source quote. Use the LENGTH NOTE below to control overall size.`;

const TEACHER_SYSTEM_PROMPT = `You are a warm, patient English teacher explaining a real-world story to one curious adult Iranian learner with intermediate English. Imagine the learner knows almost nothing about the topic. You explain the 'what', the 'how', and the 'why' step by step, using analogies and everyday examples. Use 'you' and 'we'. Use 'I' only in rare asides.

${BASE_RULES}`;

const TEACHER_INSTRUCTIONS = `Write an EXPLAINER. Do not output the section numbers; output only the headings and content.

MANDATORY STRUCTURE:
1. # [Descriptive title]
   A clear, plain-English title (≤ 15 words) that tells the reader what they are about to learn.
2. ## The one thing to remember
   One italic sentence summarizing the core idea in the simplest possible way.
3. ## What is this about?
   2–3 short paragraphs setting up the story. Define any key term or name right away. Use one analogy.
4. ## How did it happen?
   Step-by-step explanation in chronological order. Each paragraph covers one step. For long/max/auto-max, add more detail and intermediate steps.
5. ## Who is involved?
   For each named person or organization: '**Name** — who they are and what role they play, explained simply.' Do not leave any named entity out.
6. ## Why does it matter?
   2–4 paragraphs connecting the topic to the reader's life: short-term effects, long-term effects, and a concrete example.
7. ## A real example
   One concrete scenario or case from the source that makes the abstract idea tangible.
8. ## Words you need to know
   A short list of 3–8 key terms with plain-English definitions (for example, '**tariff** — a tax a country puts on goods from another country.').
9. ## One question to keep in mind
   End with one open question that invites the reader to keep thinking.

Sentence style: conversational, short (≤ 18 words), parenthetical explanations, analogies ('Imagine...', 'Think of it like...'), contractions, and phrasal verbs. Avoid jargon unless explained. Use the LENGTH NOTE below to control overall size.`;

const STORYTELLER_SYSTEM_PROMPT = `You are a narrative feature writer telling a true story to an intermediate Iranian learner of English. You are NOT writing a dry report; you are recounting what happened as if the reader is watching it unfold. Find a human moment, a specific scene, or a tension, and build a story arc. Use first-person 'I' as a narrator or pull the reader in with 'you'. Use vivid details and emotional beats. Use dialogue only when it is a direct quote from the source.

${BASE_RULES}`;

const STORYTELLER_INSTRUCTIONS = `Write a NARRATIVE STORY. Do not output the section numbers; output only the headings and content.

MANDATORY STRUCTURE:
1. # [Story headline]
   A headline (≤ 15 words) that hints at the human tension or central moment. No emojis.
2. ## The scene
   One italic sentence that drops the reader into a concrete moment (time, place, person, action).
3. ## How this began
   2–4 paragraphs of backstory that set up the story. Introduce the people and what they wanted.
4. ## The moment everything changed
   The turning point in 3–6 paragraphs. Use bold dates/times at the start of paragraphs. Build tension and include concrete details.
5. ## The people caught in the middle
   One paragraph per key person or group. Show their role through actions and choices. Do not leave any named person or organization out.
6. ## What was at stake
   2–4 paragraphs on why this mattered: the risks, the hopes, the conflicts.
7. ## Where it stands now
   2–3 paragraphs on the outcome and what comes next.
8. ## The thread to hold onto
   1–2 paragraphs of reflection: what this story teaches, or the one human detail to remember.

Sentence style: varied rhythm; mix short punchy sentences with longer, flowing ones. Show, do not tell. Use sensory details. Avoid detached analysis. Use the LENGTH NOTE below to control overall size.`;

const SIMPLE_SYSTEM_PROMPT = `You are a patient English tutor rewriting a real-world story for a lower-intermediate (A2–B1) Iranian learner. Your goal is to make the text everyday and spoken while keeping every fact. Explain every person, organization, law, technology, acronym, and jargon term inline. Use the simplest high-frequency words, phrasal verbs, and short SVO sentences. Use contractions.

${BASE_RULES}`;

const LENGTH_SCALING: Record<string, string> = {
  short:
    "SHORT DIGEST (~250–400 words). Keep each section to its minimum paragraph/bullet count. Be concise and direct.",
  long: "LONG DIGEST (~700–1200 words). Develop each section with the standard paragraph/bullet count.",
  max: "MAX DIGEST (~1200–2000 words). Expand each section with extra detail, examples, and context.",
  "auto-max":
    "AUTO-MAX DIGEST (~1800–3000 words). Cover every fact, sub-point, and quote from the sources; expand to the maximum the material supports without filler.",
};

function normalizeVoice(voice: string): string {
  const valid = new Set(["journalist", "teacher", "storyteller", "copilot"]);
  const v = String(voice || "journalist").trim();
  if (valid.has(v)) return v;
  const legacy: Record<string, string> = {
    auto: "journalist",
    friend: "teacher",
    socratic: "storyteller",
  };
  return legacy[v] || "journalist";
}

// "Simple everyday English" — rewrite (NOT summary). Preserves every fact.
const SIMPLE_INSTRUCTIONS_A2 =
  "REWRITE the article in SIMPLE, EVERYDAY SPOKEN English (CEFR A2–B1) — the exact kind of language native speakers actually use when they CHAT with friends, family or colleagues in daily life. " +
  "AUDIENCE — IMAGINE THE READER: a curious adult Iranian who knows ALMOST NOTHING about this topic and whose English is lower-intermediate. Explain things to them the way you would explain it to a smart friend who has never heard of the subject. Whenever you mention a person, place, organisation, technology, law, event, jargon term or acronym for the first time, ADD a tiny in-line explanation in your own words (a short relative clause or a quick 'which means …' aside) so the reader instantly knows who/what it is and why it matters. Unpack abbreviations on first use. If the source assumes background the reader probably lacks, make that background explicit in one short sentence. NEVER assume prior knowledge of the topic. " +
  "VOCABULARY RULE: aggressively prefer the most common everyday words (top ~2000 high-frequency words). Replace any formal/academic/Latinate word with its everyday counterpart (e.g. 'utilise' → 'use', 'purchase' → 'buy', 'commence' → 'start', 'demonstrate' → 'show', 'subsequently' → 'later', 'approximately' → 'about', 'numerous' → 'a lot of', 'attempt' → 'try', 'require' → 'need', 'assist' → 'help', 'inform' → 'tell', 'sufficient' → 'enough'). " +
  "PHRASAL VERBS & IDIOMS RULE: use the high-frequency phrasal verbs, idioms, collocations and discourse markers that appear in real conversation as often as the meaning allows — at minimum a handful per section. Examples: 'find out', 'turn out', 'come up with', 'figure out', 'end up', 'work out', 'set up', 'pull off', 'come across', 'look into', 'put up with', 'get away with', 'on the other hand', 'at the end of the day', 'to be honest', 'the thing is', 'long story short', 'a big deal', 'no big deal', 'keep an eye on', 'pretty much', 'kind of', 'sort of', 'a bunch of', 'a couple of', 'wrap up'. " +
  "SENTENCE-BUILDING RULE: break long, dense source sentences into 2–3 short, simple sentences. Prefer SVO order. Use 'and', 'but', 'so', 'because' as connectors rather than relative clauses stacked on top of each other. " +
  "RHYTHM: short clear sentences (≤ 15 words on average), contractions ('it's', 'don't', 'we'll'), occasional fragments and asides like 'Here's the thing — …'. " +
  "CRITICAL — DO NOT SUMMARISE OR SHORTEN. Preserve EVERY fact, name, number, date, place, quote, example, statistic and idea from the source, in the SAME order. Adding short clarifying asides for context is REQUIRED and does not count as adding facts — but you must never remove anything. The output must be at least as long as the source (≥ 100% of source word count; longer is fine because of the added micro-explanations). If a sentence has 3 facts, your rewrite must still contain all 3 facts. " +
  "STRUCTURE: keep the article shape — bold # title (real headline, not a label), italic *TL;DR*, a short lede, then ## H2 sections in original order, ending with a ## Where I Land section. First-person voice. Pure prose, no bullet lists.";

const SIMPLE_INSTRUCTIONS_B2 =
  "REWRITE the article in CLEAR, NATURAL SPOKEN English (CEFR B1–B2) — the language a native speaker uses in real conversation, slightly richer than A2 but still everyday and unforced. " +
  "AUDIENCE — IMAGINE THE READER: a curious adult Iranian who knows little about this topic and whose English is intermediate. Whenever you introduce a person, place, organisation, technology, jargon term or acronym for the first time, add a brief in-line explanation (a short relative clause or 'which means …' aside) so the reader immediately understands who/what it is and why it matters. Spell out abbreviations on first use. Make any assumed background explicit in one short sentence. Never assume prior knowledge of the topic. " +
  "VOCABULARY RULE: prefer common, conversational words. Drop formal/Latinate vocabulary when an everyday equivalent exists ('utilise' → 'use', 'commence' → 'start', 'approximately' → 'around', 'subsequently' → 'then/later', 'demonstrate' → 'show'). " +
  "PHRASAL VERBS & IDIOMS RULE: lean heavily on the high-frequency phrasal verbs, idioms, collocations and discourse markers that show up in real conversation: 'find out', 'turn out', 'end up', 'come up with', 'figure out', 'work out', 'set up', 'pull off', 'come across', 'put up with', 'on the other hand', 'at the end of the day', 'to be honest', 'the thing is', 'long story short', 'keep an eye on', 'a big deal', 'pretty much'. Use contractions throughout. " +
  "SENTENCE-BUILDING RULE: break long dense sentences into shorter ones. Prefer simple connectors ('and', 'but', 'so', 'because') over stacked relative clauses. " +
  "CRITICAL — DO NOT SUMMARISE OR SHORTEN. Preserve EVERY fact, name, number, date, place, quote, example and idea, in the SAME order. Adding short clarifying asides for context is REQUIRED and does not count as adding facts — but nothing is allowed to drop. Output length ≥ source length (≥ 100% of source word count; longer is fine because of the added micro-explanations). " +
  "STRUCTURE: bold # title, italic *TL;DR*, lede, ## H2 sections, closing ## Where I Land. First-person voice. Pure prose.";

const COPILOT_SYSTEM_PROMPT = `You are a Microsoft Copilot-style AI news assistant writing for an INTERMEDIATE adult Iranian learner of English. You take one or more raw source reports (news article markdown or YouTube transcript) and produce ONE complete, visually scannable "Copilot Snapshot" in English.

Core rules:
1. PRESERVE EVERYTHING. Do not drop, summarise away, or omit any fact, name, number, date, place, quote, example, statistic, or idea present in the sources. If the source is a video transcript, preserve speaker names, timestamps, and key spoken points.
2. NO INVENTION. Do not invent facts, quotes, numbers, or attributions. Use only what the sources provide.
3. ENGLISH ONLY. Translate naturally from any source language.
4. B1–B2 ENGLISH. Clear, modern, everyday vocabulary. Average sentence ≤ 18 words. Explain jargon in-line on first use.
5. STRUCTURE IS MANDATORY. Output the Snapshot in the exact order and with the exact emoji "sticker" section headings given in the user prompt.
6. VOICE MIX. Be 30% sharp journalist (lead + hard facts + numbers), 40% patient teacher (explain mechanisms, background, implications), 20% friendly chat (1–2 short asides like "Here's the thing —"), 10% socratic (final question).
7. FORMAT. Use valid markdown only: # title, ## section headings, **bold**, *italic*, bullet lists where requested, > blockquotes only for direct source quotes. No front-matter, no commentary about the task, no "Here is the article" preamble. Headings are # / ## / ### only — never bold-as-heading.
8. ALWAYS respond by calling the provided tool. Never reply with raw prose.`;

const COPILOT_INSTRUCTIONS = `Write a "Copilot Snapshot" — a visually scannable, emoji-rich news brief. Do not output the section numbers below; output only the markdown headings and content.

MANDATORY STRUCTURE (use these exact emoji + heading stickers in this order):

1. # 🗞️ Title
Start the markdown with a single-line # headline that captures the main story in ≤ 15 words. The headline should include the 🗞️ emoji at the start.

2. ## ✨ TL;DR
One *italic* sentence (≤ 30 words) that tells the whole story in plain English.

3. ## 📌 Key Points
5–8 bullet lines. Every bullet must:
   - Start with one emoji relevant to the point (choose from 🌍, ⚡, 💰, 👤, 📅, ⚠️, 🏛️, 🚀, 🔬, 🎭, 📈, 🛡️, or another fitting emoji).
   - Then a **bold noun phrase**.
   - Then " — " and a 12–20 word plain-English explanation.
   - Cover every distinct fact from the source. Do not skip any.
For "max" or "auto-max" lengths, use 8–12 bullets and add more detail.

4. ## ⏱️ What Happened
If the source has events/chronology: 3–6 paragraphs, each starting with a bold date/time when available, explaining what happened in order. If no chronology, explain the mechanism step by step.
For "max"/"auto-max" expand to 5–9 paragraphs.

5. ## 👥 Who Is Involved
For every named person, organization, country, company, or group, write one line: "**Name** — one-line role or explanation". Do not leave any named entity out.
For "max"/"auto-max" add 1–2 extra sentences of context for each major entity.

6. ## 🔢 By the Numbers
Extract every number, percentage, date, price, population, amount, or statistic. Present each as "**number** — what it means in plain language". Include units and dates.
For "max"/"auto-max" add a one-line implication for each major number.

7. ## 💬 Key Quotes
Any direct quote from the source, in quotation marks, with attribution if known. If the source has no direct quote, omit this section.
For "max"/"auto-max" include up to 3 quotes with context.

8. ## 🧠 Why It Matters
2–4 short paragraphs of analysis: how the mechanism works, short-term implications, long-term implications, who wins/loses, what comes next. Include a concrete example for every abstract claim.
For "max"/"auto-max" use 4–7 paragraphs and include a counter-argument or limitation.

9. ## 🌍 Background You Need
1–3 short paragraphs explaining the minimum context a beginner needs (history, law, technology, culture). Do not assume prior knowledge.
For "max"/"auto-max" expand to 2–4 paragraphs.

10. ## 🙋 One Question to Keep in Mind
End with one engaging, open-ended question that invites the reader to think further. Do not answer it.

11. ## 🔗 Go Deeper
A short list of the source titles and URLs exactly as provided. If a source is a video/transcript, note "(video transcript)".

Tone and language:
- Speak directly to the reader as "you". Use "I" only in the final question or a rare aside.
- Do not use third-person framing like "the author says" or "this article reports".
- Keep sentences short and clear.
- Use the LENGTH NOTE below to control overall size and detail. For 'simple', use the simplest A2–B1 English while keeping every fact and the same structure.`;

/** Tiny markdown→HTML converter (mirror of news-scrape-article). */
function mdToHtml(md: string): string {
  let s = md.replace(/\r\n/g, "\n").trim();
  const codeBlocks: string[] = [];
  s = s.replace(/```([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(code);
    return `\u0000CODE${codeBlocks.length - 1}\u0000`;
  });
  s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  s = s.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  s = s.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  s = s.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  s = s.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");
  s = s.replace(/^>\s?(.+)$/gm, "<blockquote>$1</blockquote>");
  s = s.replace(/(^(?:-|\*|\d+\.)\s+.+(?:\n(?:-|\*|\d+\.)\s+.+)*)/gm, (block) => {
    const ordered = /^\d+\./.test(block);
    const items = block
      .split("\n")
      .map((l) => l.replace(/^(?:-|\*|\d+\.)\s+/, "").trim())
      .filter(Boolean)
      .map((l) => `<li>${l}</li>`)
      .join("");
    return ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  const paragraphs = s.split(/\n{2,}/).map((p) => {
    const t = p.trim();
    if (!t) return "";
    if (/^<(h\d|ul|ol|blockquote|pre|p|table)/i.test(t)) return t;
    return `<p>${t.replace(/\n/g, "<br/>")}</p>`;
  });
  s = paragraphs.join("\n");
  const codeMarker = String.fromCharCode(0);
  const codeRe = new RegExp(`${codeMarker}CODE(\\d+)${codeMarker}`, "g");
  s = s.replace(codeRe, (_, i) => {
    return `<pre><code>${codeBlocks[Number(i)]
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</code></pre>`;
  });
  return s;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const {
      articles,
      length = "long",
      voice = "journalist",
      topic,
      windowHours = 24,
      model: requestedModel,
      simplifyLevel,
    } = await req.json();
    if (!Array.isArray(articles) || articles.length === 0) {
      return new Response(JSON.stringify({ error: "articles array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model =
      requestedModel && ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;

    // Cap inputs so we stay within model context. For 'max'/'auto-max' allow more per article.
    // Tightened defaults to cut token cost: we only need title + first 1–2 paragraphs
    // for the digest to capture the gist; full body text isn't necessary.
    const isHugeLength = length === "max" || length === "auto-max" || length === "simple";
    const perArticleCap = isHugeLength ? 1800 : 600;
    const maxArticles = isHugeLength ? 30 : 25;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
    const compact = articles.slice(0, maxArticles).map((a: any) => ({
      title: String(a.title ?? "").slice(0, 250),
      url: String(a.url ?? ""),
      siteName: a.siteName ?? null,
      publishedAt: a.publishedAt ?? null,
      content: String(a.contentMd ?? a.excerpt ?? "").slice(0, perArticleCap),
    }));

    const normalizedVoice = normalizeVoice(voice);
    let systemContent: string;
    let instructions: string;
    let userPrompt: string;
    if (length === "simple") {
      systemContent = SIMPLE_SYSTEM_PROMPT;
      instructions = simplifyLevel === "b1-b2" ? SIMPLE_INSTRUCTIONS_B2 : SIMPLE_INSTRUCTIONS_A2;
      userPrompt = [
        instructions,
        "",
        "Topic / scope: " + (topic ?? "general") + ".",
        "Window: last " + windowHours + " hour(s).",
        "",
        "ARTICLES (JSON):",
        JSON.stringify(compact, null, 2),
      ].join(String.fromCharCode(10));
    } else {
      switch (normalizedVoice) {
        case "journalist":
          systemContent = JOURNALIST_SYSTEM_PROMPT;
          instructions = JOURNALIST_INSTRUCTIONS;
          break;
        case "teacher":
          systemContent = TEACHER_SYSTEM_PROMPT;
          instructions = TEACHER_INSTRUCTIONS;
          break;
        case "storyteller":
          systemContent = STORYTELLER_SYSTEM_PROMPT;
          instructions = STORYTELLER_INSTRUCTIONS;
          break;
        case "copilot":
          systemContent = COPILOT_SYSTEM_PROMPT;
          instructions = COPILOT_INSTRUCTIONS;
          break;
        default:
          systemContent = JOURNALIST_SYSTEM_PROMPT;
          instructions = JOURNALIST_INSTRUCTIONS;
      }
      const lengthNote = LENGTH_SCALING[length] ?? LENGTH_SCALING.long;
      userPrompt = [
        instructions,
        "",
        "LENGTH NOTE: " + lengthNote,
        "",
        "Topic / scope: " + (topic ?? "general") + ".",
        "Window: last " + windowHours + " hour(s).",
        "",
        "ARTICLES (JSON):",
        JSON.stringify(compact, null, 2),
      ].join(String.fromCharCode(10));
    }

    // Per-length output cap (in tokens). Without this the gateway truncates
    // long features halfway through — symptom: headings appear but bodies are missing.
    const maxTokensFor = (l: string): number => {
      switch (l) {
        case "auto-max":
          return 16000;
        case "max":
          return 12000;
        case "simple":
          return 12000;
        case "short":
          return 1500;
        default:
          return 8000; // long
      }
    };

    async function callAi(): Promise<Response> {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokensFor(length),
          messages: [
            { role: "system", content: systemContent },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "emit_digest",
                description: "Return the final digest.",
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Concise digest title (≤ 12 words)." },
                    markdown: { type: "string", description: "The full digest body in markdown." },
                  },
                  required: ["title", "markdown"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "emit_digest" } },
        }),
      });
    }

    let aiRes = await callAi();

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
      return new Response(JSON.stringify({ error: `AI gateway error (${aiRes.status})` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let aiData = await aiRes.json();
    let call = aiData?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let finishReason: string | undefined = aiData?.choices?.[0]?.finish_reason;

    /** Heuristic: detect a truncated digest (headings emitted but bodies missing). */
    function looksTruncated(md: string): boolean {
      if (!md) return true;
      const h2s = (md.match(/^##\s+/gm) ?? []).length;
      const paragraphs = md
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p && !p.startsWith("#") && !p.startsWith(">")).length;
      // A real article has many more body paragraphs than H2s
      return h2s >= 3 && paragraphs < h2s * 2;
    }

    let parsed: { title: string; markdown: string } | null = null;
    if (call) {
      try {
        parsed = JSON.parse(call);
      } catch {
        parsed = null;
      }
    }

    // Auto-retry once if truncated by token cap or visibly incomplete.
    if (!parsed || finishReason === "length" || looksTruncated(parsed.markdown)) {
      console.warn("news-digest: truncated/empty output, retrying", { finishReason });
      aiRes = await callAi();
      if (aiRes.ok) {
        aiData = await aiRes.json();
        call = aiData?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        finishReason = aiData?.choices?.[0]?.finish_reason;
        if (call) {
          try {
            const retry = JSON.parse(call);
            if (retry?.markdown && (!parsed || retry.markdown.length > parsed.markdown.length)) {
              parsed = retry;
            }
          } catch {
            /* keep previous */
          }
        }
      }
    }

    if (!parsed) {
      console.error("No tool call in AI response", aiData);
      return new Response(JSON.stringify({ error: "AI returned no digest." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = mdToHtml(parsed.markdown);
    const text = parsed.markdown
      .replace(/[#>*_`-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return new Response(
      JSON.stringify({
        title: parsed.title,
        contentMd: parsed.markdown,
        contentHtml: html,
        wordCount: countWords(text),
        model,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("news-digest error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
