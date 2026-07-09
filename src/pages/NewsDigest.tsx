import { useCallback, useEffect, useRef, useState } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Newspaper, Sparkles, Trash2, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/EmptyState';
import { InteractiveBookText, type DisplayLang } from '@/components/books/InteractiveBookText';
import { ChapterTTSPlayer } from '@/components/books/ChapterTTSPlayer';
import { ReaderTTSQuickSettings } from '@/components/books/ReaderTTSQuickSettings';
import { LangCycleButton } from '@/components/news/LangCycleButton';
import { NewsTypographyMenu } from '@/components/news/NewsTypographyMenu';
import { NewsTocMenu } from '@/components/news/NewsTocMenu';
import { NewsShareMenu } from '@/components/news/NewsShareMenu';
import { batchAnalyzeChapter, extractAnalysableParagraphs } from '@/lib/batchAnalyzeChapter';
import { getCachedParagraphAnalysis } from '@/lib/bookAnalysis';
import { emitChapterAnalyses } from '@/lib/chapterAnalysisBus';
import { useSettingsStore } from '@/store/settingsStore';
import { coerceBookModel } from '@/lib/aiModels';
import { usePinchFontStep } from '@/hooks/usePinchZoom';
import type { BookChapter } from '@/types';
import { deleteDigest, getDigestById, type NewsDigest } from '@/lib/news';
import { toast } from 'sonner';
import { loadNewsDisplayLang, saveNewsDisplayLang } from '@/lib/newsDisplayLang';


const NewsDigestReader = () => {
  const { digestId } = useParams<{ digestId: string }>();
  const navigate = useNavigate();
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/news');
  };
  const [digest, setDigest] = useState<NewsDigest | null>(null);
  const [loading, setLoading] = useState(true);
  usePageMeta({
    title: digest?.title ? `${digest.title} — خلاصه` : 'خلاصه‌ی هوش مصنوعی — Lingua',
    description: digest?.title || 'خلاصه‌ی خبری چندمنبعی با ترجمه و خواندن صوتی.',
    ogType: 'article',
  });
  const [displayLang, setDisplayLang] = useState<DisplayLang>(() => loadNewsDisplayLang());
  const [translationCount, setTranslationCount] = useState(0);
  const [faTtsText, setFaTtsText] = useState<string>('');
  const [trProgress, setTrProgress] = useState<{ done: number; total: number; failed: number; running: boolean }>(
    { done: 0, total: 0, failed: 0, running: false },
  );
  const [typo, setTypo] = useState<{ sizeClass: string; familyClass: string; familyStyle?: React.CSSProperties }>(
    { sizeClass: 'text-base', familyClass: 'font-sans' },
  );
  const handleTypoChange = useCallback(
    (v: { sizeClass: string; familyClass: string; familyStyle?: React.CSSProperties }) => setTypo(v),
    [],
  );
  const pinchScrollRef = useRef<HTMLDivElement | null>(null);
  usePinchFontStep(pinchScrollRef);

  useEffect(() => { saveNewsDisplayLang(displayLang); }, [displayLang]);

  const settings = useSettingsStore((s) => s.settings);
  const newsModelRef = coerceBookModel(
    settings.newsRewriteModelRef ?? settings.bookRewriteModelRef ?? 'google/gemini-3-flash-preview',
  );

  useEffect(() => {
    if (!digestId) return;
    void (async () => {
      try {
        const d = await getDigestById(digestId);
        setDigest(d);
        if (d) document.title = `${d.title} — Digest`;
      } catch (e: any) {
        toast.error(e.message ?? 'Failed to load digest.');
      } finally {
        setLoading(false);
      }
    })();
  }, [digestId]);

  // Auto-translate paragraphs (cache-aware) and assemble FA TTS script.
  // Re-runs when the digest html changes; safe to call repeatedly because
  // batchAnalyzeChapter skips paragraphs that already have a cached analysis.
  const runTranslate = useCallback(async (signal?: AbortSignal) => {
    if (!digest?.contentHtml) return;
    const bookId = `digest-${digest.id}`;
    const chapter: BookChapter = {
      id: `${bookId}:0`,
      bookId,
      index: 0,
      title: digest.title,
      html: digest.contentHtml,
      text: '',
      wordCount: 0,
    };
    const items = extractAnalysableParagraphs(chapter);
    console.log('[NewsDigest] translate start', { bookId, paragraphs: items.length, model: newsModelRef });
    setTrProgress({ done: 0, total: items.length, failed: 0, running: items.length > 0 });

    const buildFaText = async () => {
      const out: string[] = [];
      for (const it of items) {
        const cached = await getCachedParagraphAnalysis(bookId, 0, it.text);
        const fa = cached?.translation?.trim();
        if (fa) out.push(fa);
      }
      if (!signal?.aborted) setFaTtsText(out.join('\n\n'));
    };

    try {
      const final = await batchAnalyzeChapter(bookId, chapter, {
        concurrency: 5,
        signal,
        modelRef: newsModelRef,
        onProgress: (snap) => {
          emitChapterAnalyses(bookId, 0, snap.results);
          if (!signal?.aborted) {
            setTrProgress({ done: snap.completed, total: snap.total, failed: snap.failed, running: !snap.done });
          }
        },
      });
      if (signal?.aborted) return;
      emitChapterAnalyses(bookId, 0, final.results);
      setTrProgress({ done: final.completed, total: final.total, failed: final.failed, running: false });
      if (final.failed > 0 && final.lastError) {
        toast.error(`ترجمه برخی پاراگراف‌ها ناموفق بود: ${final.lastError}`);
      }
      await buildFaText();
      console.log('[NewsDigest] translate done', { completed: final.completed, failed: final.failed, total: final.total });
    } catch (e: any) {
      console.error('[NewsDigest] translate error', e);
      toast.error(`ترجمه با خطا مواجه شد: ${e?.message ?? 'unknown'}`);
      setTrProgress((p) => ({ ...p, running: false }));
      await buildFaText();
    }
  }, [digest?.id, digest?.contentHtml, digest?.title, newsModelRef]);

  useEffect(() => {
    if (!digest?.contentHtml) return;
    const controller = new AbortController();
    void runTranslate(controller.signal);
    return () => controller.abort();
  }, [digest?.id, digest?.contentHtml, runTranslate]);

  const handleDelete = async () => {
    if (!digest) return;
    if (!confirm('این خلاصه حذف بشه؟')) return;
    try {
      await deleteDigest(digest.id);
      toast.success('حذف شد.');
      navigate('/news');
    } catch (e: any) {
      toast.error(e.message ?? 'Delete failed.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!digest) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border">
          <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-2">
            <Link to="/news"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
            <h1 className="text-lg font-semibold">Digest</h1>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-6 py-10">
          <EmptyState icon={<Newspaper className="h-7 w-7" />} title="خلاصه پیدا نشد" />
        </main>
      </div>
    );
  }

  // Plain text for TTS — strip markdown/html and preserve block breaks.
  const ttsText = (digest.contentMd ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^[ \t]*[#>*_`~-]+[ \t]*/gm, '')
    .replace(/[`*_~]+/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const bookId = `digest-${digest.id}`;
  const lengthLabel =
    digest.length === 'max' ? 'خلاصه حداکثری'
    : digest.length === 'long' ? 'خلاصه بلند'
    : digest.length === 'auto-max' ? 'نسخه کامل ساده'
    : digest.length === 'simple' ? 'ساده روزمره'
    : 'خلاصه کوتاه';

  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground">
      <header
        className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-center gap-0.5 px-2 py-1 overflow-x-auto">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1" />
          <LangCycleButton
            value={displayLang}
            onChange={setDisplayLang}
            hasAnyTranslation={translationCount > 0}
          />
          <NewsTypographyMenu onChange={handleTypoChange} />
          <ReaderTTSQuickSettings faAvailable={!!faTtsText} />
          <NewsTocMenu html={digest.contentHtml} />
          <NewsShareMenu
            bookId={bookId}
            chapterIndex={0}
            title={digest.title}
            contentHtml={digest.contentHtml}
            contentMd={digest.contentMd}
            url={''}
            siteName={'AI Digest'}
            aiModel={digest.model ?? undefined}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="منو">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => void runTranslate()}
                disabled={trProgress.running}
              >
                <Sparkles className="h-4 w-4 me-2" />
                {trProgress.running
                  ? `ترجمه ${trProgress.done}/${trProgress.total}…`
                  : trProgress.total > 0
                    ? 'ترجمه دوباره پاراگراف‌ها'
                    : 'ترجمه پاراگراف‌ها'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 me-2" /> حذف خلاصه
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {trProgress.running && trProgress.total > 0 && (
          <div className="px-3 pb-1 text-[11px] text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>در حال ترجمه پاراگراف‌ها… {trProgress.done}/{trProgress.total}</span>
          </div>
        )}
      </header>

      {ttsText && (
        <ChapterTTSPlayer
          bookId={bookId}
          chapterIndex={0}
          chapterTitle={digest.title}
          text={ttsText}
          textFa={faTtsText || undefined}
        />
      )}

      <div className="flex-1 overflow-y-auto overscroll-contain" ref={pinchScrollRef} style={{ touchAction: 'pan-y' }}>
        <main className="max-w-4xl mx-auto px-5 sm:px-10 py-8 sm:py-12" style={{ lineHeight: 1.6, ...(typo.familyStyle ?? {}) }}>
          <header className="mb-6 pb-6 border-b border-border/50">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>AI digest · {lengthLabel}</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{digest.title}</h2>
            <p className="text-xs text-muted-foreground mt-2">
              ~{digest.wordCount.toLocaleString()} words · {digest.windowHours}h
            </p>
          </header>

          <InteractiveBookText
            html={digest.contentHtml}
            bookId={bookId}
            chapterIndex={0}
            fontSizeClass={typo.sizeClass}
            fontFamilyClass={typo.familyClass}
            displayLang={displayLang}
            onTranslationCountChange={setTranslationCount}
            sourceKind="news"
            sourceTitle={digest.title}
          />

          {digest.sourceArticles.length > 0 && (
            <footer className="mt-12 pt-6 border-t border-border/50 text-center">
              <p className="text-xs text-muted-foreground">
                این خلاصه از {digest.sourceArticles.length.toLocaleString()} خبر تهیه شده است.
              </p>
            </footer>
          )}
        </main>
      </div>
    </div>
  );
};

export default NewsDigestReader;
