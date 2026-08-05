/**
 * Renders sanitized chapter HTML as a stream of interactive blocks.
 *
 * Each paragraph is rendered with `InteractiveBookParagraph` (which uses
 * `InteractiveSubtitle` so every word is click-to-translate / add-to-Leitner).
 * Hovering or focusing a paragraph reveals translation and analysis controls.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InteractiveSubtitle } from "@/components/ai/InteractiveSubtitle";
import { Paragraph } from "@/components/books/InteractiveBookParagraph";
import { getCachedParagraphAnalysis, hashParagraph } from "@/lib/bookAnalysis";
import { useSettingsStore } from "@/store/settingsStore";
import { subscribeChapterAnalyses } from "@/lib/chapterAnalysisBus";
import { subscribeParagraphSpeech } from "@/lib/paragraphSpeechBus";
import { splitIntoShortChunks } from "@/lib/paragraphSplit";
import type { BookParagraphAnalysis, BookHighlight } from "@/types";
import { cn } from "@/lib/utils";
import { highlightColor, type HighlightColor } from "@/hooks/useBookAnnotations";

export type { DisplayLang } from "./InteractiveBookParagraph";

interface SectionPhrase {
  phrase: string;
  meaning: string;
}

interface Props {
  html: string;
  bookId: string;
  chapterIndex: number;
  fontSizeClass: string;
  fontFamilyClass: string;
  /** Highlights for THIS chapter only (filtered by parent). */
  highlights?: BookHighlight[];
  /** Optional: target words/phrases the chapter explicitly teaches. */
  targetWords?: string[];
  /** Controlled by parent: which language(s) to render for each paragraph. */
  displayLang?: import("./InteractiveBookParagraph").DisplayLang;
  /** Pre-seeded paragraph analyses (e.g. server-generated translations). */
  initialAnalyses?: Record<string, BookParagraphAnalysis>;
  /** Called whenever the cached analysis count changes. */
  onTranslationCountChange?: (n: number) => void;
  /** Source kind for auto-foldering Leitner cards (defaults to 'book'). */
  sourceKind?: import("@/types").LeitnerSourceKind;
  /** Title used as a Leitner sub-folder name (book/article title). */
  sourceTitle?: string;
  /** Called when an inline image is clicked. */
  onImageClick?: (src: string) => void;
}

interface Block {
  kind: "h1" | "h2" | "h3" | "p" | "blockquote" | "li" | "hr" | "img" | "phrases" | "raw";
  text?: string;
  src?: string;
  alt?: string;
  phrases?: SectionPhrase[];
  key: string;
}

function decodePhrasesB64(attr: string | null): SectionPhrase[] | undefined {
  if (!attr) return undefined;
  try {
    const normalized = attr.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4;
    const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
    const json = decodeURIComponent(atob(padded));
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed)) return parsed as SectionPhrase[];
  } catch {
    /* ignore */
  }
  return undefined;
}

function htmlToBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body ?? doc.documentElement;
  const blocks: Block[] = [];
  let n = 0;

  const visit = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();

    switch (tag) {
      case "script":
      case "style":
      case "noscript":
        return;
      case "h1":
      case "h2":
      case "h3":
        if (text) blocks.push({ kind: tag as Block["kind"], text, key: `b${n++}` });
        return;
      case "h4":
      case "h5":
      case "h6":
        if (text) blocks.push({ kind: "h3", text, key: `b${n++}` });
        return;
      case "p":
        if (text) blocks.push({ kind: "p", text, key: `b${n++}` });
        return;
      case "blockquote":
        if (text) blocks.push({ kind: "blockquote", text, key: `b${n++}` });
        return;
      case "ul":
      case "ol": {
        const phrasesB64 = el.getAttribute("data-phrases-b64");
        const phrases = decodePhrasesB64(phrasesB64);
        if (phrases && phrases.length > 0) {
          blocks.push({ kind: "phrases", phrases, key: `b${n++}` });
          return;
        }
        el.querySelectorAll(":scope > li").forEach((li) => {
          const t = (li.textContent ?? "").replace(/\s+/g, " ").trim();
          if (t) blocks.push({ kind: "li", text: t, key: `b${n++}` });
        });
        return;
      }
      case "hr":
        blocks.push({ kind: "hr", key: `b${n++}` });
        return;
      case "img": {
        const src = el.getAttribute("src") ?? "";
        const alt = el.getAttribute("alt") ?? "";
        if (src && /^(https?:|data:|blob:)/i.test(src)) {
          blocks.push({ kind: "img", src, alt, key: `b${n++}` });
        }
        return;
      }
      case "div":
      case "section":
      case "article":
      case "main":
      case "header":
      case "footer":
        Array.from(el.children).forEach(visit);
        if (el.children.length === 0 && text) {
          blocks.push({ kind: "p", text, key: `b${n++}` });
        }
        return;
      default:
        if (text && el.children.length === 0) {
          blocks.push({ kind: "p", text, key: `b${n++}` });
        } else {
          Array.from(el.children).forEach(visit);
        }
    }
  };

  Array.from(root.children).forEach(visit);

  // Drop adjacent duplicate paragraphs.
  const deduped: Block[] = [];
  for (const b of blocks) {
    const last = deduped[deduped.length - 1];
    if (last && last.kind === b.kind && last.text && b.text && last.text === b.text) continue;
    deduped.push(b);
  }

  // Merge very short paragraph fragments (broken lines, single words) into
  // the previous paragraph so the reader doesn't see a wall of half-lines.
  const MIN_PARA_CHARS = 60;
  const merged: Block[] = [];
  for (const b of deduped) {
    const prev = merged[merged.length - 1];
    if (
      b.kind === "p" &&
      b.text &&
      b.text.length < MIN_PARA_CHARS &&
      prev &&
      prev.kind === "p" &&
      prev.text
    ) {
      // Don't merge if previous already ends a sentence AND fragment is itself a sentence.
      const prevEndsSentence = /[.!?…؟"'»)]\s*$/.test(prev.text);
      const fragIsSentence = /[.!?…؟"'»)]\s*$/.test(b.text) && b.text.length >= 30;
      if (!(prevEndsSentence && fragIsSentence)) {
        prev.text = `${prev.text.replace(/\s+$/, "")} ${b.text}`.trim();
        continue;
      }
    }
    merged.push({ ...b });
  }
  // Use merged as input for next stage.
  deduped.length = 0;
  deduped.push(...merged);

  // Split long p / blockquote / li blocks into shorter 1–2 sentence chunks
  // so each "paragraph card" the reader sees is digestible.
  const out: Block[] = [];
  let n2 = 0;
  for (const b of deduped) {
    if ((b.kind === "p" || b.kind === "blockquote" || b.kind === "li") && b.text) {
      const chunks = splitIntoShortChunks(b.text);
      for (const c of chunks) {
        out.push({ kind: b.kind, text: c, key: `s${n2++}` });
      }
    } else {
      out.push(b);
    }
  }
  return out;
}

/** Stable DOM id for a heading — used by the news TOC to scroll into view. */
// eslint-disable-next-line react-refresh/only-export-components -- non-component exports (variants/hooks/contexts)
export function headingSlug(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  // Cheap hash so duplicate headings still get unique ids.
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  return `h-${base || "heading"}-${(h >>> 0).toString(36).slice(0, 6)}`;
}

export function InteractiveBookText({
  html,
  bookId,
  chapterIndex,
  fontSizeClass,
  fontFamilyClass,
  highlights = [],
  targetWords = [],
  displayLang = "en",
  initialAnalyses,
  onTranslationCountChange,
  sourceKind,
  sourceTitle,
  onImageClick,
}: Props) {
  const blocks = useMemo(() => htmlToBlocks(html), [html]);

  const highlightTexts = useMemo(
    () => highlights.map((h) => ({ text: h.text, color: highlightColor(h) })),
    [highlights],
  );

  const targetTexts = useMemo(
    () => targetWords.map((t) => t.trim()).filter((t) => t.length > 1),
    [targetWords],
  );

  const blockMatches = useMemo(() => {
    const map = new Map<
      string,
      { highlights: { text: string; color: HighlightColor }[]; targets: string[] }
    >();
    for (const b of blocks) {
      if (!b.text) continue;
      const para = b.text;
      const matchedHighlights = highlightTexts.filter((h) =>
        para.toLowerCase().includes(h.text.toLowerCase()),
      );
      const matchedTargets = targetTexts.filter((t) =>
        para.toLowerCase().includes(t.toLowerCase()),
      );
      map.set(b.key, { highlights: matchedHighlights, targets: matchedTargets });
    }
    return map;
  }, [blocks, highlightTexts, targetTexts]);

  const [analyses, setAnalyses] = useState<Record<string, BookParagraphAnalysis>>(
    () => initialAnalyses ?? {},
  );

  // Pre-warm: on mount/chapter-change, look up cached analyses for every
  // paragraph so idioms underline themselves without a click.
  useEffect(() => {
    let cancelled = false;
    setAnalyses((prev) => (initialAnalyses ? { ...initialAnalyses } : { ...prev }));
    (async () => {
      const next: Record<string, BookParagraphAnalysis> = initialAnalyses
        ? { ...initialAnalyses }
        : {};
      for (const b of blocks) {
        if (!b.text) continue;
        if (!["p", "blockquote", "li", "h1", "h2", "h3"].includes(b.kind)) continue;
        const cached = await getCachedParagraphAnalysis(bookId, chapterIndex, b.text);
        if (cached) next[hashParagraph(b.text.trim())] = cached;
      }
      if (!cancelled) setAnalyses(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [blocks, bookId, chapterIndex, initialAnalyses]);

  // Live updates from the batch-chapter analyzer (running in a sibling sheet
  // or the Translate-whole-text popover).
  useEffect(() => {
    return subscribeChapterAnalyses(bookId, chapterIndex, (incoming) => {
      setAnalyses((prev) => ({ ...prev, ...incoming }));
    });
  }, [bookId, chapterIndex]);

  // Notify parent whenever the count changes (controls the EN/FA toggle visibility).
  useEffect(() => {
    onTranslationCountChange?.(
      Object.values(analyses).filter((a) => a?.translation?.trim()).length,
    );
  }, [analyses, onTranslationCountChange]);

  // Active paragraph from TTS — for karaoke ring + auto-scroll.
  const [activeSpeechKey, setActiveSpeechKey] = useState<string | null>(null);
  useEffect(() => {
    return subscribeParagraphSpeech(bookId, chapterIndex, setActiveSpeechKey);
  }, [bookId, chapterIndex]);
  const activeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!activeSpeechKey) return;
    const el = activeRef.current;
    if (!el) return;
    // Center the active paragraph in the VISIBLE area above the fixed player.
    const player = document.querySelector<HTMLElement>('[aria-label="Chapter narration player"]');
    const playerH = player?.offsetHeight ?? 0;
    const rect = el.getBoundingClientRect();
    const visibleH = window.innerHeight - playerH;
    const targetTop = rect.top + window.scrollY - (visibleH / 2 - rect.height / 2);
    // Find the nearest scrollable ancestor (the article scroll container).
    let scroller: HTMLElement | null = el.parentElement;
    while (scroller && scroller !== document.body) {
      const oy = getComputedStyle(scroller).overflowY;
      if (oy === "auto" || oy === "scroll") break;
      scroller = scroller.parentElement;
    }
    if (scroller && scroller !== document.body) {
      const sRect = scroller.getBoundingClientRect();
      const offset = rect.top - sRect.top + scroller.scrollTop - (visibleH / 2 - rect.height / 2);
      scroller.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
    } else {
      window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    }
  }, [activeSpeechKey]);

  const textAlign = useSettingsStore((s) => s.settings.paragraphTextAlign) ?? "start";
  const gesturesOn = useSettingsStore((s) => !!s.settings.paragraphGestures);

  const refFor = useCallback(
    (i: number) => `book:${bookId}:${chapterIndex}:p${i}`,
    [bookId, chapterIndex],
  );

  const matchActive = useCallback(
    (enText: string): boolean => {
      if (!activeSpeechKey) return false;
      const key = activeSpeechKey.replace(/\s+/g, " ").trim().toLowerCase();
      const enNorm = enText.replace(/\s+/g, " ").trim().toLowerCase();
      if (enNorm && (enNorm.startsWith(key) || enNorm.includes(key) || key.includes(enNorm)))
        return true;
      const fa = analyses[hashParagraph(enText.trim())]?.translation?.trim();
      if (!fa) return false;
      const faNorm = fa.replace(/\s+/g, " ").trim().toLowerCase();
      return faNorm.startsWith(key) || faNorm.includes(key) || key.includes(faNorm);
    },
    [activeSpeechKey, analyses],
  );

  const handleAnalyzed = useCallback((hash: string, a: BookParagraphAnalysis) => {
    setAnalyses((m) => ({ ...m, [hash]: a }));
  }, []);

  const alignClass =
    textAlign === "justify"
      ? "text-justify"
      : textAlign === "center"
        ? "text-center"
        : "text-start";
  const spacingClass = gesturesOn ? "space-y-3" : "space-y-8";

  if (blocks.length === 0) {
    return <p className="text-center text-muted-foreground text-sm py-12">— empty chapter —</p>;
  }

  return (
    <article
      className={cn("mx-auto w-full", spacingClass, fontSizeClass, fontFamilyClass, alignClass)}
    >
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h1":
          case "h2":
          case "h3": {
            const headText = b.text!;
            const hHash = hashParagraph(headText.trim());
            const hFa = analyses[hHash]?.translation?.trim() ?? "";
            const showHeadFa = !!hFa && (displayLang === "fa" || displayLang === "both");
            const showHeadEn = displayLang !== "fa" || !showHeadFa;
            const slug = headingSlug(headText);
            const sizeCls =
              b.kind === "h1"
                ? "text-3xl font-bold mt-8 mb-2 tracking-tight"
                : b.kind === "h2"
                  ? "text-2xl font-semibold mt-6 mb-1 tracking-tight"
                  : "text-xl font-semibold mt-4 mb-1 tracking-tight";
            const Tag = b.kind as "h1" | "h2" | "h3";
            const isActive = matchActive(headText) || (hFa && matchActive(hFa));
            return (
              <div
                key={b.key}
                id={slug}
                ref={isActive ? activeRef : undefined}
                className={cn(
                  "scroll-mt-24 transition-colors rounded-md",
                  isActive && "bg-primary/10 ring-1 ring-primary/30 px-2 -mx-2",
                )}
              >
                {showHeadEn && (
                  <Tag className={sizeCls}>
                    <InteractiveSubtitle
                      text={headText}
                      context={headText}
                      videoId={bookId}
                      cueId={refFor(i)}
                    />
                  </Tag>
                )}
                {showHeadFa && (
                  <p
                    dir="rtl"
                    lang="fa"
                    className={cn(sizeCls, "text-foreground", showHeadEn && "mt-1")}
                    style={{ fontFamily: '"Vazirmatn","IRANSans","Tahoma",sans-serif' }}
                  >
                    {hFa}
                  </p>
                )}
              </div>
            );
          }

          case "blockquote":
          case "li":
          case "p": {
            const para = b.text!;
            const hash = hashParagraph(para.trim());
            const matched = blockMatches.get(b.key) ?? { highlights: [], targets: [] };
            const isActive = matchActive(para);
            return (
              <Paragraph
                key={b.key}
                kind={b.kind}
                text={para}
                hash={hash}
                bookId={bookId}
                chapterIndex={chapterIndex}
                cueId={refFor(i)}
                analysis={analyses[hash] ?? null}
                onAnalyzed={handleAnalyzed}
                highlights={matched.highlights}
                targets={matched.targets}
                displayLang={displayLang}
                isActiveSpeech={isActive}
                activeRef={isActive ? activeRef : undefined}
                sourceKind={sourceKind}
                sourceTitle={sourceTitle}
              />
            );
          }

          case "hr":
            return <hr key={b.key} className="my-8 border-border" />;

          case "img":
            return (
              <img
                key={b.key}
                src={b.src}
                alt={b.alt ?? ""}
                loading="lazy"
                role={onImageClick ? "button" : undefined}
                tabIndex={onImageClick ? 0 : undefined}
                aria-label={onImageClick ? "بزرگنمایی تصویر" : undefined}
                className={cn(
                  "mx-auto max-h-[60vh] rounded-md border border-border",
                  onImageClick && "cursor-pointer transition hover:ring-2 hover:ring-primary/50",
                )}
                onClick={onImageClick ? () => onImageClick(b.src!) : undefined}
                onKeyDown={
                  onImageClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onImageClick(b.src!);
                        }
                      }
                    : undefined
                }
              />
            );

          case "phrases": {
            const list = b.phrases ?? [];
            if (list.length === 0) return null;
            return (
              <div
                key={b.key}
                className="my-4 rounded-lg border border-primary/20 bg-primary/[0.03] p-4 not-prose"
              >
                <h4 className="text-sm font-semibold text-primary mb-2">
                  عبارات و ضرب‌المثل‌های مهم
                </h4>
                <ul className="space-y-1.5">
                  {list.map((ph, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{ph.phrase}</span>
                      <span className="mx-1.5 text-muted-foreground">—</span>
                      <span
                        dir="auto"
                        className="text-primary"
                        style={{ fontFamily: '"Vazirmatn","IRANSans","Tahoma",sans-serif' }}
                      >
                        {ph.meaning}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          }

          default:
            return null;
        }
      })}
    </article>
  );
}
