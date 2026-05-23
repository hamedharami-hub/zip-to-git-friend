/**
 * Chapter Rewrite tabs.
 *
 * Lets the user generate AI rewrites of the current chapter in multiple
 * styles (short summary, detailed summary, key points, simplified, key
 * quotes, review questions). Each style is cached per (book, chapter) and
 * displayed via the same `InteractiveBookText` renderer as the original
 * chapter — so word lookup, paragraph analysis, paragraph TTS, Leitner
 * export and highlights all work on the rewrite too.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSettingsStore } from '@/store/settingsStore';
import { useOnline } from '@/hooks/useOnline';
import {
  REWRITE_STYLES,
  rewriteErrorMessage,
} from '@/lib/chapterRewrite';
import { rewriteChapterRouted } from '@/lib/bookAiRouter';
import { coerceBookModel } from '@/lib/aiModels';
import {
  deleteChapterRewrite,
  getRewritesForChapter,
} from '@/lib/bookDb';
import { InteractiveBookText } from '@/components/books/InteractiveBookText';
import type {
  BookChapterRewrite,
  RewriteStyle,
} from '@/types';

interface Props {
  bookId: string;
  chapterIndex: number;
  chapterTitle: string;
  chapterText: string;
  fontSizeClass: string;
  fontFamilyClass: string;
  /** Called when the user flips the top toggle. The parent shows / hides
   *  the original chapter content above this section accordingly. */
  onToggleView?: (view: 'original' | 'rewrite') => void;
  /** Controlled view: when provided the parent owns the toggle and the
   *  internal sticky bar is hidden (parent renders its own). */
  view?: 'original' | 'rewrite';
  /** Called whenever any rewrite is loaded/generated/deleted so the parent
   *  can show its own sticky toggle once at least one rewrite exists. */
  onHasRewriteChange?: (hasAnyRewrite: boolean) => void;
}

export function ChapterRewriteTabs({
  bookId,
  chapterIndex,
  chapterTitle,
  chapterText,
  fontSizeClass,
  fontFamilyClass,
  onToggleView,
  view: viewProp,
  onHasRewriteChange,
}: Props) {
  const online = useOnline();
  const settings = useSettingsStore((s) => s.settings);
  const modelRef = coerceBookModel(
    settings.bookRewriteModelRef ?? settings.bookRewriteModel,
  );
  const modelLabel =
    modelRef.provider === 'gateway' ? modelRef.model : `${modelRef.provider}: ${modelRef.model}`;

  /** Top-level toggle: show original chapter or the active rewrite. */
  const [internalView, setInternalView] = useState<'original' | 'rewrite'>('rewrite');
  const view = viewProp ?? internalView;
  const isControlled = viewProp !== undefined;

  const setViewAndNotify = (v: 'original' | 'rewrite') => {
    if (!isControlled) setInternalView(v);
    onToggleView?.(v);
  };

  const [activeStyle, setActiveStyle] = useState<RewriteStyle>(
    REWRITE_STYLES[0].id,
  );
  const [rewrites, setRewrites] = useState<Record<RewriteStyle, BookChapterRewrite | undefined>>(
    {} as Record<RewriteStyle, BookChapterRewrite | undefined>,
  );
  const [loadingStyle, setLoadingStyle] = useState<RewriteStyle | null>(null);

  // Pre-warm: load any cached rewrites for this chapter on mount/change.
  useEffect(() => {
    let cancelled = false;
    setRewrites({} as Record<RewriteStyle, BookChapterRewrite | undefined>);
    (async () => {
      const rows = await getRewritesForChapter(bookId, chapterIndex);
      if (cancelled) return;
      const map = {} as Record<RewriteStyle, BookChapterRewrite | undefined>;
      for (const r of rows) map[r.style] = r;
      setRewrites(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, chapterIndex]);

  const handleGenerate = async (style: RewriteStyle, force = false) => {
    if (!online) {
      toast.error('Rewrite needs an internet connection.');
      return;
    }
    if (!chapterText.trim()) {
      toast.error('This chapter has no text.');
      return;
    }
    setLoadingStyle(style);
    try {
      const rec = await rewriteChapterRouted(
        bookId,
        chapterIndex,
        chapterTitle,
        chapterText,
        style,
        { force, modelRef },
      );
      setRewrites((m) => ({ ...m, [style]: rec }));
      setViewAndNotify('rewrite');
      toast.success(force ? 'Rewrite regenerated.' : 'Rewrite ready.');
    } catch (e) {
      toast.error(rewriteErrorMessage(e));
    } finally {
      setLoadingStyle(null);
    }
  };

  const handleDelete = async (style: RewriteStyle) => {
    await deleteChapterRewrite(bookId, chapterIndex, style);
    setRewrites((m) => ({ ...m, [style]: undefined }));
    toast.success('Rewrite deleted.');
  };

  const styles = REWRITE_STYLES;
  const hasAnyRewrite = useMemo(
    () => Object.values(rewrites).some((r) => !!r),
    [rewrites],
  );

  // Notify parent so it can render its own sticky toggle.
  useEffect(() => {
    onHasRewriteChange?.(hasAnyRewrite);
  }, [hasAnyRewrite, onHasRewriteChange]);

  return (
    <section id="chapter-rewrite" className="mt-12 pt-8 border-t border-border/50 not-prose scroll-mt-24">
      <header className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold">Rewrite this chapter</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          AI: {modelLabel} · change in Settings → Books
        </span>
      </header>

      {/* Top toggle: Original vs Rewrite — only meaningful once at least
          one rewrite exists for the current chapter.
          When parent owns the toggle (controlled), hide the internal one. */}
      {hasAnyRewrite && !isControlled && (
        <div
          role="tablist"
          aria-label="Original or rewritten chapter"
          className="mb-4 inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === 'original'}
            onClick={() => setViewAndNotify('original')}
            className={
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors ' +
              (view === 'original'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            Original
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'rewrite'}
            onClick={() => setViewAndNotify('rewrite')}
            className={
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors ' +
              (view === 'rewrite'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            Rewrite
          </button>
        </div>
      )}

      <div className={view === 'original' ? 'hidden' : ''}>

      <Tabs value={activeStyle} onValueChange={(v) => setActiveStyle(v as RewriteStyle)}>
        <TabsList className="h-auto flex-wrap gap-1 bg-muted/50 p-1">
          {styles.map((s) => {
            const has = !!rewrites[s.id];
            return (
              <TabsTrigger
                key={s.id}
                value={s.id}
                className="text-xs h-8 data-[state=active]:bg-background"
              >
                {s.label}
                {has && <span className="ml-1.5 text-primary">●</span>}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {styles.map((s) => {
          const rewrite = rewrites[s.id];
          const isLoading = loadingStyle === s.id;
          return (
            <TabsContent key={s.id} value={s.id} className="mt-4">
              <div className="rounded-lg border border-border bg-card/40 p-4 sm:p-6">
                <p className="text-xs text-muted-foreground mb-3">{s.description}</p>

                {!rewrite ? (
                  <div className="py-8 text-center space-y-3">
                    <p className="text-sm text-muted-foreground">
                      No {s.label.toLowerCase()} yet.
                    </p>
                    <Button
                      onClick={() => handleGenerate(s.id, false)}
                      disabled={isLoading || !online}
                      size="sm"
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      {isLoading ? 'Generating…' : `Generate ${s.label.toLowerCase()}`}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-4 pb-3 border-b border-border/50">
                      <div className="text-[11px] text-muted-foreground">
                        {rewrite.wordCount.toLocaleString()} words ·{' '}
                        <span className="opacity-70">{rewrite.model}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleGenerate(s.id, true)}
                          disabled={isLoading || !online}
                          title="Regenerate"
                        >
                          {isLoading ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          )}
                          Regenerate
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(s.id)}
                          disabled={isLoading}
                          title="Delete"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>

                    {/* Reuse the same interactive renderer used for the original
                        chapter — the user gets word lookup, paragraph analysis,
                        per-paragraph TTS, highlights and Leitner export here too. */}
                    <InteractiveBookText
                      html={rewrite.html}
                      bookId={bookId}
                      chapterIndex={chapterIndex}
                      fontSizeClass={fontSizeClass}
                      fontFamilyClass={fontFamilyClass}
                    />
                  </>
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
      </div>

      <p className="text-[11px] text-muted-foreground mt-3" dir="auto">
        نکته: همه بازنویسی‌ها در همین مرورگر ذخیره می‌شوند. هر سبک یک‌بار ساخته می‌شود و دفعات بعد بلافاصله از حافظه باز می‌شود.
      </p>
    </section>
  );
}
