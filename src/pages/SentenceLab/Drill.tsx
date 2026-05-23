import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, BookOpen, Tag, AlertTriangle, Volume2,
  RefreshCw, Headphones, Mic, BarChart3, Sparkles, TrendingUp,
  Layers, Home, Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSentenceStore } from '@/store/sentenceStore';
import { PodcastMode } from '@/components/sentence-lab/PodcastMode';
import { RoleplayMode } from '@/components/sentence-lab/RoleplayMode';
import { GamificationHUD } from '@/components/sentence-lab/GamificationHUD';
import { FlagButton } from '@/components/sentence-lab/FlagButton';
import { fetchCategoryBySlug, type SentenceCategory } from '@/lib/sentenceCategories';
import { fetchPath, type SentencePath } from '@/lib/sentencePaths';
import {
  looksLikePhrase, getCachedExample, getAutoExample, type AutoExample,
} from '@/lib/autoExample';

type Mode = 'drill' | 'roleplay';

export default function SentenceDrillPage() {
  const params = useParams<{
    categorySlug?: string;
    subSlug?: string;
    level?: string;
    pathId?: string;
  }>();
  const categorySlug = params.categorySlug ?? '';
  const subSlug = params.subSlug ?? '';
  const level = params.level ?? '';
  const pathId = params.pathId ?? '';
  const navigate = useNavigate();

  const { queue, currentIndex, loading, error, fetchDailyQueue, next } =
    useSentenceStore();

  const [category, setCategory] = useState<SentenceCategory | null>(null);
  const [sub, setSub] = useState<SentenceCategory | null>(null);
  const [path, setPath] = useState<SentencePath | null>(null);
  const [mode, setMode] = useState<Mode>('drill');
  const [harvested, setHarvested] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      if (pathId) {
        const p = await fetchPath(pathId);
        setPath(p);
        setCategory(null); setSub(null);
      } else {
        const c = await fetchCategoryBySlug(categorySlug);
        setCategory(c);
        const s = subSlug && subSlug !== 'all' ? await fetchCategoryBySlug(subSlug) : null;
        setSub(s);
        setPath(null);
      }
    })();
  }, [categorySlug, subSlug, pathId]);

  useEffect(() => {
    if (pathId) {
      // load recipe then queue
      void (async () => {
        const p = await fetchPath(pathId);
        if (p) {
          await fetchDailyQueue({ pathRecipe: p.recipe });
        }
      })();
      return;
    }
    const subFilter = subSlug && subSlug !== 'all' ? subSlug : null;
    const levelFilter = level && level !== 'all' ? level : null;
    void fetchDailyQueue({
      category: categorySlug || null,
      subcategory: subFilter,
      cefrLevel: levelFilter,
    });
  }, [categorySlug, subSlug, level, pathId, fetchDailyQueue]);

  const current = queue[currentIndex];
  const progressPct = useMemo(
    () => (queue.length ? Math.round(((currentIndex + 1) / queue.length) * 100) : 0),
    [currentIndex, queue.length],
  );

  const dueCount = useMemo(
    () => queue.filter((q) => q.kind === 'due').length,
    [queue],
  );
  const newCount = queue.length - dueCount;

  const title = path?.name ?? sub?.name ?? category?.name ?? categorySlug;
  const crumb = path ? 'Sentence Path' : (sub ? category?.name : 'Sentence Lab');

  const handleHarvest = (texts: string[]) => {
    setHarvested((prev) => {
      const seen = new Set(prev.map((p) => p.toLowerCase()));
      const merged = [...prev];
      for (const t of texts) {
        const k = t.trim().toLowerCase();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        merged.push(t.trim());
      }
      return merged;
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
              aria-label="Back to home"
              className="h-8 w-8 shrink-0"
            >
              <Home className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (pathId) navigate(`/sentence-lab/path/${pathId}`);
                else if (level) navigate(`/sentence-lab/${categorySlug}/${subSlug}`);
                else if (sub) navigate(`/sentence-lab/${categorySlug}`);
                else navigate('/sentence-lab');
              }}
              aria-label="Back"
              className="h-8 w-8 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {crumb}
              </p>
              <h1 className="truncate text-sm font-semibold leading-tight sm:text-base">
                {title}
                {level && level !== 'all' && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    · {level}
                  </span>
                )}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <GamificationHUD compact />
            <span className="text-xs tabular-nums text-muted-foreground">
              {queue.length ? `${currentIndex + 1}/${queue.length}` : '—'}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                if (path) {
                  fetchDailyQueue({ pathRecipe: path.recipe });
                } else {
                  fetchDailyQueue({
                    category: categorySlug || null,
                    subcategory: subSlug && subSlug !== 'all' ? subSlug : null,
                    cefrLevel: level && level !== 'all' ? level : null,
                  });
                }
              }}
              disabled={loading}
              aria-label="Refresh"
              className="h-8 w-8"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        <div className="h-0.5 w-full bg-muted">
          <div
            className="h-0.5 bg-primary transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      <main className="container mx-auto px-3 py-4 sm:px-4 sm:py-6">
        {loading && queue.length === 0 ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card className="mx-auto max-w-md">
            <CardContent className="py-8 text-center text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        ) : !current ? (
          <Card className="mx-auto max-w-md">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No sentences here yet. Try the <strong>Import</strong> button on the
              previous screen.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
            {/* ───────── LEFT PANE ───────── */}
            <section className="space-y-4 min-w-0">
              {/* Mode selector */}
              <div className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-1">
                <button
                  onClick={() => setMode('drill')}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    mode === 'drill'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  <Headphones className="h-4 w-4" />
                  Podcast Drill
                </button>
                <button
                  onClick={() => setMode('roleplay')}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    mode === 'roleplay'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  <Mic className="h-4 w-4" />
                  Live Roleplay
                </button>
              </div>

              {mode === 'drill' ? (
                <>
                  <PodcastMode />
                  <DrillCard item={current} onNext={next} />
                </>
              ) : (
                <>
                  <RoleplayMode item={current.sentence} onHarvest={handleHarvest} />
                  <DrillCard item={current} onNext={next} compact />
                </>
              )}

              {/* Mobile-only stats fallback */}
              <div className="lg:hidden">
                <Tabs defaultValue="stats">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="stats" className="gap-1.5">
                      <BarChart3 className="h-4 w-4" /> Stats
                    </TabsTrigger>
                    <TabsTrigger value="harvest" className="gap-1.5">
                      <Sparkles className="h-4 w-4" /> Harvest
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="stats" className="mt-3 space-y-3">
                    <SessionPanel
                      currentIndex={currentIndex}
                      total={queue.length}
                      due={dueCount}
                      fresh={newCount}
                    />
                    <FsrsPanel item={current} />
                    <ContextPanel item={current} />
                  </TabsContent>
                  <TabsContent value="harvest" className="mt-3">
                    <HarvestPanel items={harvested} />
                  </TabsContent>
                </Tabs>
              </div>
            </section>

            {/* ───────── RIGHT PANE (desktop only) ───────── */}
            <aside className="hidden lg:block lg:sticky lg:top-20 space-y-3">
              <SessionPanel
                currentIndex={currentIndex}
                total={queue.length}
                due={dueCount}
                fresh={newCount}
              />
              <FsrsPanel item={current} />
              <HarvestPanel items={harvested} />
              <ContextPanel item={current} />
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

/* ─────────────────────── Sentence card ─────────────────────── */

function DrillCard({
  item,
  onNext,
  compact = false,
}: {
  item: ReturnType<typeof useSentenceStore.getState>['queue'][number];
  onNext: () => void;
  compact?: boolean;
}) {
  const { sentence, kind } = item;
  const isPhrase = useMemo(() => looksLikePhrase(sentence.english), [sentence.english]);

  const [example, setExample] = useState<AutoExample | null>(() =>
    isPhrase ? getCachedExample(sentence.id) : null,
  );
  const [exampleLoading, setExampleLoading] = useState(false);
  const [revealEnglish, setRevealEnglish] = useState(false);
  const [revealExampleEn, setRevealExampleEn] = useState(false);

  // Reset reveal state when the sentence changes
  useEffect(() => {
    setRevealEnglish(false);
    setRevealExampleEn(false);
    if (isPhrase) {
      const cached = getCachedExample(sentence.id);
      setExample(cached);
    } else {
      setExample(null);
    }
  }, [sentence.id, isPhrase]);

  async function handleGenerateExample() {
    if (exampleLoading) return;
    setExampleLoading(true);
    try {
      const ex = await getAutoExample(sentence.id, sentence.english, sentence.persian);
      setExample(ex);
    } finally {
      setExampleLoading(false);
    }
  }

  function speak(text: string, lang: 'en' | 'fa') {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'fa' ? 'fa-IR' : 'en-US';
      u.rate = 0.95;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) {
      console.warn('TTS failed', e);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={kind === 'new' ? 'default' : 'secondary'} className="text-[10px]">
            {kind === 'new' ? 'New' : 'Review'}
          </Badge>
          {sentence.cefrLevel && (
            <Badge variant="outline" className="text-[10px]">{sentence.cefrLevel}</Badge>
          )}
          {isPhrase && (
            <Badge variant="outline" className="text-[10px]">عبارت</Badge>
          )}
          {sentence.examTaskType && (
            <Badge variant="outline" className="text-[10px]">{sentence.examTaskType}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <FlagButton sentenceId={sentence.id} size="sm" />
          {sentence.audioUrl && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => void new Audio(sentence.audioUrl!).play()}
              aria-label="Play audio"
            >
              <Volume2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 1) Persian first — what the learner needs to express */}
        {sentence.persian && (
          <div dir="rtl" className="rounded-md bg-muted/40 p-3 text-right">
            <div className="mb-0.5 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                فارسی
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => speak(sentence.persian!, 'fa')}
                aria-label="پخش فارسی"
              >
                <Volume2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-base leading-relaxed">{sentence.persian}</p>
          </div>
        )}

        {/* 2) English — hidden until the learner has tried, then revealed */}
        <div className="rounded-md border bg-card p-3">
          <div className="mb-0.5 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              English
            </p>
            <div className="flex items-center gap-1">
              {revealEnglish && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => speak(sentence.english, 'en')}
                  aria-label="Play English"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                </Button>
              )}
              {!revealEnglish && sentence.persian && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setRevealEnglish(true)}
                >
                  نمایش
                </Button>
              )}
            </div>
          </div>
          <p
            className={`font-medium leading-snug ${compact ? 'text-base' : 'text-xl'} ${
              !revealEnglish && sentence.persian ? 'select-none blur-sm' : ''
            }`}
            onClick={() => !revealEnglish && setRevealEnglish(true)}
          >
            {sentence.english}
          </p>
        </div>

        {/* 3) Example — only for short phrases. Auto-generated, cached. */}
        {isPhrase && (
          <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Wand2 className="h-3 w-3" /> مثال در جمله
              </p>
              {!example && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={handleGenerateExample}
                  disabled={exampleLoading}
                >
                  {exampleLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    'ساخت مثال'
                  )}
                </Button>
              )}
            </div>
            {example ? (
              <div className="space-y-2">
                {/* Persian example first */}
                <div dir="rtl" className="text-right">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] uppercase text-muted-foreground">FA</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => speak(example.persian, 'fa')}
                      aria-label="پخش مثال فارسی"
                    >
                      <Volume2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-sm leading-relaxed">{example.persian}</p>
                </div>
                {/* English example, blurred until reveal */}
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] uppercase text-muted-foreground">EN</p>
                    <div className="flex items-center gap-1">
                      {revealExampleEn ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => speak(example.english, 'en')}
                          aria-label="Play example English"
                        >
                          <Volume2 className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-[9px]"
                          onClick={() => setRevealExampleEn(true)}
                        >
                          نمایش
                        </Button>
                      )}
                    </div>
                  </div>
                  <p
                    className={`text-sm leading-snug ${
                      !revealExampleEn ? 'select-none blur-sm' : ''
                    }`}
                    onClick={() => !revealExampleEn && setRevealExampleEn(true)}
                  >
                    {example.english}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                این یک عبارت کوتاه است — یک مثال جمله‌ای کوتاه هم بسازم؟
              </p>
            )}
          </div>
        )}

        {!compact && sentence.expectedIntent && (
          <div className="rounded-md border border-dashed p-2.5 text-xs">
            <span className="font-medium">Intent:</span>{' '}
            <span className="text-muted-foreground">{sentence.expectedIntent}</span>
          </div>
        )}
        <Separator />
        <div className="flex items-center justify-end">
          <Button size="sm" onClick={onNext}>Next →</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────── Right-pane panels ─────────────────────── */

function SessionPanel({
  currentIndex, total, due, fresh,
}: {
  currentIndex: number; total: number; due: number; fresh: number;
}) {
  const pct = total ? Math.round(((currentIndex + 1) / total) * 100) : 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="h-4 w-4 text-primary" /> Session
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="tabular-nums font-medium">
              {Math.min(currentIndex + 1, total)} / {total}
            </span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-md border bg-muted/30 p-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Due</p>
            <p className="text-lg font-semibold tabular-nums">{due}</p>
          </div>
          <div className="rounded-md border bg-muted/30 p-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">New</p>
            <p className="text-lg font-semibold tabular-nums">{fresh}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FsrsPanel({
  item,
}: {
  item: ReturnType<typeof useSentenceStore.getState>['queue'][number];
}) {
  const { progress } = item;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-primary" /> FSRS
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {progress ? (
          <>
            <Row label="State" value={progress.state} />
            <Row label="Reps" value={String(progress.reps)} />
            <Row label="Lapses" value={String(progress.lapses)} />
            <Row label="Stability" value={progress.stability.toFixed(1)} />
            <Row label="Difficulty" value={progress.difficulty.toFixed(1)} />
            <Row
              label="Next"
              value={new Date(progress.nextReviewDate).toLocaleDateString()}
            />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">First time seeing this sentence.</p>
        )}
      </CardContent>
    </Card>
  );
}

function HarvestPanel({ items }: { items: string[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Harvested
          </span>
          <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sophisticated phrases the AI uses during roleplay will appear here.
          </p>
        ) : (
          <ScrollArea className="max-h-48">
            <ul className="space-y-1 pr-2">
              {items.map((text, i) => (
                <li
                  key={i}
                  className="rounded-md border bg-muted/30 px-2 py-1.5 text-xs leading-snug"
                >
                  {text}
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function ContextPanel({
  item,
}: {
  item: ReturnType<typeof useSentenceStore.getState>['queue'][number];
}) {
  const { sentence } = item;
  const hasAny =
    sentence.grammarFocus.length > 0 ||
    sentence.vocabularyTags.length > 0 ||
    sentence.commonMistakes.length > 0;
  if (!hasAny) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="h-4 w-4 text-primary" /> Context
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {sentence.grammarFocus.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Grammar
            </p>
            <div className="flex flex-wrap gap-1">
              {sentence.grammarFocus.map((g) => (
                <Badge key={g} variant="outline" className="text-[10px]">{g}</Badge>
              ))}
            </div>
          </div>
        )}
        {sentence.vocabularyTags.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Tag className="h-3 w-3" /> Vocabulary
            </p>
            <div className="flex flex-wrap gap-1">
              {sentence.vocabularyTags.map((v) => (
                <Badge key={v} variant="secondary" className="text-[10px]">{v}</Badge>
              ))}
            </div>
          </div>
        )}
        {sentence.commonMistakes.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <AlertTriangle className="h-3 w-3 text-amber-500" /> Pitfalls
            </p>
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              {sentence.commonMistakes.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
