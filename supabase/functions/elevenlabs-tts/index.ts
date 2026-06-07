/**
 * Proxy to ElevenLabs Text-to-Speech.
 * Body: { apiKey, text, voiceId, modelId?, language? }
 * Returns: audio/mpeg bytes.
 *
 * Long text (> ~4500 chars) is split into sentence-aligned chunks and
 * the raw MP3 buffers are concatenated. Browsers decode the resulting
 * stream fine because MP3 frames are self-synchronising.
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_CHARS = 4500;

function chunkText(text: string): string[] {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= MAX_CHARS) return [clean];
  const sentences = clean.match(/[^.!?؟\n]+[.!?؟\n]+|[^.!?؟\n]+$/g) ?? [clean];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).trim().length > MAX_CHARS && buf) {
      out.push(buf.trim());
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

async function ttsChunk(
  apiKey: string,
  voiceId: string,
  modelId: string,
  text: string,
  previousText?: string,
  nextText?: string,
  languageCode?: string,
): Promise<Uint8Array> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const body: Record<string, unknown> = { text, model_id: modelId };
  if (previousText) body.previous_text = previousText.slice(-500);
  if (nextText) body.next_text = nextText.slice(0, 500);
  // language_code is supported by turbo_v2_5 / flash_v2_5 and dramatically
  // improves Persian pronunciation (otherwise ElevenLabs reads فارسی with
  // an English/transliterated accent).
  if (languageCode) body.language_code = languageCode;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${errTxt.slice(0, 300)}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { apiKey, text, voiceId, modelId, language } = await req.json();
    if (!apiKey || typeof apiKey !== "string") {
      return new Response(JSON.stringify({ error: "Missing apiKey." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const voice = (voiceId as string) || "EXAVITQu4vr4xnSDxMaL"; // Sarah
    const model = (modelId as string) || "eleven_multilingual_v2";
    void language; // multilingual handles both EN & FA

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      return new Response(JSON.stringify({ error: "Empty text." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parts: Uint8Array[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const prev = i > 0 ? chunks[i - 1] : undefined;
      const next = i < chunks.length - 1 ? chunks[i + 1] : undefined;
      const bytes = await ttsChunk(apiKey, voice, model, chunks[i], prev, next);
      parts.push(bytes);
    }
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }

    return new Response(out, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "audio/mpeg", "X-Chunk-Count": String(chunks.length) },
    });
  } catch (e) {
    console.error("elevenlabs-tts error", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = /401|invalid api key|unauthor/i.test(msg) ? 401 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
