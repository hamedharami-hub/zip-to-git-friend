/**
 * Shared paragraph chunking helper.
 *
 * Used by both the renderer (InteractiveBookText) and the batch analyzer
 * (batchAnalyzeChapter) so each rendered paragraph maps 1:1 to a cached
 * AI analysis. Without this, long source paragraphs got split for display
 * but the analyzer cached by the WHOLE paragraph hash → only short
 * paragraphs ever showed translations.
 */

export function splitIntoShortChunks(text: string, maxChars = 220): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // 1. Sentence-level split.
  const sentenceRegex = /[^.!?…؟!]+[.!?…؟!]+["'""»)\]]?\s*|[^.!?…؟!]+$/g;
  const sentences = (trimmed.match(sentenceRegex) ?? [trimmed])
    .map((s) => s.trim())
    .filter(Boolean);

  // 2. Pack 1–2 sentences per chunk, respecting maxChars.
  const out: string[] = [];
  let buf = "";
  let sentencesInBuf = 0;
  for (const s of sentences) {
    const candidate = buf ? `${buf} ${s}` : s;
    if (buf && (sentencesInBuf >= 2 || candidate.length > maxChars)) {
      out.push(buf);
      buf = s;
      sentencesInBuf = 1;
    } else {
      buf = candidate;
      sentencesInBuf += 1;
    }
  }
  if (buf) out.push(buf);

  // 3. Hard-split any remaining over-long chunks on commas/semicolons.
  const final: string[] = [];
  for (const c of out) {
    if (c.length <= maxChars * 1.4) {
      final.push(c);
      continue;
    }
    const parts = c.split(/(?<=[,;:،؛])\s+/);
    let sub = "";
    for (const p of parts) {
      const candidate = sub ? `${sub} ${p}` : p;
      if (sub && candidate.length > maxChars) {
        final.push(sub);
        sub = p;
      } else {
        sub = candidate;
      }
    }
    if (sub) final.push(sub);
  }

  // 4. Re-merge tiny tail chunks.
  const compact: string[] = [];
  for (const c of final) {
    const last = compact[compact.length - 1];
    if (last && c.length < 40 && last.length + 1 + c.length <= maxChars * 1.6) {
      compact[compact.length - 1] = `${last} ${c}`.trim();
    } else {
      compact.push(c);
    }
  }
  return compact;
}
