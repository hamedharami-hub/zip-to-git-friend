// deno-lint-ignore-file no-explicit-any
// Free server-side TTS proxy.
//
// Tries Microsoft Edge "Read Aloud" first (high quality neural voices,
// e.g. fa-IR-DilaraNeural). If that fails (Microsoft increasingly blocks
// cloud-IP ranges), transparently falls back to Google Translate TTS,
// which works reliably from any datacenter and supports Persian (fa) and
// English (en-US/en-GB/en-AU). No API key required for either path.
//
// Response: audio/mpeg (MP3).

import WebSocket from 'npm:ws@8.18.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WSS_BASE = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_TOKEN}`;
const SEC_MS_GEC_VERSION = '1-130.0.2849.68';
const MAX_TEXT = 5000;
const EDGE_CHUNK_CHARS = 1500;
const GOOGLE_CHUNK_CHARS = 180; // Google Translate TTS hard limit ~200

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Split into roughly sentence-aligned chunks no larger than max chars. */
function chunkText(text: string, max: number): string[] {
  const out: string[] = [];
  // Split on sentence-ish boundaries first, then on whitespace if still too long.
  const parts = text.split(/(?<=[.!?؟…\n])\s+/);
  let cur = '';
  for (const p of parts) {
    if (!p) continue;
    if ((cur + ' ' + p).trim().length > max) {
      if (cur) { out.push(cur.trim()); cur = ''; }
      if (p.length > max) {
        // hard split on word boundaries
        const words = p.split(/\s+/);
        for (const w of words) {
          if ((cur + ' ' + w).trim().length > max) {
            if (cur) out.push(cur.trim());
            cur = w.length > max ? w.slice(0, max) : w;
            // if a single token > max, push slices
            if (w.length > max) {
              for (let i = max; i < w.length; i += max) out.push(w.slice(i, i + max));
              cur = '';
            }
          } else {
            cur = cur ? cur + ' ' + w : w;
          }
        }
      } else {
        cur = p;
      }
    } else {
      cur = cur ? cur + ' ' + p : p;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function makeConnectionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ───────── Microsoft Edge TTS ─────────

async function generateSecMsGec(): Promise<string> {
  const epochSec = BigInt(Math.floor(Date.now() / 1000));
  const winSec = epochSec + 11644473600n;
  const roundedSec = winSec - (winSec % 300n);
  const ticks = roundedSec * 10000000n;
  const buf = new TextEncoder().encode(`${ticks.toString()}${TRUSTED_TOKEN}`);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
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
  return `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(cfg)}`;
}

function buildSsmlMessage(reqId: string, voice: string, rate: string, pitch: string, text: string, lang: string): string {
  const ts = new Date().toString();
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
    `<voice name='${voice}'>` +
    `<prosody pitch='${pitch}' rate='${rate}' volume='+0%'>${escapeXml(text)}</prosody>` +
    `</voice></speak>`;
  return `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n${ssml}`;
}

async function edgeSynthChunk(text: string, voice: string, rate: string, pitch: string, lang: string): Promise<Uint8Array> {
  const gec = await generateSecMsGec();
  const url = `${WSS_BASE}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${makeConnectionId()}`;
  return await new Promise((resolve, reject) => {
    let settled = false;
    const reqId = makeConnectionId();
    const chunks: Uint8Array[] = [];
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, {
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache',
          'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
        },
      });
    } catch (e) {
      reject(new Error(`WS open failed: ${(e as Error).message}`));
      return;
    }
    ws.binaryType = 'arraybuffer';
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* */ }
      reject(new Error('Edge TTS timeout'));
    }, 20000);
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
    ws.onmessage = (ev: any) => {
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
        if (buf.length < 2) return;
        const headerLen = (buf[0] << 8) | buf[1];
        const audioStart = 2 + headerLen;
        if (audioStart < buf.length) chunks.push(buf.slice(audioStart));
      }
    };
    ws.onerror = (e: any) => {
      if (settled) return;
      clearTimeout(timeout);
      settled = true;
      reject(new Error(`Edge TTS error: ${e?.message || 'unknown'}`));
    };
    ws.onclose = (ev: any) => {
      if (settled) return;
      clearTimeout(timeout);
      settled = true;
      reject(new Error(`Edge TTS closed (${ev?.code}) before completion`));
    };
  });
}

// ───────── Google Translate TTS fallback ─────────

/** Map a Microsoft-style voice id to a Google Translate `tl` language code. */
function voiceToGoogleLang(voice: string): string {
  const v = voice.toLowerCase();
  if (v.startsWith('fa')) return 'fa';
  if (v.startsWith('en-gb')) return 'en-GB';
  if (v.startsWith('en-au')) return 'en-AU';
  return 'en-US';
}

async function googleSynthChunk(text: string, lang: string, _speed = 1): Promise<Uint8Array> {
  const url =
    `https://translate.google.com/translate_tts?ie=UTF-8` +
    `&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(lang)}&client=tw-ob`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  });
  if (!res.ok) throw new Error(`Google TTS ${res.status}`);
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

// ───────── HTTP entry ─────────

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
  const rate = String(body?.rate ?? '+0%');
  const pitch = String(body?.pitch ?? '+0Hz');
  if (!text) return jsonError('text is required');
  if (text.length > MAX_TEXT) return jsonError(`text too long (max ${MAX_TEXT})`);
  if (!/^[a-zA-Z]{2,}-[A-Za-z]{2,}-[A-Za-z]+Neural$/.test(voice)) return jsonError('invalid voice id');
  const lang = voice.split('-').slice(0, 2).join('-');

  // Try Microsoft Edge TTS first.
  try {
    const parts = chunkText(text, EDGE_CHUNK_CHARS);
    const audios: Uint8Array[] = [];
    for (const part of parts) audios.push(await edgeSynthChunk(part, voice, rate, pitch, lang));
    const total = audios.reduce((a, b) => a + b.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of audios) { out.set(a, off); off += a.length; }
    return new Response(out, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'X-TTS-Provider': 'edge' },
    });
  } catch (edgeErr) {
    console.warn('[edge-tts] Microsoft path failed, falling back to Google:', (edgeErr as Error).message);
  }

  // Fallback: Google Translate TTS.
  try {
    const gLang = voiceToGoogleLang(voice);
    const speed = rate.endsWith('%') ? (1 + Number(rate.replace('%', '')) / 100) : 1;
    const parts = chunkText(text, GOOGLE_CHUNK_CHARS);
    const audios: Uint8Array[] = [];
    for (const part of parts) {
      audios.push(await googleSynthChunk(part, gLang, Math.max(0.5, Math.min(2, speed))));
    }
    const total = audios.reduce((a, b) => a + b.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of audios) { out.set(a, off); off += a.length; }
    return new Response(out, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'X-TTS-Provider': 'google' },
    });
  } catch (gErr) {
    return jsonError(`همه‌ی موتورها ناموفق بودند: ${(gErr as Error).message}`, 502);
  }
});
