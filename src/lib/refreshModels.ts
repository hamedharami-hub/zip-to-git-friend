/**
 * Refresh provider model lists from Groq and Gemini at runtime.
 *
 * Stores the merged lists in `settings.customModels` so the pickers
 * automatically show the latest models without an app update.
 */
import type { AppSettings } from "@/types";

export interface RefreshResult {
  geminiCount: number;
  groqChatCount: number;
  groqWhisperCount: number;
  errors: string[];
}

interface ModelEntry {
  value: string;
  label: string;
  hint?: string;
}

// ─── Groq ──────────────────────────────────────────────────────────────────

interface GroqModel {
  id: string;
  object: string;
  owned_by?: string;
  active?: boolean;
  context_window?: number;
}

async function fetchGroqModels(
  apiKey: string,
): Promise<{ chat: ModelEntry[]; whisper: ModelEntry[] }> {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Groq /models failed (${res.status})`);
  const data = await res.json();
  const list: GroqModel[] = Array.isArray(data?.data) ? data.data : [];

  const chat: ModelEntry[] = [];
  const whisper: ModelEntry[] = [];

  for (const m of list) {
    if (m.active === false) continue;
    const id = m.id;
    if (!id) continue;
    const lower = id.toLowerCase();

    // Whisper (transcription) models.
    if (lower.includes("whisper")) {
      whisper.push({
        value: id,
        label: id,
        hint: m.owned_by ? `by ${m.owned_by}` : undefined,
      });
      continue;
    }

    // Skip non-chat (TTS, guard, embeddings, vision-only, etc.).
    if (
      lower.includes("tts") ||
      lower.includes("playai") ||
      lower.includes("guard") ||
      lower.includes("embed") ||
      lower.includes("compound")
    ) {
      continue;
    }

    chat.push({
      value: id,
      label: id,
      hint: m.owned_by ? `by ${m.owned_by}` : undefined,
    });
  }

  // Sort newest-looking first (heuristic: longer ids / numeric tags later).
  chat.sort((a, b) => a.value.localeCompare(b.value));
  whisper.sort((a, b) => a.value.localeCompare(b.value));
  return { chat, whisper };
}

// ─── Gemini ────────────────────────────────────────────────────────────────

interface GeminiApiModel {
  name: string; // "models/gemini-..."
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
}

async function fetchGeminiModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=200`,
  );
  if (!res.ok) throw new Error(`Gemini /models failed (${res.status})`);
  const data = await res.json();
  const list: GeminiApiModel[] = Array.isArray(data?.models) ? data.models : [];

  const out: ModelEntry[] = [];
  for (const m of list) {
    const id = m.name?.replace(/^models\//, "");
    if (!id) continue;
    const methods = m.supportedGenerationMethods ?? [];
    // Only chat/text-capable models.
    if (!methods.some((x) => x.toLowerCase().includes("generatecontent"))) continue;
    // Skip embeddings/aqa/tuning.
    const lower = id.toLowerCase();
    if (lower.includes("embedding") || lower.includes("aqa")) continue;
    out.push({
      value: id,
      label: m.displayName || id,
      hint: m.description?.split("\n")[0]?.slice(0, 80),
    });
  }
  out.sort((a, b) => a.value.localeCompare(b.value));
  return out;
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface ProviderRefreshResult {
  provider: "gemini" | "groq";
  geminiCount?: number;
  groqChatCount?: number;
  groqWhisperCount?: number;
}

/** Refresh the Gemini model list for the given API key. */
export async function refreshGeminiModels(
  apiKey: string,
  existing?: AppSettings["customModels"],
): Promise<{ patch: Partial<AppSettings>; result: ProviderRefreshResult }> {
  const list = await fetchGeminiModels(apiKey.trim());
  const next: NonNullable<AppSettings["customModels"]> = {
    ...(existing ?? {}),
    gemini: list,
    refreshedAt: Date.now(),
  };
  return {
    patch: { customModels: next },
    result: { provider: "gemini", geminiCount: list.length },
  };
}

/** Refresh the Groq chat/whisper model lists for the given API key. */
export async function refreshGroqModels(
  apiKey: string,
  existing?: AppSettings["customModels"],
): Promise<{ patch: Partial<AppSettings>; result: ProviderRefreshResult }> {
  const { chat, whisper } = await fetchGroqModels(apiKey.trim());
  const next: NonNullable<AppSettings["customModels"]> = {
    ...(existing ?? {}),
    groqChat: chat,
    groqWhisper: whisper,
    refreshedAt: Date.now(),
  };
  return {
    patch: { customModels: next },
    result: { provider: "groq", groqChatCount: chat.length, groqWhisperCount: whisper.length },
  };
}

export async function refreshAllModels(
  settings: Pick<AppSettings, "geminiApiKey" | "groqApiKey" | "customModels">,
): Promise<{ patch: Partial<AppSettings>; result: RefreshResult }> {
  const errors: string[] = [];
  const next: NonNullable<AppSettings["customModels"]> = {
    ...(settings.customModels ?? {}),
  };

  let geminiCount = 0;
  let groqChatCount = 0;
  let groqWhisperCount = 0;

  const tasks: Promise<void>[] = [];

  if (settings.geminiApiKey?.trim()) {
    tasks.push(
      refreshGeminiModels(settings.geminiApiKey.trim(), settings.customModels)
        .then(({ patch, result }) => {
          Object.assign(next, patch.customModels);
          geminiCount = result.geminiCount ?? 0;
        })
        .catch((e) => {
          errors.push(`Gemini: ${e instanceof Error ? e.message : String(e)}`);
        }),
    );
  } else {
    errors.push("Gemini: no API key");
  }

  if (settings.groqApiKey?.trim()) {
    tasks.push(
      refreshGroqModels(settings.groqApiKey.trim(), settings.customModels)
        .then(({ patch, result }) => {
          Object.assign(next, patch.customModels);
          groqChatCount = result.groqChatCount ?? 0;
          groqWhisperCount = result.groqWhisperCount ?? 0;
        })
        .catch((e) => {
          errors.push(`Groq: ${e instanceof Error ? e.message : String(e)}`);
        }),
    );
  } else {
    errors.push("Groq: no API key");
  }

  await Promise.all(tasks);

  next.refreshedAt = Date.now();

  return {
    patch: { customModels: next },
    result: { geminiCount, groqChatCount, groqWhisperCount, errors },
  };
}
