import type { SubtitleCue } from '@/types';

function tsToMs(ts: string): number {
  const m = ts.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!m) return 0;
  const [, h, mn, s, ms] = m;
  return (parseInt(h) * 3600 + parseInt(mn) * 60 + parseInt(s)) * 1000 + parseInt(ms);
}

function stripHtml(text: string): string {
  return text.replace(/<\/?[^>]+>/g, '');
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function parseSRT(content: string): SubtitleCue[] {
  // Strip BOM
  const cleaned = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  const blocks = cleaned.split(/\n\s*\n/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.length > 0);
    if (lines.length < 2) continue;

    let lineIdx = 0;
    const indexLine = lines[lineIdx];
    let index = parseInt(indexLine, 10);
    if (isNaN(index)) {
      // No numeric index; assume first line is timing
      index = cues.length + 1;
    } else {
      lineIdx++;
    }

    const timingLine = lines[lineIdx];
    if (!timingLine || !timingLine.includes('-->')) continue;
    const [startStr, endStr] = timingLine.split('-->');
    const startMs = tsToMs(startStr);
    const endMs = tsToMs(endStr);
    if (!(startMs < endMs)) continue;

    const text = stripHtml(lines.slice(lineIdx + 1).join('\n')).trim();
    if (!text) continue;

    cues.push({ id: uuid(), index, startMs, endMs, text });
  }

  // Sort and drop overlaps within same track (keep earlier)
  cues.sort((a, b) => a.startMs - b.startMs);
  const result: SubtitleCue[] = [];
  for (const c of cues) {
    const prev = result[result.length - 1];
    if (prev && c.startMs < prev.endMs) {
      // overlap: trim current start
      if (c.endMs > prev.endMs) {
        result.push({ ...c, startMs: prev.endMs });
      }
      continue;
    }
    result.push(c);
  }
  return result;
}
