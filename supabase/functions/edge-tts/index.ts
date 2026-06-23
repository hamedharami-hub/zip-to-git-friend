// deno-lint-ignore-file no-explicit-any
// Stable server-side Persian/English TTS.
//
// Microsoft Edge "Read Aloud" blocks all known cloud IP ranges (Supabase
// Edge runtime included) with HTTP 403, so we go straight to the Lovable AI
// Gateway which exposes OpenAI gpt-4o-mini-tts — multilingual, handles
// Persian natively, no extra API key needed (uses managed LOVABLE_API_KEY).
//
// Response: audio/mpeg (MP3).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_TEXT = 5000;

// Map a Microsoft-style voice id (kept for UI back-compat) to an OpenAI voice.
function pickOpenAiVoice(voice: string): string {
  const v = voice.toLowerCase();
  if (v.includes('farid') || v.includes('guy') || v.includes('ryan')) return 'onyx';
  if (v.includes('dilara') || v.includes('sonia') || v.includes('natasha')) return 'nova';
  if (v.includes('aria') || v.includes('jenny')) return 'shimmer';
  return 'alloy';
}

async function lovableAiSynth(text: string, voice: string): Promise<Uint8Array> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('LOVABLE_API_KEY not configured');
  const res = await fetch('https://ai.gateway.lovable.dev/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini-tts',
      input: text,
      voice: pickOpenAiVoice(voice),
      response_format: 'mp3',
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('[edge-tts] Lovable AI failed:', res.status, t.slice(0, 500));
    if (res.status === 429) throw new Error('سقف استفاده روزانه پر شد. کمی بعد دوباره امتحان کن.');
    if (res.status === 402) throw new Error('اعتبار Lovable AI تموم شده. لطفاً شارژ کن.');
    throw new Error(`Lovable AI TTS ${res.status}: ${t.slice(0, 200)}`);
  }
  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}

// ───────── Rate limiting ─────────

const RL = new Map<string, { count: number; reset: number }>();
function rateLimit(ip: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const cur = RL.get(ip);
  if (!cur || cur.reset < now) { RL.set(ip, { count: 1, reset: now + windowMs }); return true; }
  cur.count++;
  return cur.count <= max;
}

function jsonError(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError('method not allowed', 405);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (!rateLimit(ip)) return jsonError('rate limit exceeded', 429);

  let body: any;
  try { body = await req.json(); } catch { return jsonError('invalid JSON', 400); }
  const text = String(body?.text ?? '').trim();
  const voice = String(body?.voice ?? 'fa-IR-DilaraNeural');
  if (!text) return jsonError('text is required');
  if (text.length > MAX_TEXT) return jsonError(`text too long (max ${MAX_TEXT})`);

  try {
    const out = await lovableAiSynth(text, voice);
    return new Response(out, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-TTS-Provider': 'lovable-ai',
      },
    });
  } catch (err) {
    return jsonError((err as Error).message || 'TTS failed', 502);
  }
});
