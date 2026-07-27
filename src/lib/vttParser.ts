import type { SubtitleCue } from "@/types";

function tsToMs(ts: string): number {
  // WebVTT timestamps: [HH:]MM:SS.mmm
  const m = ts.trim().match(/^(?:(\d{2}):)?(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!m) return 0;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const mn = parseInt(m[2], 10);
  const s = parseInt(m[3], 10);
  const ms = parseInt(m[4], 10);
  return (h * 3600 + mn * 60 + s) * 1000 + ms;
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function parseVTT(content: string): SubtitleCue[] {
  const cleaned = content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!cleaned.toUpperCase().startsWith("WEBVTT")) {
    // Be lenient: still try to parse cue blocks.
  }

  const blocks = cleaned.split(/\n\s*\n/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.length > 0);
    if (lines.length < 2) continue;

    let lineIdx = 0;
    // Skip WEBVTT header and optional cue identifiers (which are non-timing lines
    // directly above a timing line).
    if (lines[0].toUpperCase().startsWith("WEBVTT")) {
      lineIdx = 1;
      if (lines.length < 3) continue;
    }

    // Optional cue identifier (any line before the timing line).
    let index = cues.length + 1;
    if (!lines[lineIdx].includes("-->")) {
      index = parseInt(lines[lineIdx], 10) || index;
      lineIdx++;
    }

    const timingLine = lines[lineIdx];
    if (!timingLine || !timingLine.includes("-->")) continue;

    // Timing may be followed by cue-settings; strip them.
    const [startRaw, endRaw] = timingLine.split("-->");
    const startMs = tsToMs(startRaw);
    const endMs = tsToMs(endRaw.split(/\s/)[0] ?? endRaw);
    if (!(startMs < endMs)) continue;

    const text = stripTags(lines.slice(lineIdx + 1).join("\n")).trim();
    if (!text) continue;

    cues.push({ id: uuid(), index, startMs, endMs, text });
  }

  cues.sort((a, b) => a.startMs - b.startMs);
  const result: SubtitleCue[] = [];
  for (const c of cues) {
    const prev = result[result.length - 1];
    if (prev && c.startMs < prev.endMs) {
      if (c.endMs > prev.endMs) {
        result.push({ ...c, startMs: prev.endMs });
      }
      continue;
    }
    result.push(c);
  }
  return result;
}
