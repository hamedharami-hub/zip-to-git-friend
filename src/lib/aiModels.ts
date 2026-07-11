import type {
  GeminiModel,
  GroqChatModel,
  GroqWhisperModel,
  AIModelChoice,
  BookAnalysisModel,
  BookAIModelRef,
  BookAIProvider,
  AppSettings,
} from "@/types";

export const BOOK_ANALYSIS_MODELS: { value: BookAnalysisModel; label: string; hint?: string }[] = [
  {
    value: "google/gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    hint: "Default — fast & accurate",
  },
  {
    value: "google/gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite",
    hint: "Cheapest & fastest",
  },
  { value: "openai/gpt-5", label: "GPT-5", hint: "OpenAI flagship" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini", hint: "Balanced OpenAI" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano", hint: "Fastest OpenAI" },
];

export interface ModelOption {
  value: string;
  label: string;
  hint?: string;
}

export const GEMINI_MODELS: { value: GeminiModel; label: string; hint?: string }[] = [
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash", hint: "Default — fast & capable" },
  {
    value: "gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite",
    hint: "Cheapest & fastest",
  },
];

export const GROQ_CHAT_MODELS: { value: GroqChatModel; label: string; hint?: string }[] = [
  { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile", hint: "Best Groq quality" },
  { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant", hint: "Fastest" },
  { value: "openai/gpt-oss-120b", label: "GPT-OSS 120B", hint: "Heavy reasoning" },
  { value: "openai/gpt-oss-20b", label: "GPT-OSS 20B", hint: "Lighter" },
];

export const GROQ_WHISPER_MODELS: { value: GroqWhisperModel; label: string; hint?: string }[] = [
  { value: "whisper-large-v3-turbo", label: "Whisper Large v3 Turbo", hint: "Fastest" },
  { value: "whisper-large-v3", label: "Whisper Large v3", hint: "Most accurate" },
];

/** Merge built-in defaults with any custom (refreshed) entries from settings.
 *  Custom entries take precedence on duplicate `value`. */
function mergeModels<T extends { value: string; label: string; hint?: string }>(
  defaults: T[],
  custom?: { value: string; label: string; hint?: string }[],
): { value: string; label: string; hint?: string }[] {
  const map = new Map<string, { value: string; label: string; hint?: string }>();
  for (const d of defaults) map.set(d.value, { value: d.value, label: d.label, hint: d.hint });
  if (custom) for (const c of custom) map.set(c.value, c);
  return Array.from(map.values());
}

/** Filter a merged model list using the user's per-provider hidden list. */
function applyHidden(
  list: { value: string; label: string; hint?: string }[],
  hidden?: string[],
): { value: string; label: string; hint?: string }[] {
  if (!hidden || hidden.length === 0) return list;
  const set = new Set(hidden);
  return list.filter((m) => !set.has(m.value));
}

/** Build the FULL list (no hidden filter) — used by the visibility editor. */
export function getAllGeminiModels(s?: Pick<AppSettings, "customModels">) {
  return mergeModels(GEMINI_MODELS, s?.customModels?.gemini);
}
export function getAllGroqChatModels(s?: Pick<AppSettings, "customModels">) {
  return mergeModels(GROQ_CHAT_MODELS, s?.customModels?.groqChat);
}
export function getAllGroqWhisperModels(s?: Pick<AppSettings, "customModels">) {
  return mergeModels(GROQ_WHISPER_MODELS, s?.customModels?.groqWhisper);
}
export function getAllGatewayModels(s?: Pick<AppSettings, "customModels">) {
  return mergeModels(BOOK_ANALYSIS_MODELS, s?.customModels?.gateway);
}

/** Gemini chat models — built-ins merged with refreshed list, minus hidden. */
export function getGeminiModels(
  settings?: Pick<AppSettings, "customModels">,
): { value: string; label: string; hint?: string }[] {
  return applyHidden(getAllGeminiModels(settings), settings?.customModels?.hidden?.gemini);
}

/** Groq chat models — built-ins merged with refreshed list, minus hidden. */
export function getGroqChatModels(
  settings?: Pick<AppSettings, "customModels">,
): { value: string; label: string; hint?: string }[] {
  return applyHidden(getAllGroqChatModels(settings), settings?.customModels?.hidden?.groqChat);
}

/** Groq Whisper models — built-ins merged with refreshed list, minus hidden. */
export function getGroqWhisperModels(
  settings?: Pick<AppSettings, "customModels">,
): { value: string; label: string; hint?: string }[] {
  return applyHidden(
    getAllGroqWhisperModels(settings),
    settings?.customModels?.hidden?.groqWhisper,
  );
}

/** Gateway (Lovable AI) models — built-ins merged with refreshed list, minus hidden. */
export function getGatewayModels(
  settings?: Pick<AppSettings, "customModels">,
): { value: string; label: string; hint?: string }[] {
  return applyHidden(getAllGatewayModels(settings), settings?.customModels?.hidden?.gateway);
}

/** Build a flat list of "provider:model" options for chat-style tasks. */
export function chatModelOptions(
  settings?: Pick<AppSettings, "customModels">,
): { value: string; label: string; hint?: string }[] {
  return [
    ...getGeminiModels(settings).map((m) => ({
      value: `gemini:${m.value}`,
      label: `Gemini · ${m.label}`,
      hint: m.hint,
    })),
    ...getGroqChatModels(settings).map((m) => ({
      value: `groq:${m.value}`,
      label: `Groq · ${m.label}`,
      hint: m.hint,
    })),
  ];
}

export function choiceToValue(c: AIModelChoice): string {
  return `${c.provider}:${c.model}`;
}

export function valueToChoice(v: string): AIModelChoice {
  const [provider, ...rest] = v.split(":");
  return {
    provider: provider as "gemini" | "groq",
    model: rest.join(":") as AIModelChoice["model"],
  };
}

// ─── Book AI: provider-aware model resolution ──────────────────────────────

export interface BookModelOption {
  /** Encoded as `provider:model`. */
  value: string;
  provider: BookAIProvider;
  model: string;
  label: string;
  hint?: string;
  group: "Lovable AI (free)" | "Gemini (your key)" | "Groq (your key)";
}

export function bookRefToValue(ref: BookAIModelRef): string {
  return `${ref.provider}:${ref.model}`;
}

export function bookValueToRef(v: string): BookAIModelRef {
  // Accept legacy plain gateway model ids like `google/gemini-3-flash-preview`.
  if (!v.includes(":") || v.startsWith("google/") || v.startsWith("openai/")) {
    return { provider: "gateway", model: v };
  }
  const [provider, ...rest] = v.split(":");
  const model = rest.join(":");
  if (provider === "gemini" || provider === "groq" || provider === "gateway") {
    return { provider, model };
  }
  return { provider: "gateway", model: v };
}

/** Coerce a settings field that may be a legacy string into a BookAIModelRef. */
export function coerceBookModel(
  v: BookAIModelRef | BookAnalysisModel | string | undefined,
  fallback: BookAIModelRef = { provider: "gateway", model: "google/gemini-3-flash-preview" },
): BookAIModelRef {
  if (!v) return fallback;
  if (typeof v === "string") return bookValueToRef(v);
  if (typeof v === "object" && "provider" in v && "model" in v) return v;
  return fallback;
}

/** Build the picker list for any book AI task, respecting which API keys
 *  the user has entered in Settings. Lovable AI Gateway is always included.
 *  Merges in any refreshed model lists from settings.customModels. */
export function getAvailableBookModels(
  settings: Pick<AppSettings, "geminiApiKey" | "groqApiKey" | "customModels">,
): BookModelOption[] {
  const out: BookModelOption[] = [];

  // 1. Lovable AI Gateway (always available — uses LOVABLE_API_KEY in edge function).
  for (const m of getGatewayModels(settings)) {
    out.push({
      value: `gateway:${m.value}`,
      provider: "gateway",
      model: m.value,
      label: m.label,
      hint: m.hint,
      group: "Lovable AI (free)",
    });
  }

  // 2. Gemini direct (only if user entered a Gemini key in Settings).
  if (settings.geminiApiKey?.trim()) {
    for (const m of getGeminiModels(settings)) {
      out.push({
        value: `gemini:${m.value}`,
        provider: "gemini",
        model: m.value,
        label: m.label,
        hint: m.hint,
        group: "Gemini (your key)",
      });
    }
  }

  // 3. Groq direct (only if user entered a Groq key).
  if (settings.groqApiKey?.trim()) {
    for (const m of getGroqChatModels(settings)) {
      out.push({
        value: `groq:${m.value}`,
        provider: "groq",
        model: m.value,
        label: m.label,
        hint: m.hint,
        group: "Groq (your key)",
      });
    }
  }

  return out;
}
