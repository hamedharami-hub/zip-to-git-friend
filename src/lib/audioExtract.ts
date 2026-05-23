/**
 * Audio extraction & chunking for Whisper-style transcription.
 *
 * Decodes a video/audio File into a downsampled mono 16 kHz PCM stream using the
 * browser's WebAudio API, then encodes it to 16-bit WAV. Large outputs are split
 * into time-aligned chunks so each chunk stays well under provider upload limits
 * (Groq currently 25 MB; we target ~18 MB per chunk to leave headroom).
 *
 * No external libs required — fully runs in the browser.
 */

const TARGET_SAMPLE_RATE = 16000; // mono 16 kHz is plenty for speech
const BYTES_PER_SAMPLE = 2; // 16-bit PCM
// 18 MB ≈ 18*1024*1024 bytes ÷ 2 bytes/sample ÷ 16000 sps ≈ 590 s ≈ 9.8 min
const TARGET_CHUNK_BYTES = 18 * 1024 * 1024;

export interface AudioChunk {
  blob: Blob;
  /** Offset in seconds from the start of the original media. */
  offsetSec: number;
  /** Duration of this chunk in seconds. */
  durationSec: number;
  index: number;
  total: number;
}

/** Read a File into an ArrayBuffer. */
function readArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Decode arbitrary audio/video bytes into a single mono Float32Array at the
 * given target sample rate using OfflineAudioContext for downsampling.
 */
async function decodeToMono16k(file: File | Blob): Promise<Float32Array> {
  const buf = await readArrayBuffer(file);

  // Use a temporary online-style context for the initial decodeAudioData (some
  // browsers require an AudioContext to decode). It's closed immediately.
  const tmpCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  let decoded: AudioBuffer;
  try {
    decoded = await tmpCtx.decodeAudioData(buf.slice(0));
  } finally {
    void tmpCtx.close();
  }

  const targetLength = Math.ceil((decoded.duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  // Mix down to mono via a ChannelMerger-less approach: connect to a 1-channel
  // destination — Web Audio averages channels automatically.
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

/** Encode a Float32Array (mono, sampleRate) as a 16-bit PCM WAV Blob. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataLen = samples.length * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buffer);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true); // byte rate
  view.setUint16(32, BYTES_PER_SAMPLE, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Extract mono 16 kHz WAV chunks from any audio/video file.
 * Returns one or more chunks each well under the upload size limit, with
 * absolute time offsets so transcription cues can be re-aligned.
 */
export async function extractAudioChunks(file: File | Blob): Promise<AudioChunk[]> {
  const samples = await decodeToMono16k(file);
  const totalBytes = samples.length * BYTES_PER_SAMPLE;
  const samplesPerChunk = Math.floor(TARGET_CHUNK_BYTES / BYTES_PER_SAMPLE);
  const chunkCount = Math.max(1, Math.ceil(totalBytes / TARGET_CHUNK_BYTES));

  const chunks: AudioChunk[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const startSample = i * samplesPerChunk;
    const endSample = Math.min(samples.length, startSample + samplesPerChunk);
    const slice = samples.subarray(startSample, endSample);
    const blob = encodeWav(slice, TARGET_SAMPLE_RATE);
    chunks.push({
      blob,
      offsetSec: startSample / TARGET_SAMPLE_RATE,
      durationSec: (endSample - startSample) / TARGET_SAMPLE_RATE,
      index: i,
      total: chunkCount,
    });
  }
  return chunks;
}
