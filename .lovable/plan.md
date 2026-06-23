# Stable Persian TTS via Microsoft Edge TTS

Microsoft's Edge browser "Read Aloud" service offers high‑quality neural voices (including `fa-IR-DilaraNeural` and `fa-IR-FaridNeural`) for free, no API key required. It uses a WebSocket endpoint with a well‑known `TrustedClientToken`. This is the most reliable free Persian TTS available today — far more stable than Hugging Face Spaces.

We'll wrap it in a Supabase Edge Function (server‑side WebSocket, returns MP3) and expose it as a new engine in the existing TTS UI.

## 1. New Edge Function — `supabase/functions/edge-tts/index.ts`

- Public (no JWT, `verify_jwt = false`) — Edge TTS itself has no auth, and we don't want to expose user tokens.
- Input JSON: `{ text: string, voice?: string, rate?: string, pitch?: string }`
  - Defaults: `voice="fa-IR-DilaraNeural"`, `rate="+0%"`, `pitch="+0Hz"`.
  - Hard limits: text ≤ 5000 chars; reject empty.
- Splits text into sentence‑aligned chunks (~1500 chars, same helper style as `elevenlabs-tts`).
- For each chunk:
  1. Open WebSocket to
     `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4`.
  2. Send the `speech.config` JSON message (audio output format `audio-24khz-48kbitrate-mono-mp3`).
  3. Send an SSML message with the chosen voice, rate, pitch (XML‑escaped text).
  4. Collect binary audio frames (skip the 2‑byte header offset framing) until the `Path:turn.end` text frame arrives, then close.
- Concatenate all chunk MP3 bytes and return `Content-Type: audio/mpeg` with CORS headers (`Access-Control-Allow-Origin: *`, OPTIONS preflight).
- Errors: return JSON `{ error }` with 4xx/5xx and CORS headers; include a clear message when the WS closes unexpectedly so the client can show it.
- No secrets needed — nothing to add via `add_secret`.

Rate limiting: a simple in‑memory per‑IP token bucket (best‑effort) to avoid abuse; 30 req/min.

## 2. Frontend wiring

Add a new engine id `edgetts` everywhere the other engines live:

- `src/components/books/chapter-tts/constants.ts`
  - Extend `Engine` union and `ENGINES` with `'edgetts'`.
- `src/components/books/chapter-tts/EngineSelector.tsx`
  - Add `{ id: 'edgetts', label: 'Edge TTS' }` (place near top, before Azure — it's the recommended Persian option).
- `src/lib/edgeTts.ts` (new)
  - `EDGE_TTS_VOICES` list:
    - Persian: `fa-IR-DilaraNeural` (female), `fa-IR-FaridNeural` (male)
    - English: `en-US-AriaNeural`, `en-US-GuyNeural`, `en-GB-SoniaNeural`, `en-AU-NatashaNeural`
  - `EdgeTtsError` class.
  - `synthesizeWithEdgeTts({ text, voice, rate })` — calls the Supabase function via `supabase.functions.invoke('edge-tts', { body })` and returns a `Blob`. Converts rate (0.5–2.0) to `"+NN%" / "-NN%"`.
- `src/components/books/chapter-tts/synthesizeOther.ts`
  - Add `'edgetts'` to `OtherEngine`, route to `synthesizeWithEdgeTts`. Include `EdgeTtsError` in `otherEngineErrorMessage`.
- `src/components/books/chapter-tts/useOtherEngineVoices.ts`
  - Add `edgeTtsVoiceOpts` filtered by `ttsLang`, persisted under `llvp-tts-edge-voice` (default first Persian voice when `ttsLang==='fa'`).
- `src/components/books/ChapterTTSPlayer.tsx` (already wires the other engines through `synthesizeOther` + the voices hook) — add the new voice picker `<Select>` next to the Azure/HF ones, gated on `engine === 'edgetts'`, and pass `edgeTtsVoice` into the synth call.
- `src/components/books/ReaderTTSQuickSettings.tsx`
  - Add an "Edge TTS" button in the engine row (alongside browser/gemini/elevenlabs). When selected with Persian, no key is needed — Edge TTS works out of the box.

## 3. UX details

- When the user picks Edge TTS + Persian and Edge TTS is online, no settings are required → show a small "بدون نیاز به کلید" hint under the voice picker.
- Surface backend errors via the existing `toast.error` flow used by the other engines.
- Keep ElevenLabs/Azure/HF as alternatives; do not remove the HF code (still useful for offline / self‑hosted users).

## Technical notes

- WebSocket from Deno: `new WebSocket(url)` is supported in Supabase Edge Functions (Deno runtime).
- Edge TTS binary frame format: the first 2 bytes are the header length; the rest is MP3 — when concatenating, strip the header per frame and stitch the MP3 payloads.
- SSML template:
  ```xml
  <speak version='1.0' xml:lang='fa-IR'>
    <voice name='fa-IR-DilaraNeural'>
      <prosody rate='+0%' pitch='+0Hz'>...escaped text...</prosody>
    </voice>
  </speak>
  ```
- No DB migrations, no secrets, no schema changes.

## Files touched

- `supabase/functions/edge-tts/index.ts` (new)
- `supabase/config.toml` (add `[functions.edge-tts] verify_jwt = false`)
- `src/lib/edgeTts.ts` (new)
- `src/components/books/chapter-tts/constants.ts`
- `src/components/books/chapter-tts/EngineSelector.tsx`
- `src/components/books/chapter-tts/synthesizeOther.ts`
- `src/components/books/chapter-tts/useOtherEngineVoices.ts`
- `src/components/books/ChapterTTSPlayer.tsx`
- `src/components/books/ReaderTTSQuickSettings.tsx`
