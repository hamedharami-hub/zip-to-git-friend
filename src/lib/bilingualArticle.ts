import { hashParagraph } from "@/lib/bookAnalysis";
import { paragraphAnalysisKey, saveParagraphAnalysis } from "@/lib/bookDb";
import type { BookParagraphAnalysis } from "@/types";

export interface SectionPhrase {
  phrase: string;
  meaning: string;
}

export interface SectionParagraph {
  en: string;
  fa: string;
  phrases: SectionPhrase[];
}

export interface BilingualSection {
  heading: string;
  headingFa: string;
  paragraphs: SectionParagraph[];
  phrases: SectionPhrase[];
}

export interface BilingualArticle {
  title: string;
  titleFa: string;
  tldr: string;
  tldrFa: string;
  sections: BilingualSection[];
}

function fromBase64(s: string): string {
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
  return decodeURIComponent(atob(padded));
}

export function extractBilingualData(html: string): BilingualArticle | null {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const script = doc.getElementById("bilingual-data");
    const b64 = script?.textContent?.trim();
    if (!b64) return null;
    const json = fromBase64(b64);
    return JSON.parse(json) as BilingualArticle;
  } catch {
    return null;
  }
}

export function buildBilingualAnalyses(
  data: BilingualArticle,
  bookId: string,
  chapterIndex: number,
): Record<string, BookParagraphAnalysis> {
  const out: Record<string, BookParagraphAnalysis> = {};
  const now = Date.now();

  const add = (text: string, translation: string, idioms: SectionPhrase[] = []) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const hash = hashParagraph(trimmed);
    out[hash] = {
      id: paragraphAnalysisKey(bookId, chapterIndex, hash),
      bookId,
      chapterIndex,
      paragraphHash: hash,
      translation,
      vocabulary: [],
      idioms: idioms.map((p) => ({ phrase: p.phrase, meaning: p.meaning })),
      analyzedAt: now,
      model: "bilingual-server",
    };
  };

  // Title / TL;DR are not rendered as paragraphs, but headings and body are.
  for (const section of data.sections) {
    add(section.heading, section.headingFa);
    for (const para of section.paragraphs) {
      add(para.en, para.fa, para.phrases);
    }
  }

  return out;
}

export function allBilingualPhrases(data: BilingualArticle): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const section of data.sections) {
    for (const para of section.paragraphs) {
      for (const ph of para.phrases ?? []) {
        if (ph.phrase && !seen.has(ph.phrase)) {
          seen.add(ph.phrase);
          result.push(ph.phrase);
        }
      }
    }
  }
  return result;
}

export async function seedBilingualAnalyses(
  data: BilingualArticle,
  bookId: string,
  chapterIndex: number,
): Promise<void> {
  const analyses = buildBilingualAnalyses(data, bookId, chapterIndex);
  for (const a of Object.values(analyses)) {
    await saveParagraphAnalysis(a).catch(() => null);
  }
}
