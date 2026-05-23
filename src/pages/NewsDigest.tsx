import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Newspaper, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { InteractiveBookText, type DisplayLang } from '@/components/books/InteractiveBookText';
import { TranslateChapterButton } from '@/components/books/TranslateChapterButton';
import { batchAnalyzeChapter } from '@/lib/batchAnalyzeChapter';
import { emitChapterAnalyses } from '@/lib/chapterAnalysisBus';
import { useSettingsStore } from '@/store/settingsStore';
import { coerceBookModel } from '@/lib/aiModels';
import type { BookChapter } from '@/types';
import { deleteDigest, getDigestById, type NewsDigest } from '@/lib/news';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const NewsDigestReader = () => {
  const { digestId } = useParams<{ digestId: string }>();
  const navigate = useNavigate();
  const [digest, setDigest] = useState<NewsDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayLang, setDisplayLang] = useState<DisplayLang>('both');
  const [translationCount, setTranslationCount] = useState(0);

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

  // Auto-translate digest paragraphs to Persian on load (cache-aware).
  useEffect(() => {
    if (!digest?.contentHtml) return;
    const controller = new AbortController();
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
    void batchAnalyzeChapter(bookId, chapter, {
      concurrency: 5,
      signal: controller.signal,
      modelRef: newsModelRef,
      onProgress: (snap) => emitChapterAnalyses(bookId, 0, snap.results),
    }).then((final) => emitChapterAnalyses(bookId, 0, final.results)).catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digest?.id, digest?.contentHtml]);

  const handleDelete = async () => {
    if (!digest) return;
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
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-2">
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

  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-background/95 backdrop-blur z-10">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-3 flex items-center gap-2">
          <Link to="/news"><Button variant="ghost" size="icon" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm sm:text-base font-semibold truncate leading-tight flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
              {digest.title}
            </h1>
            <p className="text-[11px] text-muted-foreground truncate">
              {digest.length === 'max' ? 'خلاصه حداکثری' : digest.length === 'long' ? 'خلاصه بلند' : 'خلاصه کوتاه'} · {digest.windowHours}h ·
              {' '}{digest.sourceArticles.length} منبع
            </p>
          </div>
          <TranslateChapterButton
            bookId={`digest-${digest.id}`}
            chapter={{
              id: `digest-${digest.id}:0`,
              bookId: `digest-${digest.id}`,
              index: 0,
              title: digest.title,
              html: digest.contentHtml,
              text: '',
              wordCount: digest.wordCount,
            }}
            displayLang={displayLang}
            onDisplayLangChange={setDisplayLang}
            hasAnyTranslation={translationCount > 0}
          />
          <Button variant="ghost" size="icon" onClick={handleDelete} aria-label="Delete">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <main className="max-w-4xl mx-auto px-5 sm:px-10 py-8 sm:py-12" style={{ fontSize: '1rem', lineHeight: 1.6 }}>
          <header className="mb-8 pb-6 border-b border-border/50">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              AI digest · {digest.model ?? 'unknown'}
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{digest.title}</h2>
            <p className="text-xs text-muted-foreground mt-2">~{digest.wordCount.toLocaleString()} words</p>
          </header>

          <InteractiveBookText
            html={digest.contentHtml}
            bookId={`digest-${digest.id}`}
            chapterIndex={0}
            fontSizeClass=""
            fontFamilyClass=""
            displayLang={displayLang}
            onTranslationCountChange={setTranslationCount}
            sourceKind="news"
            sourceTitle={digest.title}
          />

          {digest.sourceArticles.length > 0 && (
            <section className="mt-12 pt-8 border-t border-border/50">
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
                منابع ({digest.sourceArticles.length})
              </h3>
              <ul className="space-y-2 text-sm">
                {digest.sourceArticles.map((s, i) => (
                  <li key={i}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {s.title}
                    </a>
                    {s.siteName && (
                      <span className="text-[11px] text-muted-foreground ms-2">{s.siteName}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default NewsDigestReader;
