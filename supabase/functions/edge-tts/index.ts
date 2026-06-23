// deno-lint-ignore-file no-explicit-any
// Microsoft Edge "Read Aloud" TTS proxy.
// Free, no API key. Uses the same WebSocket endpoint Edge browser uses.
// Returns audio/mpeg (MP3, 24kHz mono 48kbps).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_TOKEN}`;
const MAX_TEXT = 5000;
const CHUNK_CHARS = 1500;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function chunkText(text: string, max = CHUNK_CHARS): string[] {
  const out: string[] = [];
  const sentences = text.split(/(?<=[.!?؟…])\s+/);
  let cur = '';
  for (const s of sentences) {
    if ((cur + ' ' + s).trim().length > max) {
      if (cur) out.push(cur.trim());
      if (s.length > max) {
        for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
        cur = '';
      } else {
        cur = s;
      }
    } else {
      cur = cur ? cur + ' ' + s : s;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function makeConnectionId(): string {
  // 32 hex chars, no dashes
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function buildSpeechConfig(): string {
  const ts = new Date().toString();
  const cfg = {
    context: {
      synthesis: {
        audio: {
          metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
          outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
        },
      },
    },
  };
  return (
    `X-Timestamp:${ts}\r\n` +
    'Content-Type:application/json; charset=utf-8\r\n' +
    'Path:speech.config\r\n\r\n' +
    JSON.stringify(cfg)
  );
}

function buildSsmlMessage(reqId: string, voice: string, rate: string, pitch: string, text: string, lang: string): string {
  const ts = new Date().toString();
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
    `<voice name='${voice}'>` +
    `<prosody pitch='${pitch}' rate='${rate}' volume='+0%'>${escapeXml(text)}</prosody>` +
    `</voice></speak>`;
  return (
    `X-RequestId:${reqId}\r\n` +
    'Content-Type:application/ssml+xml\r\n' +
    `X-Timestamp:${ts}Z\r\n` +
    'Path:ssml\r\n\r\n' +
    ssml
  );
}

async function synthChunk(text: string, voice: string, rate: string, pitch: string, lang: string): Promise<Uint8Array> {
  return await new Promise((resolve, reject) => {
    let settled = false;
    const reqId = makeConnectionId();
    const chunks: Uint8Array[] = [];
    let ws: WebSocket;
    try {
      ws = new WebSocket(WSS_URL);
    } catch (e) {
      reject(new Error(`WS open failed: ${(e as Error).message}`));
      return;
    }
    ws.binaryType = 'arraybuffer';

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch { /* */ }
        reject(new Error('Edge TTS timeout'));
      }
    }, 30000);

    ws.onopen = () => {
      try {
        ws.send(buildSpeechConfig());
        ws.send(buildSsmlMessage(reqId, voice, rate, pitch, text, lang));
      } catch (e) {
        clearTimeout(timeout);
        settled = true;
        reject(e);
      }
    };

    ws.onmessage = (ev) => {
      const data = ev.data;
      if (typeof data === 'string') {
        if (data.includes('Path:turn.end')) {
          clearTimeout(timeout);
          settled = true;
          try { ws.close(); } catch { /* */ }
          const total = chunks.reduce((a, b) => a + b.length, 0);
          const out = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) { out.set(c, off); off += c.length; }
          resolve(out);
        }
      } else if (data instanceof ArrayBuffer) {
        const buf = new Uint8Array(data);
        // First 2 bytes = big-endian header length; then header text; then audio bytes.
        if (buf.length < 2) return;
        const headerLen = (buf[0] << 8) | buf[1];
        const audioStart = 2 + headerLen;
        if (audioStart < buf.length) {
          chunks.push(buf.slice(audioStart));
        }
      }
    };

    ws.onerror = (e: any) => {
      if (settled) return;
      clearTimeout(timeout);
      settled = true;
      reject(new Error(`Edge TTS WS error: ${e?.message || 'unknown'}`));
    };

    ws.onclose = (ev) => {
      if (settled) return;
      clearTimeout(timeout);
      settled = true;
      reject(new Error(`Edge TTS WS closed (${ev.code}) before completion`));
    };
  });
}

// Best-effort in-memory rate limit (per worker).
const RL = new Map<string, { count: number; reset: number }>();
function rateLimit(ip: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const cur = RL.get(ip);
  if (!cur || cur.reset < now) { RL.set(ip, { count: 1, reset: now + windowMs }); return true; }
  cur.count++;
  return cur.count <= max;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (!rateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'rate limit exceeded' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  let body: any;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
  const text = String(body?.text ?? '').trim();
  const voice = String(body?.voice ?? 'fa-IR-DilaraNeural');
  const rate = String(body?.rate ?? '+0%');
  const pitch = String(body?.pitch ?? '+0Hz');
  if (!text) return new Response(JSON.stringify({ error: 'text is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (text.length > MAX_TEXT) return new Response(JSON.stringify({ error: `text too long (max ${MAX_TEXT})` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (!/^[a-zA-Z]{2,}-[A-Za-z]{2,}-[A-Za-z]+Neural$/.test(voice)) {
    return new Response(JSON.stringify({ error: 'invalid voice id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const lang = voice.split('-').slice(0, 2).join('-');

  try {
    const parts = chunkText(text);
    const audios: Uint8Array[] = [];
    for (const part of parts) {
      const a = await synthChunk(part, voice, rate, pitch, lang);
      audios.push(a);
    }
    const total = audios.reduce((a, b) => a + b.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of audios) { out.set(a, off); off += a.length; }
    return new Response(out, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || 'edge tts failed' }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
