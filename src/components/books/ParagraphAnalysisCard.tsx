/**
 * Inline analysis card shown beneath a paragraph in the book reader.
 *
 * - Persian paragraph translation (top, primary color)
 * - Vocabulary list (one-click → Leitner)
 * - Idioms / phrasal verbs (one-click → Leitner)
 *
 * Cached results render instantly; "Re-analyze" forces a fresh AI call.
 */
import { useState } from 'react';
import { Loader2, Plus, Check, RefreshCw, X, Languages, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLeitnerStore } from '@/store/leitnerStore';
import { bookAnalysisErrorMessage } from '@/lib/bookAnalysis';
import { analyzeParagraphRouted } from '@/lib/bookAiRouter';
import { coerceBookModel } from '@/lib/aiModels';
import type { BookParagraphAnalysis, BookAIModelRef } from '@/types';
import { toast } from 'sonner';
import { useOnline } from '@/hooks/useOnline';
import { useSettingsStore } from '@/store/settingsStore';
import { cn } from '@/lib/utils';
import { ensureAutoFolder } from '@/lib/leitnerAutoFolder';
import type { LeitnerSourceKind } from '@/types';

interface Props {
  bookId: string;
  chapterIndex: number;
  paragraph: string;
  initial: BookParagraphAnalysis | null;
  onAnalyzed: (a: BookParagraphAnalysis) => void;
  onClose: () => void;
  /** Source kind for auto-foldering (defaults to 'book'). */
  sourceKind?: LeitnerSourceKind;
  /** Title used as sub-folder name (book/article title). */
  sourceTitle?: string;
  /** When true, do NOT render the Persian translation — caller already shows it. */
  hideTranslation?: boolean;
}

export function ParagraphAnalysisCard({
  bookId,
  chapterIndex,
  paragraph,
  initial,
  onAnalyzed,
  onClose,
  sourceKind = 'book',
  sourceTitle,
  hideTranslation = false,
}: Props) {
  const [analysis, setAnalysis] = useState<BookParagraphAnalysis | null>(initial);
  const [loading, setLoading] = useState(!initial);
  const [collapsed, setCollapsed] = useState(false);
  const online = useOnline();
  const settings = useSettingsStore((s) => s.settings);
  const modelRef = coerceBookModel(
    settings.bookSingleAnalysisModelRef ?? settings.bookSingleAnalysisModel,
  );

  const addCard = useLeitnerStore((s) => s.addCard);
  const findByFront = useLeitnerStore((s) => s.findByFront);
  const cards = useLeitnerStore((s) => s.cards);
  void cards;

  const run = async (force = false, refOverride?: BookAIModelRef) => {
    if (!online) {
      toast.error('Analysis requires an internet connection.');
      return;
    }
    setLoading(true);
    try {
      const result = await analyzeParagraphRouted(bookId, chapterIndex, paragraph, {
        force,
        modelRef: refOverride ?? modelRef,
      });
      setAnalysis(result);
      onAnalyzed(result);
    } catch (e) {
      toast.error(bookAnalysisErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  // Auto-run on first mount when there's no cached analysis.
  useStartOnce(() => {
    if (!initial) void run(false);
  });

  const sourceRef = `book:${bookId}:${chapterIndex}`;

  const handleAdd = async (front: string, back: string, kind: 'word' | 'idiom') => {
    const folderId = await ensureAutoFolder({
      kind: sourceKind,
      sourceRef: bookId,
      sourceTitle,
    });
    const result = await addCard({
      front, back,
      sourceVideoId: bookId,
      sourceCueId: sourceRef,
      folderId,
      sourceKind,
      sourceTitle,
      exampleSentence: paragraph,
    });
    if (result === 'duplicate') {
      toast(`Already in Leitner: ${front}`);
    } else {
      toast.success(`Added ${kind}: ${front}`);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/[0.04] p-4 space-y-3 not-prose">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand analysis' : 'Collapse analysis'}
        >
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" />
          )}
          <Languages className="h-3.5 w-3.5 text-primary" />
          <span>Paragraph analysis</span>
          {analysis && (
            <span className="text-[10px] opacity-70">· {analysis.model}</span>
          )}
        </button>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => run(true)}
            disabled={loading}
            title="Re-analyze"
            aria-label="Re-analyze"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={onClose}
            title="Close"
            aria-label="Close analysis"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className={cn(collapsed && 'hidden', 'space-y-3')}>
      {/* Model is configured globally in Settings → Books → Single paragraph analysis. */}

      {loading && !analysis && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing paragraph…
        </p>
      )}

      {!hideTranslation && analysis?.translation && (
        <p
          dir="auto"
          className="text-base leading-relaxed text-primary font-medium border-l-2 border-primary/40 pl-3"
        >
          {analysis.translation}
        </p>
      )}

      {analysis && analysis.vocabulary.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Vocabulary
          </h4>
          <ul className="space-y-1">
            {analysis.vocabulary.map((v, i) => {
              const added = !!findByFront(v.word);
              return (
                <li key={`v-${i}`} className="flex items-start gap-2 text-sm">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    title={added ? 'Already in Leitner' : 'Add to Leitner'}
                    onClick={() => handleAdd(v.word, v.translation, 'word')}
                    disabled={added}
                  >
                    {added ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <span className="font-medium">{v.word}</span>
                  {v.partOfSpeech && (
                    <span className="text-xs text-muted-foreground">({v.partOfSpeech})</span>
                  )}
                  <span className="text-muted-foreground">—</span>
                  <span dir="auto" className="text-primary">
                    {v.translation}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {analysis && analysis.idioms.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Idioms / Phrases
          </h4>
          <ul className="space-y-1">
            {analysis.idioms.map((it, idx) => {
              const added = !!findByFront(it.phrase);
              return (
                <li key={`i-${idx}`} className="flex items-start gap-2 text-sm">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    title={added ? 'Already in Leitner' : 'Add to Leitner'}
                    onClick={() => handleAdd(it.phrase, it.meaning, 'idiom')}
                    disabled={added}
                  >
                    {added ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <span className="font-medium">{it.phrase}</span>
                  <span className="text-muted-foreground">—</span>
                  <span dir="auto" className="text-primary">
                    {it.meaning}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {analysis &&
        analysis.vocabulary.length === 0 &&
        analysis.idioms.length === 0 &&
        !loading && (
          <p className="text-xs text-muted-foreground">
            No notable vocabulary or idioms in this paragraph.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── tiny helper: run a callback exactly once after mount ──
import { useEffect, useRef } from 'react';
function useStartOnce(fn: () => void) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
