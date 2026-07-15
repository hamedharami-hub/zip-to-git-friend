import { useCallback, useEffect, useRef, useState } from "react";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useArticleLoad } from "@/hooks/useArticleLoad";
import { useArticleTranslation } from "@/hooks/useArticleTranslation";
import { useArticleLightbox } from "@/hooks/useArticleLightbox";
import { loadNewsDisplayLang, saveNewsDisplayLang } from "@/lib/newsDisplayLang";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Newspaper,
  RefreshCw,
  Bookmark,
  BookmarkCheck,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/EmptyState";
import { InteractiveBookText, type DisplayLang } from "@/components/books/InteractiveBookText";
import { ChapterTTSPlayer } from "@/components/books/ChapterTTSPlayer";
import { ReaderTTSQuickSettings } from "@/components/books/ReaderTTSQuickSettings";
import { setArticleSaved } from "@/lib/news";
import { cacheArticle } from "@/lib/newsOfflineCache";
import { useSettingsStore } from "@/store/settingsStore";
import { coerceBookModel } from "@/lib/aiModels";
import { toast } from "sonner";
import { usePinchFontStep } from "@/hooks/usePinchZoom";
import { useReadingMode } from "@/hooks/useReadingMode";
import { BidiText } from "@/components/BidiText";
import { cn } from "@/lib/utils";
import { LangCycleButton } from "@/components/news/LangCycleButton";
import { ReadingModeControls } from "@/components/reader/ReadingModeControls";
import { ImageLightbox } from "@/components/news/ImageLightbox";
import { NewsShareMenu } from "@/components/news/NewsShareMenu";
import { NewsTypographyMenu } from "@/components/news/NewsTypographyMenu";
import { NewsTocMenu } from "@/components/news/NewsTocMenu";
import { DEFAULT_REWRITE_VOICE } from "@/lib/news";

const NewsArticleReader = () => {
  const { articleId } = useParams<{ articleId: string }>();
  const navigate = useNavigate();
  const goBack = () => {
    // Always return to the main news feed. The browser history may contain
    // redirects or other routes, so navigate(-1) often overshoots.
    navigate("/news");
  };

  const { article, setArticle, loading, scraping, runScrape } = useArticleLoad(articleId);

  usePageMeta({
    title: article?.title ? `${article.title} — خبر` : "خبر — Lingua",
    description: article?.excerpt || article?.title || "خواندن خبر با ترجمه و بازنویسی هوش مصنوعی.",
    ogType: "article",
    image: article?.imageUrl || undefined,
  });

  const [origDisplayLang, setOrigDisplayLang] = useState<DisplayLang>(() => loadNewsDisplayLang());
  const [origTranslationCount, setOrigTranslationCount] = useState(0);
  // Persist language choice globally so re-opens / back navigation keep it.
  useEffect(() => {
    saveNewsDisplayLang(origDisplayLang);
  }, [origDisplayLang]);

  // Reader typography (font size + family) — persisted via NewsTypographyMenu.
  const [typo, setTypo] = useState<{
    sizeClass: string;
    familyClass: string;
    familyStyle?: React.CSSProperties;
  }>({ sizeClass: "text-base", familyClass: "font-sans" });
  const handleTypoChange = useCallback(
    (v: { sizeClass: string; familyClass: string; familyStyle?: React.CSSProperties }) =>
      setTypo(v),
    [],
  );
  const pinchScrollRef = useRef<HTMLDivElement | null>(null);
  usePinchFontStep(pinchScrollRef);

  // Shared reading-mode state (theme, extra line-height) from ReadingModeControls.
  const { extraLineHeight } = useReadingMode();

  const settings = useSettingsStore((s) => s.settings);
  // Per-paragraph batch analysis model (the ✨ button on a paragraph).
  const newsModelRef = coerceBookModel(
    settings.newsBatchAnalysisModelRef ??
      settings.paragraphBatchModelRef ??
      settings.bookBatchAnalysisModelRef ??
      "google/gemini-3.1-flash-lite-preview",
  );

  const { faTtsText, ttsText, origChapter } = useArticleTranslation({
    article,
    view: "original",
    activeRewrite: "long",
    voice: DEFAULT_REWRITE_VOICE,
    rewrites: {},
    newsModelRef,
  });

  const {
    lightboxOpen,
    setLightboxOpen,
    lightboxImages,
    setLightboxImages,
    lightboxIndex,
    setLightboxIndex,
    openLightbox,
  } = useArticleLightbox({ article, rewriteHtmlWithImages: undefined });

  const toggleSave = async () => {
    if (!article) return;
    const next = !article.isSaved;
    try {
      await setArticleSaved(article.id, next);
      const next2 = { ...article, isSaved: next };
      setArticle(next2);
      cacheArticle(next2);
      toast.success(next ? "خبر سیو شد." : "از سیوها حذف شد.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
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
          <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold">News</h1>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-6 py-10">
          <EmptyState icon={<Newspaper className="h-7 w-7" />} title="مقاله پیدا نشد" />
        </main>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground">
      <header
        className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* Single ultra-thin row — back + all controls inline, no title. */}
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
            value={origDisplayLang}
            onChange={setOrigDisplayLang}
            hasAnyTranslation={origTranslationCount > 0}
          />
          <NewsTypographyMenu onChange={handleTypoChange} showReadingMode={true} />
          <ReaderTTSQuickSettings faAvailable={!!faTtsText} />
          <NewsTocMenu html={article.contentHtml ?? ""} />
          <ReadingModeControls containerSelector="#news-reading-root" />
          {origChapter && (
            <NewsShareMenu
              bookId={origChapter.bookId}
              chapterIndex={0}
              title={article.title}
              contentHtml={article.contentHtml ?? ""}
              contentMd={article.contentMd}
              url={article.url}
              siteName={article.siteName}
              aiModel={newsModelRef.model}
            />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="منو">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={toggleSave}>
                {article.isSaved ? (
                  <>
                    <BookmarkCheck className="h-4 w-4 me-2 text-primary" /> حذف از سیو
                  </>
                ) : (
                  <>
                    <Bookmark className="h-4 w-4 me-2" /> سیو
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => runScrape(article)} disabled={scraping}>
                {scraping ? (
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 me-2" />
                )}
                بازخوانی
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={article.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 me-2" /> اصل خبر
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {ttsText && (
        <ChapterTTSPlayer
          bookId={`news-${article.id}`}
          chapterIndex={0}
          chapterTitle={article.title}
          text={ttsText}
          textFa={faTtsText || undefined}
          coverUrl={article.imageUrl ?? undefined}
        />
      )}

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        ref={pinchScrollRef}
        style={{ touchAction: "pan-y" }}
      >
        <main
          id="news-reading-root"
          data-reading-root
          className={cn("max-w-4xl mx-auto px-5 sm:px-10 py-8 sm:py-12", typo.familyClass)}
          style={{ lineHeight: 1.7 + extraLineHeight, ...(typo.familyStyle ?? {}) }}
        >
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
                    role="button"
                    tabIndex={0}
                    aria-label="بزرگنمایی تصویر"
                    className="w-full max-h-[360px] object-cover rounded-xl mb-5 bg-muted cursor-pointer transition hover:ring-2 hover:ring-primary/50"
                    onClick={() => openLightbox(article.imageUrl!)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openLightbox(article.imageUrl!);
                      }
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                  <BidiText as="span">{article.title}</BidiText>
                </h2>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  {article.siteName && <span>{article.siteName}</span>}
                  {article.wordCount > 0 && (
                    <span>· ~{article.wordCount.toLocaleString()} words</span>
                  )}
                </div>
              </header>

              <InteractiveBookText
                html={article.contentHtml}
                bookId={`news-${article.id}`}
                chapterIndex={0}
                fontSizeClass={typo.sizeClass}
                fontFamilyClass={typo.familyClass}
                displayLang={origDisplayLang}
                onTranslationCountChange={setOrigTranslationCount}
                sourceKind="news"
                sourceTitle={article.title}
                onImageClick={openLightbox}
              />
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

      <ImageLightbox
        images={lightboxImages}
        open={lightboxOpen}
        startIndex={lightboxIndex}
        onOpenChange={setLightboxOpen}
      />
    </div>
  );
};

export default NewsArticleReader;
