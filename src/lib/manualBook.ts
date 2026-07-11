/**
 * Helpers for the "add book manually" flow.
 *
 * Users paste plain text (one chapter at a time). We turn it into the same
 * sanitized HTML + plain-text shape the EPUB parser produces, so the rest of
 * the reader (analysis, TTS, rewrite, Leitner export…) works unchanged.
 */
import type { BookChapter } from "@/types";

/** Escape "&", "<", ">" so paragraphs render as text, not HTML. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Turn pasted text into chapter HTML + plain-text body. */
export function pastedTextToChapter(raw: string): {
  html: string;
  text: string;
  wordCount: number;
} {
  const cleaned = (raw ?? "").replace(/\r\n?/g, "\n").trim();
  if (!cleaned) return { html: "", text: "", wordCount: 0 };

  // Split into paragraphs on blank lines. Single line breaks within a
  // paragraph become <br/> so poetry / quoted lines keep their shape.
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const html = paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`).join("\n");

  const text = paragraphs.join("\n\n");
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return { html, text, wordCount };
}

/** Hash a string to an integer in [0, 360) for hue selection. */
function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/**
 * Generate a SVG gradient cover with the book's first letter, returned as
 * a data-URL so it can be stored alongside the book row.
 */
export function generateGradientCover(title: string, author?: string): string {
  const hue = hueFromString(title || "book");
  const hue2 = (hue + 40) % 360;
  const initial = (title.trim()[0] ?? "B").toUpperCase();
  const subtitle = (author ?? "").slice(0, 24);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue}, 70%, 55%)"/>
      <stop offset="100%" stop-color="hsl(${hue2}, 70%, 35%)"/>
    </linearGradient>
  </defs>
  <rect width="400" height="600" fill="url(#g)"/>
  <rect x="0" y="0" width="400" height="600" fill="black" opacity="0.08"/>
  <text x="200" y="320" text-anchor="middle"
        font-family="Georgia, 'Playfair Display', serif"
        font-size="220" font-weight="700" fill="white" opacity="0.95">${escapeHtml(initial)}</text>
  <text x="200" y="540" text-anchor="middle"
        font-family="-apple-system, system-ui, sans-serif"
        font-size="22" fill="white" opacity="0.85"
        letter-spacing="2">${escapeHtml((title.slice(0, 28) || "BOOK").toUpperCase())}</text>
  ${
    subtitle
      ? `<text x="200" y="568" text-anchor="middle"
        font-family="-apple-system, system-ui, sans-serif"
        font-size="14" fill="white" opacity="0.7">${escapeHtml(subtitle)}</text>`
      : ""
  }
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Read an uploaded image file as a data URL (capped at ~256 KB to keep cloud sync fast). */
export async function imageFileToDataUrl(
  file: File,
  maxBytes = 256 * 1024,
): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  if (file.size > maxBytes * 4) return null; // very large images: skip; user can crop & retry.
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const v = typeof reader.result === "string" ? reader.result : null;
      resolve(v);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/** Tiny preview snapshot — first 280 chars of a chapter, single-spaced. */
export function chapterSnippet(text: string, max = 280): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export type { BookChapter };
