/**
 * Renders sanitized chapter HTML as a stream of interactive blocks.
 *
 * Each paragraph is rendered with `InteractiveSubtitle` (so every word is
 * click-to-translate / add-to-Leitner). Hovering or focusing a paragraph
 * reveals an ✨ "Analyze" button that runs the AI paragraph analyzer and
 * pins an inline translation + vocabulary + idioms card under the paragraph.
 *
 * Once an analysis is loaded for a paragraph (either freshly run or already
 * cached on mount), idiom/phrase spans inside the paragraph are highlighted.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Languages, Loader2, Copy, Star } from 'lucide-react';
import { InteractiveSubtitle } from '@/components/ai/InteractiveSubtitle';
import { useParagraphGestures, speakText } from '@/hooks/useParagraphGestures';
import { Button } from '@/components/ui/button';
import { ParagraphAnalysisCard } from '@/components/books/ParagraphAnalysisCard';
import { ParagraphTTSButton } from '@/components/books/ParagraphTTSButton';
import { getCachedParagraphAnalysis, hashParagraph } from '@/lib/bookAnalysis';
import { analyzeParagraphRouted } from '@/lib/bookAiRouter';
import { coerceBookModel } from '@/lib/aiModels';
import { useSettingsStore } from '@/store/settingsStore';
import { useOnline } from '@/hooks/useOnline';
import { toast } from 'sonner';
import { subscribeChapterAnalyses } from '@/lib/chapterAnalysisBus';
import { subscribeParagraphSpeech, speechKeyFor } from '@/lib/paragraphSpeechBus';
import { splitIntoShortChunks } from '@/lib/paragraphSplit';
import type { BookParagraphAnalysis, BookHighlight } from '@/types';
import { cn } from '@/lib/utils';
import {
  HIGHLIGHT_CLASSES,
  highlightColor,
  type HighlightColor,
} from '@/hooks/useBookAnnotations';

export type DisplayLang = 'en' | 'fa' | 'both';

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
  displayLang?: DisplayLang;
  /** Called whenever the cached analysis count changes. */
  onTranslationCountChange?: (n: number) => void;
  /** Source kind for auto-foldering Leitner cards (defaults to 'book'). */
  sourceKind?: import('@/types').LeitnerSourceKind;
  /** Title used as a Leitner sub-folder name (book/article title). */
  sourceTitle?: string;
}

interface Block {
  kind: 'h1' | 'h2' | 'h3' | 'p' | 'blockquote' | 'li' | 'hr' | 'img' | 'raw';
  text?: string;
  src?: string;
  alt?: string;
  key: string;
}

function htmlToBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body ?? doc.documentElement;
  const blocks: Block[] = [];
  let n = 0;

  const visit = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();

    switch (tag) {
      case 'h1':
      case 'h2':
      case 'h3':
        if (text) blocks.push({ kind: tag as Block['kind'], text, key: `b${n++}` });
        return;
      case 'h4':
      case 'h5':
      case 'h6':
        if (text) blocks.push({ kind: 'h3', text, key: `b${n++}` });
        return;
      case 'p':
        if (text) blocks.push({ kind: 'p', text, key: `b${n++}` });
        return;
      case 'blockquote':
        if (text) blocks.push({ kind: 'blockquote', text, key: `b${n++}` });
        return;
      case 'ul':
      case 'ol':
        el.querySelectorAll(':scope > li').forEach((li) => {
          const t = (li.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (t) blocks.push({ kind: 'li', text: t, key: `b${n++}` });
        });
        return;
      case 'hr':
        blocks.push({ kind: 'hr', key: `b${n++}` });
        return;
      case 'img': {
        const src = el.getAttribute('src') ?? '';
        const alt = el.getAttribute('alt') ?? '';
        if (src && /^(https?:|data:|blob:)/i.test(src)) {
          blocks.push({ kind: 'img', src, alt, key: `b${n++}` });
        }
        return;
      }
      case 'div':
      case 'section':
      case 'article':
      case 'main':
      case 'header':
      case 'footer':
        Array.from(el.children).forEach(visit);
        if (el.children.length === 0 && text) {
          blocks.push({ kind: 'p', text, key: `b${n++}` });
        }
        return;
      default:
        if (text && el.children.length === 0) {
          blocks.push({ kind: 'p', text, key: `b${n++}` });
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
      b.kind === 'p' &&
      b.text &&
      b.text.length < MIN_PARA_CHARS &&
      prev &&
      prev.kind === 'p' &&
      prev.text
    ) {
      // Don't merge if previous already ends a sentence AND fragment is itself a sentence.
      const prevEndsSentence = /[.!?…؟"'»)]\s*$/.test(prev.text);
      const fragIsSentence = /[.!?…؟"'»)]\s*$/.test(b.text) && b.text.length >= 30;
      if (!(prevEndsSentence && fragIsSentence)) {
        prev.text = `${prev.text.replace(/\s+$/, '')} ${b.text}`.trim();
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
    if ((b.kind === 'p' || b.kind === 'blockquote' || b.kind === 'li') && b.text) {
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

/**
 * Split a long block of prose into chunks of 1–2 sentences each.
 * Sentence boundary: . ! ? followed by whitespace + capital/quote, plus
 * Persian/Arabic punctuation. We greedily pack 1–2 sentences per chunk,
 * but also cap by character length so a single runaway sentence still gets
 * split on commas / semicolons.
 */
// splitIntoShortChunks now lives in @/lib/paragraphSplit (shared with the
// batch analyzer so cached translations match every rendered chunk).

export function InteractiveBookText({
  html,
  bookId,
  chapterIndex,
  fontSizeClass,
  fontFamilyClass,
  highlights = [],
  targetWords = [],
  displayLang = 'en',
  onTranslationCountChange,
  sourceKind,
  sourceTitle,
}: Props) {
  const blocks = useMemo(() => htmlToBlocks(html), [html]);

  // Group highlights by their text so a Paragraph can pick up matching ones.
  // (Paragraph also matches case-insensitively when rendering.)
  const highlightTexts = useMemo(
    () => highlights.map((h) => ({ text: h.text, color: highlightColor(h) })),
    [highlights],
  );

  const targetTexts = useMemo(
    () => targetWords.map((t) => t.trim()).filter((t) => t.length > 1),
    [targetWords],
  );

  // hash → analysis (only for paragraphs the user opened or that were cached).
  const [analyses, setAnalyses] = useState<Record<string, BookParagraphAnalysis>>({});
  // hash of paragraph whose analysis card is currently expanded.
  const [openHash, setOpenHash] = useState<string | null>(null);

  // Pre-warm: on mount/chapter-change, look up cached analyses for every
  // paragraph so idioms underline themselves without a click.
  useEffect(() => {
    let cancelled = false;
    setAnalyses({});
    setOpenHash(null);
    (async () => {
      const next: Record<string, BookParagraphAnalysis> = {};
      for (const b of blocks) {
        if (!b.text || (b.kind !== 'p' && b.kind !== 'blockquote' && b.kind !== 'li')) continue;
        const cached = await getCachedParagraphAnalysis(bookId, chapterIndex, b.text);
        if (cached) next[hashParagraph(b.text.trim())] = cached;
      }
      if (!cancelled) setAnalyses(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [blocks, bookId, chapterIndex]);

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
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeSpeechKey]);

  if (blocks.length === 0) {
    return (
      <p className="text-center text-muted-foreground text-sm py-12">
        — empty chapter —
      </p>
    );
  }

  const refFor = (i: number) => `book:${bookId}:${chapterIndex}:p${i}`;

  const textAlign = useSettingsStore((s) => s.settings.paragraphTextAlign) ?? 'start';
  const alignClass = textAlign === 'justify' ? 'text-justify' : textAlign === 'center' ? 'text-center' : 'text-start';
  return (
    <article
      className={cn('mx-auto w-full space-y-8 leading-loose', fontSizeClass, fontFamilyClass, alignClass)}
    >
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h1':
            return (
              <h1 key={b.key} className="text-3xl font-bold mt-8 mb-2 tracking-tight">
                <InteractiveSubtitle
                  text={b.text!}
                  context={b.text}
                  videoId={bookId}
                  cueId={refFor(i)}
                />
              </h1>
            );
          case 'h2':
            return (
              <h2 key={b.key} className="text-2xl font-semibold mt-6 mb-1 tracking-tight">
                <InteractiveSubtitle
                  text={b.text!}
                  context={b.text}
                  videoId={bookId}
                  cueId={refFor(i)}
                />
              </h2>
            );
          case 'h3':
            return (
              <h3 key={b.key} className="text-xl font-semibold mt-4 mb-1 tracking-tight">
                <InteractiveSubtitle
                  text={b.text!}
                  context={b.text}
                  videoId={bookId}
                  cueId={refFor(i)}
                />
              </h3>
            );
          case 'blockquote': {
            const hash = hashParagraph(b.text!.trim());
            const analysis = analyses[hash] ?? null;
            const isOpen = openHash === hash;
            const para = b.text!;
            const matched = highlightTexts.filter((h) =>
              para.toLowerCase().includes(h.text.toLowerCase()),
            );
            const matchedTargets = targetTexts.filter((t) =>
              para.toLowerCase().includes(t.toLowerCase()),
            );
            return (
              <Paragraph
                key={b.key}
                kind="blockquote"
                text={para}
                hash={hash}
                bookId={bookId}
                chapterIndex={chapterIndex}
                cueId={refFor(i)}
                analysis={analysis}
                isOpen={isOpen}
                onToggle={() => setOpenHash(isOpen ? null : hash)}
                onAnalyzed={(a) => setAnalyses((m) => ({ ...m, [hash]: a }))}
                onClose={() => setOpenHash(null)}
                highlights={matched}
                targets={matchedTargets}
                displayLang={displayLang}
                isActiveSpeech={activeSpeechKey != null && speechKeyFor(b.text!) === activeSpeechKey}
                activeRef={activeSpeechKey != null && speechKeyFor(b.text!) === activeSpeechKey ? activeRef : undefined}
                sourceKind={sourceKind}
                sourceTitle={sourceTitle}
              />
            );
          }
          case 'li': {
            const hash = hashParagraph(b.text!.trim());
            const analysis = analyses[hash] ?? null;
            const isOpen = openHash === hash;
            const para = b.text!;
            const matched = highlightTexts.filter((h) =>
              para.toLowerCase().includes(h.text.toLowerCase()),
            );
            const matchedTargets = targetTexts.filter((t) =>
              para.toLowerCase().includes(t.toLowerCase()),
            );
            return (
              <Paragraph
                key={b.key}
                kind="li"
                text={para}
                hash={hash}
                bookId={bookId}
                chapterIndex={chapterIndex}
                cueId={refFor(i)}
                analysis={analysis}
                isOpen={isOpen}
                onToggle={() => setOpenHash(isOpen ? null : hash)}
                onAnalyzed={(a) => setAnalyses((m) => ({ ...m, [hash]: a }))}
                onClose={() => setOpenHash(null)}
                highlights={matched}
                targets={matchedTargets}
                displayLang={displayLang}
                isActiveSpeech={activeSpeechKey != null && speechKeyFor(b.text!) === activeSpeechKey}
                activeRef={activeSpeechKey != null && speechKeyFor(b.text!) === activeSpeechKey ? activeRef : undefined}
                sourceKind={sourceKind}
                sourceTitle={sourceTitle}
              />
            );
          }
          case 'hr':
            return <hr key={b.key} className="my-8 border-border" />;
          case 'img':
            return (
              <img
                key={b.key}
                src={b.src}
                alt={b.alt ?? ''}
                loading="lazy"
                className="mx-auto max-h-[60vh] rounded-md border border-border"
              />
            );
          case 'p':
          default: {
            const hash = hashParagraph(b.text!.trim());
            const analysis = analyses[hash] ?? null;
            const isOpen = openHash === hash;
            const para = b.text!;
            const matched = highlightTexts.filter((h) =>
              para.toLowerCase().includes(h.text.toLowerCase()),
            );
            const matchedTargets = targetTexts.filter((t) =>
              para.toLowerCase().includes(t.toLowerCase()),
            );
            return (
              <Paragraph
                key={b.key}
                kind="p"
                text={para}
                hash={hash}
                bookId={bookId}
                chapterIndex={chapterIndex}
                cueId={refFor(i)}
                analysis={analysis}
                isOpen={isOpen}
                onToggle={() => setOpenHash(isOpen ? null : hash)}
                onAnalyzed={(a) => setAnalyses((m) => ({ ...m, [hash]: a }))}
                onClose={() => setOpenHash(null)}
                highlights={matched}
                targets={matchedTargets}
                displayLang={displayLang}
                isActiveSpeech={activeSpeechKey != null && speechKeyFor(b.text!) === activeSpeechKey}
                activeRef={activeSpeechKey != null && speechKeyFor(b.text!) === activeSpeechKey ? activeRef : undefined}
                sourceKind={sourceKind}
                sourceTitle={sourceTitle}
              />
            );
          }
        }
      })}
    </article>
  );
}

// ─── Paragraph wrapper with hover-reveal Analyze button + idiom underlining ──

interface ParagraphProps {
  kind: 'p' | 'blockquote' | 'li';
  text: string;
  hash: string;
  bookId: string;
  chapterIndex: number;
  cueId: string;
  analysis: BookParagraphAnalysis | null;
  isOpen: boolean;
  onToggle: () => void;
  onAnalyzed: (a: BookParagraphAnalysis) => void;
  onClose: () => void;
  /** All chapter highlights — Paragraph picks up substring matches itself. */
  highlights: { text: string; color: HighlightColor }[];
  /** Optional: language-book target items present in this paragraph. */
  targets?: string[];
  displayLang?: DisplayLang;
  isActiveSpeech?: boolean;
  activeRef?: React.MutableRefObject<HTMLDivElement | null>;
  sourceKind?: import('@/types').LeitnerSourceKind;
  sourceTitle?: string;
}

function Paragraph({
  kind,
  text,
  hash,
  bookId,
  chapterIndex,
  cueId,
  analysis,
  isOpen,
  onToggle,
  onAnalyzed,
  onClose,
  highlights,
  targets = [],
  displayLang = 'en',
  isActiveSpeech = false,
  activeRef,
  sourceKind,
  sourceTitle,
}: ParagraphProps) {
  // Per-paragraph display mode (overrides the global one when set).
  // 'none'     → only English
  // 'fa'       → English + Persian translation only
  // 'analysis' → English + Persian + vocab/idiom card (translation NOT repeated)
  const [localMode, setLocalMode] = useState<'none' | 'fa' | 'analysis'>('none');
  const [localLoading, setLocalLoading] = useState(false);

  // Build the annotation list: highlights win over targets/phrases when they
  // overlap. Targets are stronger than AI idioms (the user explicitly chose
  // them), so we sort them first within the "phrase" group.
  // IMPORTANT: idiom/vocab underlines only appear when the user explicitly
  // toggles "ترجمه + پردازش" on this paragraph (i.e. localMode === 'analysis').
  // Even when a cached analysis exists, the source text stays clean otherwise.
  const idiomPhrases = (localMode === 'analysis' ? analysis?.idioms ?? [] : [])
    .map((i) => i.phrase.trim())
    .filter((p) => p.length > 1);
  const vocabWords = (localMode === 'analysis' ? analysis?.vocabulary ?? [] : [])
    .map((v) => v.word.trim())
    .filter((w) => w.length > 1);
  const targetPhrases = targets.filter((t) => t.length > 1);

  const annotations = useMemo<Annotation[]>(
    () => [
      ...highlights.map((h) => ({
        text: h.text,
        kind: 'highlight' as const,
        color: h.color,
      })),
      ...targetPhrases.map((p) => ({ text: p, kind: 'target' as const })),
      ...idiomPhrases.map((p) => ({ text: p, kind: 'idiom' as const })),
      ...vocabWords.map((p) => ({ text: p, kind: 'idiom' as const })),
    ],
    [highlights, targetPhrases.join('|'), idiomPhrases.join('|'), vocabWords.join('|')],
  );

  const segments = useMemo(
    () => splitByAnnotations(text, annotations),
    [text, annotations],
  );

  const inner = (
    <span className="block">
      {segments.map((seg, i) => {
        if (seg.kind === 'highlight') {
          return (
            <mark
              key={i}
              data-highlight-color={seg.color}
              className={cn(
                'rounded px-0.5 transition-colors',
                HIGHLIGHT_CLASSES[seg.color],
              )}
            >
              <InteractiveSubtitle
                text={seg.text}
                context={text}
                videoId={bookId}
                cueId={cueId}
              />
            </mark>
          );
        }
        if (seg.kind === 'idiom' || seg.kind === 'target') {
          const isTarget = seg.kind === 'target';
          return (
            <span
              key={i}
              className={cn(
                'rounded px-0.5',
                isTarget
                  ? 'lang-target font-medium'
                  : 'underline decoration-primary/60 decoration-2 underline-offset-4',
              )}
              title={isTarget ? 'Target item — tap to study' : 'Idiom / phrase — see analysis below'}
            >
              <InteractiveSubtitle
                text={seg.text}
                context={text}
                videoId={bookId}
                cueId={cueId}
              />
            </span>
          );
        }
        return (
          <InteractiveSubtitle
            key={i}
            text={seg.text}
            context={text}
            videoId={bookId}
            cueId={cueId}
          />
        );
      })}
    </span>
  );

  const Wrapper: React.ElementType =
    kind === 'blockquote' ? 'blockquote' : kind === 'li' ? 'div' : 'p';

  const wrapperClass =
    kind === 'blockquote'
      ? 'border-l-4 border-primary/40 pl-4 italic text-muted-foreground'
      : kind === 'li'
        ? 'flex gap-2 pl-2 text-foreground/90'
        : 'text-foreground/90';

  const fa = analysis?.translation?.trim() ?? '';

  // Per-paragraph display mode (overrides the global one when set).
  // localMode + localLoading are declared at the top of this component.
  const settings = useSettingsStore((s) => s.settings);
  const online = useOnline();
  const modelRef = coerceBookModel(
    settings.bookSingleAnalysisModelRef ?? settings.bookSingleAnalysisModel,
  );

  // If global displayLang asks for fa/both and we have a translation, force-show it.
  const globalShowFa = !!fa && (displayLang === 'fa' || displayLang === 'both');
  const showFa = globalShowFa || localMode === 'fa' || localMode === 'analysis';
  const showEn = displayLang !== 'fa' || !showFa;
  const showAnalysisCard = localMode === 'analysis';

  // Run analyzer if needed (used by both "ترجمه" and "ترجمه + پردازش" buttons).
  const ensureAnalysis = async (): Promise<boolean> => {
    if (analysis) return true;
    if (!online) {
      toast.error('برای ترجمه نیاز به اینترنت است.');
      return false;
    }
    setLocalLoading(true);
    try {
      const result = await analyzeParagraphRouted(bookId, chapterIndex, text, { modelRef });
      onAnalyzed(result);
      return true;
    } catch {
      toast.error('ترجمه با خطا مواجه شد.');
      return false;
    } finally {
      setLocalLoading(false);
    }
  };

  const handleFaOnly = async () => {
    if (localMode === 'fa') { setLocalMode('none'); return; }
    if (!analysis) { const ok = await ensureAnalysis(); if (!ok) return; }
    setLocalMode('fa');
  };

  const handleAnalysis = async () => {
    if (localMode === 'analysis') { setLocalMode('none'); return; }
    if (!analysis) { const ok = await ensureAnalysis(); if (!ok) return; }
    setLocalMode('analysis');
  };

  const gesturesEnabled = !!settings.paragraphGestures;
  const [starred, setStarred] = useState<boolean>(() => {
    try { return localStorage.getItem(`para-star:${hash}`) === '1'; } catch { return false; }
  });
  const toggleStar = () => {
    setStarred((v) => {
      const n = !v;
      try { n ? localStorage.setItem(`para-star:${hash}`, '1') : localStorage.removeItem(`para-star:${hash}`); } catch { /* ignore */ }
      toast.success(n ? 'ستاره‌دار شد' : 'ستاره برداشته شد');
      return n;
    });
  };
  const copyText = async () => {
    try {
      const out = showFa && fa ? `${text}\n\n${fa}` : text;
      await navigator.clipboard.writeText(out);
      toast.success('متن کپی شد');
    } catch { toast.error('کپی نشد'); }
  };

  const handleDoubleTap = (target: HTMLElement) => {
    // Decide language by the nearest dir attribute / lang class.
    const isFaTarget = target.closest('[lang="fa"], [dir="rtl"]');
    if (isFaTarget && fa) { speakText(fa, 'fa'); return; }
    speakText(text, 'en');
  };

  const gestureHandlers = useParagraphGestures({
    enabled: gesturesEnabled,
    onSwipeRight: () => { void handleFaOnly(); },
    onSwipeLeft: () => { void handleAnalysis(); },
    onDoubleTap: handleDoubleTap,
    onLongPress: () => { void copyText(); toggleStar(); },
  });

  return (
    <div
      ref={activeRef}
      {...gestureHandlers}
      className={cn(
        'group relative rounded-lg transition-colors',
        gesturesEnabled && 'touch-pan-y select-none cursor-pointer',
        starred && 'ring-1 ring-amber-400/50 bg-amber-400/[0.04]',
        isActiveSpeech && 'ring-2 ring-primary/60 bg-primary/5 px-2 py-1.5 -mx-2',
      )}
    >
      {showEn && (
        <Wrapper className={wrapperClass}>
          {kind === 'li' && <span className="text-muted-foreground select-none">•</span>}
          <span className={cn(kind === 'li' && 'flex-1')}>{inner}</span>
        </Wrapper>
      )}

      {showFa && fa && (
        <p
          dir="rtl"
          lang="fa"
          className={cn(
            'mt-2.5 leading-[2] text-[1.02em] text-foreground rounded-md',
            'border-r-2 border-primary/40 pr-3 bg-primary/[0.04] py-2',
          )}
          style={{ fontFamily: '"Vazirmatn","IRANSans","Tahoma",sans-serif', fontWeight: 500 }}
        >
          {fa}
        </p>
      )}

      {/* Per-paragraph toolbar: 4 buttons. */}
      <div className="mt-2 flex flex-wrap items-center gap-1 not-prose">
        <ParagraphTTSButton text={text} lang="en" />
        <ParagraphTTSButton text={fa || text} lang="fa" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleFaOnly}
          disabled={localLoading}
          className={cn(
            'h-7 px-2 gap-1.5 text-[11px]',
            localMode === 'fa'
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-primary',
          )}
          title="فقط ترجمه فارسی"
          aria-label="فقط ترجمه فارسی"
          aria-pressed={localMode === 'fa'}
        >
          {localLoading && localMode !== 'analysis' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Languages className="h-3.5 w-3.5" />
          )}
          <span>ترجمه</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleAnalysis}
          disabled={localLoading}
          className={cn(
            'h-7 px-2 gap-1.5 text-[11px]',
            localMode === 'analysis'
              ? 'text-primary bg-primary/10'
              : analysis
                ? 'text-primary'
                : 'text-muted-foreground hover:text-primary',
          )}
          title="ترجمه + پردازش لغت‌ها و عبارت‌ها"
          aria-label="ترجمه و پردازش"
          aria-pressed={localMode === 'analysis'}
        >
          {localLoading && localMode !== 'fa' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          <span>ترجمه + پردازش</span>
        </Button>
      </div>

      {showAnalysisCard && (
        <ParagraphAnalysisCard
          bookId={bookId}
          chapterIndex={chapterIndex}
          paragraph={text}
          initial={analysis}
          onAnalyzed={onAnalyzed}
          onClose={() => setLocalMode('none')}
          sourceKind={sourceKind}
          sourceTitle={sourceTitle}
          hideTranslation
        />
      )}
    </div>
  );
}

// ───────────────────────── helpers ──

export type Annotation =
  | { text: string; kind: 'highlight'; color: HighlightColor }
  | { text: string; kind: 'idiom' }
  | { text: string; kind: 'target' };

type Segment =
  | { text: string; kind: 'plain' }
  | { text: string; kind: 'highlight'; color: HighlightColor }
  | { text: string; kind: 'idiom' }
  | { text: string; kind: 'target' };

/**
 * Split a paragraph into non-overlapping runs annotated by either a highlight
 * (with colour), a target item, or an idiom phrase. When two annotations
 * overlap the longer one wins; for equal lengths, highlights > targets > idioms.
 */
function splitByAnnotations(text: string, annotations: Annotation[]): Segment[] {
  if (annotations.length === 0) return [{ text, kind: 'plain' }];

  const lower = text.toLowerCase();
  type Match = { start: number; end: number; ann: Annotation };
  const matches: Match[] = [];

  for (const ann of annotations) {
    const needle = ann.text.toLowerCase();
    if (!needle) continue;
    let from = 0;
    while (from <= lower.length - needle.length) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1) break;
      matches.push({ start: idx, end: idx + needle.length, ann });
      from = idx + needle.length;
    }
  }

  if (matches.length === 0) return [{ text, kind: 'plain' }];

  const priority = (k: Annotation['kind']) =>
    k === 'highlight' ? 0 : k === 'target' ? 1 : 2;

  matches.sort((a, b) => {
    const lenDiff = b.end - b.start - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    const pDiff = priority(a.ann.kind) - priority(b.ann.kind);
    if (pDiff !== 0) return pDiff;
    return a.start - b.start;
  });

  const taken: Match[] = [];
  for (const m of matches) {
    if (taken.some((t) => m.start < t.end && m.end > t.start)) continue;
    taken.push(m);
  }
  taken.sort((a, b) => a.start - b.start);

  const out: Segment[] = [];
  let cursor = 0;
  for (const m of taken) {
    if (m.start > cursor) out.push({ text: text.slice(cursor, m.start), kind: 'plain' });
    const slice = text.slice(m.start, m.end);
    if (m.ann.kind === 'highlight') {
      out.push({ text: slice, kind: 'highlight', color: m.ann.color });
    } else if (m.ann.kind === 'target') {
      out.push({ text: slice, kind: 'target' });
    } else {
      out.push({ text: slice, kind: 'idiom' });
    }
    cursor = m.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), kind: 'plain' });
  return out;
}

