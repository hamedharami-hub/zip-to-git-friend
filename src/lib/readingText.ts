/**
 * Helpers for the Reading Mode features: extract plain text from an
 * element, tokenize into words (fa+en aware), split into chunks and
 * compute the ORP (Optimal Recognition Point) index for RSVP display.
 */

export function extractTextFromElement(el: HTMLElement | null): string {
  if (!el) return '';
  // Clone to safely strip unwanted nodes without touching the live DOM.
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script,style,button,noscript,figure figcaption').forEach((n) => n.remove());
  const raw = clone.innerText || clone.textContent || '';
  return raw.replace(/\u00A0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Split text into tokens (words with trailing whitespace/punctuation stripped). */
export function tokenizeWords(text: string): string[] {
  if (!text) return [];
  // Split on any whitespace; keep punctuation attached to word for pause detection.
  return text.split(/\s+/g).filter(Boolean);
}

/** Chunk tokens into arrays of size `n`. */
export function chunkTokens(tokens: string[], n: number): string[][] {
  if (n <= 1) return tokens.map((t) => [t]);
  const out: string[][] = [];
  for (let i = 0; i < tokens.length; i += n) out.push(tokens.slice(i, i + n));
  return out;
}

/** ORP: for word length n, roughly 35% into the word. */
export function orpIndex(word: string): number {
  const n = word.length;
  if (n <= 1) return 0;
  if (n <= 4) return 1;
  return Math.min(n - 1, Math.floor(n * 0.35));
}

/** Extra pause multiplier based on trailing punctuation. */
export function pausePenaltyForToken(tok: string): number {
  const last = tok.slice(-1);
  if (/[.!?؟。]/.test(last)) return 1.6;
  if (/[,،;:]/.test(last)) return 1.25;
  return 1;
}

/** Strip trailing punctuation for cleaner ORP display. */
export function displayWord(tok: string): string {
  return tok.replace(/^[«"'(\[]+|[»"',.!?؟;:)\]]+$/g, (m) => m); // keep as-is; caller decides
}
