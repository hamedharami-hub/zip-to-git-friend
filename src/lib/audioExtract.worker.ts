/**
 * Audio extraction worker.
 *
 * Off-loads the heavy decodeAudioData + resample + WAV encode work from the
 * main thread so the transcription UI does not freeze for large files.
 *
 * Falls back gracefully: if the browser does not expose AudioContext inside a
 * Worker, we post an error and the caller can run the same logic on the main
 * thread.
 */

const TARGET_SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2; // 16-bit PCM
const TARGET_CHUNK_BYTES = 18 * 1024 * 1024;

interface AudioChunkMessage {
  blob: Blob;
  offsetSec: number;
  durationSec: number;
  index: number;
  total: number;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function readArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsArrayBuffer(file);
  });
}

function getAudioContextConstructor():
  | (new (options?: AudioContextOptions) => AudioContext)
  | undefined {
  return (
    (self as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
    (self as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

async function decodeToMono16k(file: Blob): Promise<Float32Array> {
  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) {
    throw new Error("AudioContext is not available in this worker.");
  }

  const buf = await readArrayBuffer(file);

  const tmpCtx = new AudioContextCtor();
  let decoded: AudioBuffer;
  try {
    decoded = await tmpCtx.decodeAudioData(buf.slice(0));
  } finally {
    void tmpCtx.close();
  }

  const targetLength = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataLen = samples.length * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buffer);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true);
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function extractAudioChunks(file: Blob): Promise<AudioChunkMessage[]> {
  const samples = await decodeToMono16k(file);
  const totalBytes = samples.length * BYTES_PER_SAMPLE;
  const samplesPerChunk = Math.floor(TARGET_CHUNK_BYTES / BYTES_PER_SAMPLE);
  const chunkCount = Math.max(1, Math.ceil(totalBytes / TARGET_CHUNK_BYTES));

  const chunks: AudioChunkMessage[] = [];
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

ctx.addEventListener("message", async (event: MessageEvent<{ file: Blob }>) => {
  const { file } = event.data;
  try {
    const chunks = await extractAudioChunks(file);
    ctx.postMessage({ type: "complete", chunks });
  } catch (err) {
    ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
});
