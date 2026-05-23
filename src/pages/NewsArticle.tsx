import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Newspaper,
  RefreshCw,
  Bookmark,
  BookmarkCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { EmptyState } from '@/components/EmptyState';
import { InteractiveBookText, type DisplayLang } from '@/components/books/InteractiveBookText';
import { ChapterTTSPlayer } from '@/components/books/ChapterTTSPlayer';
import { ReaderTTSQuickSettings } from '@/components/books/ReaderTTSQuickSettings';
import { TranslateChapterButton } from '@/components/books/TranslateChapterButton';
import type { BookChapter } from '@/types';
import {
  generateDigest,
  getArticleById,
  importUrl,
  scrapeArticle,
  setArticleSaved,
  upsertArticle,
  type NewsArticle,
  type NewsDigest,
} from '@/lib/news';
import { supabase } from '@/integrations/supabase/client';
import { useSettingsStore } from '@/store/settingsStore';
import { coerceBookModel } from '@/lib/aiModels';
import { batchAnalyzeChapter, extractAnalysableParagraphs } from '@/lib/batchAnalyzeChapter';
import { getCachedParagraphAnalysis } from '@/lib/bookAnalysis';
import { emitChapterAnalyses } from '@/lib/chapterAnalysisBus';
import { toast } from 'sonner';

function isYoutubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /(^|\.)youtube\.com$/.test(u.hostname) || u.hostname === 'youtu.be';
  } catch { return false; }
}

type RewriteLength = 'long' | 'max' | 'auto-max';

const NewsArticleReader = () => {
  const { articleId } = useParams<{ articleId: string }>();
  const navigate = useNavigate();
  const goBack = () => {
    // Prefer going back so the user lands on the exact source/folder they were
    // browsing. Fall back to /news when there's no history (e.g. cold load).
    if (window.history.length > 1) navigate(-1);
    else navigate('/news');
  };
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);

  // Rewrites cached per (article, length) in news_digests via source_articles.
  const [rewrites, setRewrites] = useState<Record<RewriteLength, NewsDigest | undefined>>(
    {} as Record<RewriteLength, NewsDigest | undefined>,
  );
  const [activeRewrite, setActiveRewrite] = useState<RewriteLength>('auto-max');
  const [rewriteBusy, setRewriteBusy] = useState<RewriteLength | null>(null);
  const [view, setView] = useState<'original' | 'rewrite'>('original');
  const [origDisplayLang, setOrigDisplayLang] = useState<DisplayLang>('both');
  const [origTranslationCount, setOrigTranslationCount] = useState(0);
  const [rwDisplayLang, setRwDisplayLang] = useState<DisplayLang>('both');
  const [rwTranslationCount, setRwTranslationCount] = useState(0);
  const [faTtsText, setFaTtsText] = useState<string>('');

  const settings = useSettingsStore((s) => s.settings);
  // Per-paragraph translation/analysis model. Uses the shared "Batch paragraph
  // analysis" setting so the user can pick e.g. Groq from Settings → AI, and
  // the same choice applies to both News and Books.
  const newsModelRef = coerceBookModel(
    settings.paragraphBatchModelRef
      ?? settings.bookBatchAnalysisModelRef
      ?? settings.newsRewriteModelRef
      ?? settings.bookRewriteModelRef
      ?? 'google/gemini-3.1-flash-lite-preview',
  );

  // Load existing rewrites for this article from news_digests (scope='source', single article).
  const loadRewrites = async (a: NewsArticle) => {
    try {
      const { data } = await supabase
        .from('news_digests' as never)
        .select('*')
        .eq('topic', `article:${a.id}`)
        .order('created_at', { ascending: false });
      const map: Record<RewriteLength, NewsDigest | undefined> = {} as any;
      for (const row of (data as any[]) ?? []) {
        const d: NewsDigest = {
          id: row.id, userId: row.user_id, sourceId: row.source_id,
          length: row.length, scope: row.scope, topic: row.topic,
          windowHours: row.window_hours, title: row.title,
          contentMd: row.content_md, contentHtml: row.content_html,
          sourceArticles: row.source_articles ?? [], wordCount: row.word_count,
          model: row.model, createdAt: row.created_at, updatedAt: row.updated_at,
        };
        if ((d.length === 'long' || d.length === 'max' || d.length === 'auto-max') && !map[d.length as RewriteLength]) {
          map[d.length as RewriteLength] = d;
        }
      }
      setRewrites(map);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!articleId) return;
    void (async () => {
      try {
        const a = await getArticleById(articleId);
        setArticle(a);
        if (a) {
          document.title = `${a.title} — News`;
          await loadRewrites(a);
          if (!a.contentHtml && a.contentMd !== '__SCRAPE_FAILED__') {
            await runScrape(a, false);
          }
          // Auto-generate a long, simple rewrite the very first time the
          // user opens this article so they immediately see a digestible
          // version. Skip if any rewrite already exists.
          try {
            const { data: existing } = await supabase
              .from('news_digests' as never)
              .select('id')
              .eq('topic', `article:${a.id}`)
              .limit(1);
            const hasAny = Array.isArray(existing) && existing.length > 0;
            if (!hasAny) {
              // Fire and forget — don't block initial render.
              void handleRewrite('auto-max', false).catch(() => {});
            }
          } catch { /* ignore */ }
        }
      } catch (e: any) {
        toast.error(e.message ?? 'Failed to load article.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  // Auto-translate the active chapter into Persian as soon as it's available
  // and assemble a Persian TTS script from cached translations. Reuses the
  // same per-paragraph cache as the manual TranslateChapterButton, so this
  // only hits the AI when needed.
  useEffect(() => {
    if (!article?.contentHtml) return;
    let cancelled = false;
    const controller = new AbortController();

    const activeBookId = view === 'rewrite' && rewrites[activeRewrite]?.contentHtml
      ? `news-rw-${article.id}-${activeRewrite}`
      : `news-${article.id}`;
    const activeHtml = view === 'rewrite' && rewrites[activeRewrite]?.contentHtml
      ? rewrites[activeRewrite]!.contentHtml!
      : article.contentHtml;
    if (!activeHtml) return;

    const chapter: BookChapter = {
      id: `${activeBookId}:0`,
      bookId: activeBookId,
      index: 0,
      title: article.title,
      html: activeHtml,
      text: '',
      wordCount: 0,
    };

    const buildFaText = async () => {
      const items = extractAnalysableParagraphs(chapter);
      const out: string[] = [];
      for (const it of items) {
        const cached = await getCachedParagraphAnalysis(activeBookId, 0, it.text);
        const fa = cached?.translation?.trim();
        if (fa) out.push(fa);
      }
      if (!cancelled) setFaTtsText(out.join('\n\n'));
    };

    void (async () => {
      try {
        // Kick off translation (uses cache, free if already done).
        const final = await batchAnalyzeChapter(activeBookId, chapter, {
          concurrency: 5,
          signal: controller.signal,
          modelRef: newsModelRef,
          onProgress: (snap) => {
            emitChapterAnalyses(activeBookId, 0, snap.results);
          },
        });
        if (cancelled) return;
        emitChapterAnalyses(activeBookId, 0, final.results);
        await buildFaText();
      } catch {
        // best-effort; the user can still trigger translate manually
        await buildFaText();
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id, article?.contentHtml, view, activeRewrite, rewrites[activeRewrite]?.contentHtml]);

  const runScrape = async (a: NewsArticle, manual = true) => {
    setScraping(true);
    try {
      // YouTube videos: use importUrl (transcript → first-person AI article).
      if (isYoutubeUrl(a.url)) {
        const result = await importUrl(a.url);
        if (result.kind === 'article' || result.kind === 'youtube') {
          const art = result.article;
          const updated = await upsertArticle({
            sourceId: a.sourceId,
            url: a.url,
            title: art.title || a.title,
            author: art.author,
            excerpt: art.excerpt,
            contentMd: art.contentMd,
            contentHtml: art.contentHtml,
            imageUrl: art.imageUrl ?? a.imageUrl,
            siteName: art.siteName ?? a.siteName,
            language: art.language,
            publishedAt: art.publishedAt ?? a.publishedAt,
            wordCount: art.wordCount,
          });
          setArticle(updated);
          return;
        }
      }
      const scraped = await scrapeArticle(a.url, {
        excerpt: a.excerpt ?? undefined,
        imageUrl: a.imageUrl ?? undefined,
        siteName: a.siteName ?? undefined,
      });
      const updated = await upsertArticle({
        sourceId: a.sourceId,
        url: a.url,
        title: scraped.title || a.title,
        author: scraped.author,
        excerpt: scraped.excerpt || a.excerpt,
        contentMd: scraped.contentMd,
        contentHtml: scraped.contentHtml,
        imageUrl: scraped.imageUrl ?? a.imageUrl,
        siteName: scraped.siteName ?? a.siteName,
        language: scraped.language,
        publishedAt: scraped.publishedAt ?? a.publishedAt,
        wordCount: scraped.wordCount,
      });
      setArticle(updated);
      if (scraped.blocked && manual) {
        toast.info('این منبع متن کامل را قفل کرده — خلاصه‌ی فید نمایش داده می‌شود.');
      }
    } catch (e: any) {
      if (manual) toast.error(e.message ?? 'Scrape failed.');
      try {
        const failed = await upsertArticle({
          sourceId: a.sourceId,
          url: a.url,
          title: a.title,
          excerpt: a.excerpt,
          contentMd: '__SCRAPE_FAILED__',
          contentHtml: null,
          imageUrl: a.imageUrl,
          siteName: a.siteName,
          language: a.language,
          publishedAt: a.publishedAt,
          wordCount: 0,
        });
        setArticle(failed);
      } catch {/* ignore */}
    } finally {
      setScraping(false);
    }
  };

  const toggleSave = async () => {
    if (!article) return;
    const next = !article.isSaved;
    try {
      await setArticleSaved(article.id, next);
      setArticle({ ...article, isSaved: next });
      toast.success(next ? 'خبر سیو شد.' : 'از سیوها حذف شد.');
    } catch (e: any) {
      toast.error(e.message ?? 'Save failed.');
    }
  };

  const handleRewrite = async (length: RewriteLength, force = false) => {
    if (!article) return;
    if (!force && rewrites[length]) {
      setActiveRewrite(length);
      setView('rewrite');
      return;
    }
    setRewriteBusy(length);
    try {
      const body = article.contentMd && article.contentMd !== '__SCRAPE_FAILED__'
        ? article.contentMd
        : article.excerpt ?? '';
      if (!body.trim()) {
        toast.error('متنی برای بازنویسی پیدا نشد.');
        return;
      }
      const digest = await generateDigest({
        articles: [{
          title: article.title,
          url: article.url,
          siteName: article.siteName ?? undefined,
          contentMd: body,
          publishedAt: article.publishedAt ?? undefined,
        }],
        length,
        scope: 'source',
        sourceId: article.sourceId,
        topic: `article:${article.id}`,
        windowHours: 24,
        model: newsModelRef.model,
      });
      setRewrites((m) => ({ ...m, [length]: digest }));
      setActiveRewrite(length);
      setView('rewrite');
      toast.success('بازنویسی آماده شد.');
    } catch (e: any) {
      toast.error(e.message ?? 'بازنویسی شکست خورد.');
    } finally {
      setRewriteBusy(null);
    }
  };

  const deleteRewrite = async (length: RewriteLength) => {
    const r = rewrites[length];
    if (!r) return;
    try {
      await supabase.from('news_digests' as never).delete().eq('id', r.id);
      setRewrites((m) => ({ ...m, [length]: undefined }));
      toast.success('حذف شد.');
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

  if (!article) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back"><ArrowLeft className="h-5 w-5" /></Button>
            <h1 className="text-lg font-semibold">News</h1>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-6 py-10">
          <EmptyState icon={<Newspaper className="h-7 w-7" />} title="مقاله پیدا نشد" />
        </main>
      </div>
    );
  }

  const activeRewriteDoc = rewrites[activeRewrite];
  const hasAnyRewrite = !!rewrites.long || !!rewrites.max || !!rewrites['auto-max'];

  // Build pseudo-chapters so TranslateChapterButton (which expects a BookChapter)
  // can drive whole-text translation against the same `analyze-paragraph` cache.
  const origChapter: BookChapter | undefined = article.contentHtml
    ? {
        id: `news-${article.id}:0`,
        bookId: `news-${article.id}`,
        index: 0,
        title: article.title,
        html: article.contentHtml,
        text: article.contentMd ?? '',
        wordCount: article.wordCount,
      }
    : undefined;
  const rwChapter: BookChapter | undefined = activeRewriteDoc?.contentHtml
    ? {
        id: `news-rw-${article.id}-${activeRewrite}:0`,
        bookId: `news-rw-${article.id}-${activeRewrite}`,
        index: 0,
        title: activeRewriteDoc.title || article.title,
        html: activeRewriteDoc.contentHtml,
        text: activeRewriteDoc.contentMd,
        wordCount: activeRewriteDoc.wordCount,
      }
    : undefined;

  // Plain text for TTS — prefer current view (rewrite if user is on it).
  const ttsText = (() => {
    const md = view === 'rewrite' && activeRewriteDoc ? activeRewriteDoc.contentMd : article.contentMd;
    if (!md || md === '__SCRAPE_FAILED__') return article.excerpt ?? '';
    // Strip markdown / html for cleaner narration.
    return md
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[#>*_`~-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  })();


  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-background/95 backdrop-blur z-10">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-3 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back"><ArrowLeft className="h-5 w-5" /></Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm sm:text-base font-semibold truncate leading-tight">{article.title}</h1>
            <p className="text-[11px] text-muted-foreground truncate">
              {article.siteName ?? ''}
              {article.author ? ` · ${article.author}` : ''}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={toggleSave} aria-label="Save article" title={article.isSaved ? 'حذف از سیو' : 'سیو'}>
            {article.isSaved ? <BookmarkCheck className="h-4 w-4 text-primary" /> : <Bookmark className="h-4 w-4" />}
          </Button>
          <ReaderTTSQuickSettings faAvailable={!!faTtsText} />
          {(view === 'rewrite' ? rwChapter : origChapter) && (
            <TranslateChapterButton
              bookId={view === 'rewrite' ? rwChapter!.bookId : origChapter!.bookId}
              chapter={view === 'rewrite' ? rwChapter : origChapter}
              displayLang={view === 'rewrite' ? rwDisplayLang : origDisplayLang}
              onDisplayLangChange={view === 'rewrite' ? setRwDisplayLang : setOrigDisplayLang}
              hasAnyTranslation={(view === 'rewrite' ? rwTranslationCount : origTranslationCount) > 0}
            />
          )}
          <Button variant="ghost" size="icon" onClick={() => runScrape(article)} disabled={scraping} aria-label="Re-scrape">
            {scraping ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="icon" aria-label="Open original"><ExternalLink className="h-4 w-4" /></Button>
          </a>
        </div>
      </header>

      {ttsText && (
        <ChapterTTSPlayer
          bookId={`news-${article.id}`}
          chapterIndex={view === 'rewrite' ? (activeRewrite === 'max' ? 2 : activeRewrite === 'auto-max' ? 3 : 1) : 0}
          chapterTitle={article.title}
          text={ttsText}
          textFa={faTtsText || undefined}
          coverUrl={article.imageUrl ?? undefined}
        />
      )}


      <div className="flex-1 overflow-y-auto overscroll-contain">
        <main className="max-w-4xl mx-auto px-5 sm:px-10 py-8 sm:py-12" style={{ fontSize: '1rem', lineHeight: 1.6 }}>
          {scraping && !article.contentHtml ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">در حال استخراج متن کامل…</p>
            </div>
          ) : article.contentHtml ? (
            <>
              <header className="mb-6 pb-6 border-b border-border/50">
                {article.imageUrl && (
                  <img
                    src={article.imageUrl}
                    alt=""
                    loading="lazy"
                    className="w-full max-h-[360px] object-cover rounded-xl mb-5 bg-muted"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{article.title}</h2>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  {article.siteName && <span>{article.siteName}</span>}
                  {article.wordCount > 0 && <span>· ~{article.wordCount.toLocaleString()} words</span>}
                </div>
              </header>

              {/* View toggle */}
              {hasAnyRewrite && (
                <div className="mb-4 inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
                  <button
                    type="button"
                    onClick={() => setView('original')}
                    className={'px-3 py-1.5 text-xs font-medium rounded-md transition-colors ' +
                      (view === 'original' ? 'bg-background shadow-sm' : 'text-muted-foreground')}
                  >
                    اصل خبر
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('rewrite')}
                    className={'px-3 py-1.5 text-xs font-medium rounded-md transition-colors ' +
                      (view === 'rewrite' ? 'bg-background shadow-sm' : 'text-muted-foreground')}
                  >
                    بازنویسی AI
                  </button>
                </div>
              )}

              {view === 'original' && (
                <InteractiveBookText
                  html={article.contentHtml}
                  bookId={`news-${article.id}`}
                  chapterIndex={0}
                  fontSizeClass=""
                  fontFamilyClass=""
                  displayLang={origDisplayLang}
                  onTranslationCountChange={setOrigTranslationCount}
                  sourceKind="news"
                  sourceTitle={article.title}
                />
              )}

              {/* Rewrite tabs section */}
              <section className="mt-12 pt-8 border-t border-border/50">
                <header className="mb-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h3 className="text-base font-semibold">بازنویسی این خبر با هوش مصنوعی</h3>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    AI: {newsModelRef.model} · تنظیمات → AI
                  </span>
                </header>

                <Tabs value={activeRewrite} onValueChange={(v) => setActiveRewrite(v as RewriteLength)}>
                  <TabsList className="bg-muted/50 flex-wrap h-auto">
                    <TabsTrigger value="auto-max" className="text-xs">
                      نسخه کامل ساده
                      {rewrites['auto-max'] && <span className="ms-1.5 text-primary">●</span>}
                    </TabsTrigger>
                    <TabsTrigger value="long" className="text-xs">
                      خلاصه بلند
                      {rewrites.long && <span className="ms-1.5 text-primary">●</span>}
                    </TabsTrigger>
                    <TabsTrigger value="max" className="text-xs">
                      خلاصه حداکثری
                      {rewrites.max && <span className="ms-1.5 text-primary">●</span>}
                    </TabsTrigger>
                  </TabsList>
                  {(['auto-max', 'long', 'max'] as RewriteLength[]).map((len) => {
                    const r = rewrites[len];
                    const busy = rewriteBusy === len;
                    const label = len === 'auto-max' ? 'نسخه کامل ساده' : len === 'long' ? 'خلاصه بلند' : 'خلاصه حداکثری';
                    return (
                      <TabsContent key={len} value={len} className="mt-4">
                        <div className="rounded-lg border border-border bg-card/40 p-4 sm:p-6">
                          {!r ? (
                            <div className="py-8 text-center space-y-3">
                              <p className="text-sm text-muted-foreground">
                                {label} هنوز ساخته نشده.
                              </p>
                              <Button onClick={() => handleRewrite(len, false)} disabled={busy} size="sm">
                                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                                {busy ? 'در حال ساخت…' : 'ساخت بازنویسی'}
                              </Button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-border/50">
                                <div className="text-[11px] text-muted-foreground">
                                  {r.wordCount.toLocaleString()} words · <span className="opacity-70">{r.model}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button size="sm" variant="ghost" onClick={() => handleRewrite(len, true)} disabled={busy}>
                                    {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                                    بازسازی
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => deleteRewrite(len)} className="text-destructive">
                                    <Trash2 className="h-3.5 w-3.5 mr-1" /> حذف
                                  </Button>
                                </div>
                              </div>
                              <InteractiveBookText
                                html={r.contentHtml}
                                bookId={`news-rw-${article.id}-${len}`}
                                chapterIndex={0}
                                fontSizeClass=""
                                fontFamilyClass=""
                                displayLang={len === activeRewrite ? rwDisplayLang : 'en'}
                                onTranslationCountChange={
                                  len === activeRewrite ? setRwTranslationCount : undefined
                                }
                                sourceKind="news"
                                sourceTitle={article.title}
                              />
                            </>
                          )}
                        </div>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </section>
            </>
          ) : (
            <EmptyState
              icon={<Newspaper className="h-7 w-7" />}
              title="متن کامل در دسترس نیست"
              description="می‌توانی روی دکمه بازخوانی بزنی یا اصل خبر را در سایت منبع باز کنی."
              action={
                <Button onClick={() => runScrape(article)} className="gap-1.5">
                  <RefreshCw className="h-4 w-4" /> دوباره تلاش کن
                </Button>
              }
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default NewsArticleReader;
