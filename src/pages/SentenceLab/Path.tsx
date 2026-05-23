import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Layers, Lock, CheckCircle2, Play, Home, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  fetchCategoryBySlug, type SentenceCategory,
} from '@/lib/sentenceCategories';
import {
  fetchPathSteps, summarizeSteps, type PathStep,
} from '@/lib/pathProgress';

const LEVEL_BLURB: Record<string, string> = {
  A1: 'پایه — اولین قدم‌ها',
  A2: 'مقدماتی — جمله‌های ساده',
  B1: 'متوسط — مکالمه روزمره',
  B2: 'متوسط بالا — روان‌تر و ظریف‌تر',
  C1: 'پیشرفته — طبیعی و ماهرانه',
  C2: 'تسلط — هم‌سطح بومی',
};

export default function SentencePathPage() {
  const { categorySlug = '', subSlug = '' } = useParams<{
    categorySlug: string;
    subSlug: string;
  }>();
  const navigate = useNavigate();
  const [cat, setCat] = useState<SentenceCategory | null>(null);
  const [sub, setSub] = useState<SentenceCategory | null>(null);
  const [steps, setSteps] = useState<PathStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [c, s] = await Promise.all([
        fetchCategoryBySlug(categorySlug),
        subSlug && subSlug !== 'all' ? fetchCategoryBySlug(subSlug) : Promise.resolve(null),
      ]);
      setCat(c);
      setSub(s);
      const ps = await fetchPathSteps(categorySlug, subSlug);
      setSteps(ps);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load path');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [categorySlug, subSlug]);

  const summary = summarizeSteps(steps);
  const title = sub?.name ?? cat?.name ?? subSlug;
  const crumb = sub ? cat?.name ?? 'Sentence Lab' : 'Sentence Lab';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
              aria-label="Home"
              className="h-8 w-8 shrink-0"
            >
              <Home className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/sentence-lab/${categorySlug}`)}
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
              </h1>
            </div>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {summary.mastered}/{summary.total} mastered
          </Badge>
        </div>
        <div className="h-0.5 w-full bg-muted">
          <div
            className="h-0.5 bg-primary transition-all"
            style={{ width: `${Math.round(summary.progress * 100)}%` }}
          />
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-3 py-5 sm:px-4 sm:py-7">
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        ) : steps.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              هنوز جمله‌ای در این بخش وجود ندارد.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Drill-all shortcut */}
            <Link
              to={`/sentence-lab/${categorySlug}/${subSlug}/all`}
              className="mb-5 flex items-center justify-between rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 transition-colors hover:border-primary hover:bg-primary/10"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/15 p-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">صف ترکیبی همه سطوح</p>
                  <p className="text-xs text-muted-foreground">
                    AI و FSRS مرور هوشمند از تمام پله‌ها
                  </p>
                </div>
              </div>
              <span className="text-xs text-primary">شروع →</span>
            </Link>

            <div className="relative">
              {/* Vertical connector line */}
              <div className="absolute left-[27px] top-3 bottom-3 w-px bg-border" />

              <ol className="space-y-3">
                {steps.map((step, idx) => (
                  <PathRung
                    key={step.level}
                    step={step}
                    index={idx}
                    locked={
                      idx > 0 &&
                      steps[idx - 1].progress < 0.4 &&
                      !step.isActive &&
                      step.seen === 0
                    }
                    href={`/sentence-lab/${categorySlug}/${subSlug}/${step.level}`}
                  />
                ))}
              </ol>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function PathRung({
  step, index, locked, href,
}: {
  step: PathStep;
  index: number;
  locked: boolean;
  href: string;
}) {
  const pct = Math.round(step.progress * 100);
  const isComplete = step.progress >= 0.9 && step.total > 0;

  const dotClass = isComplete
    ? 'bg-emerald-500 text-white border-emerald-500'
    : step.isActive
      ? 'bg-primary text-primary-foreground border-primary ring-4 ring-primary/20'
      : locked
        ? 'bg-muted text-muted-foreground border-border'
        : 'bg-card text-foreground border-border';

  const cardClass = step.isActive
    ? 'border-primary/50 bg-primary/5 hover:bg-primary/10'
    : locked
      ? 'opacity-60 hover:opacity-80'
      : 'hover:border-primary/40 hover:bg-accent/40';

  const Inner = (
    <div className="flex items-center gap-3">
      <div
        className={`relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 font-semibold ${dotClass}`}
      >
        {isComplete ? (
          <CheckCircle2 className="h-6 w-6" />
        ) : locked ? (
          <Lock className="h-5 w-5" />
        ) : (
          <span className="text-sm">{step.level}</span>
        )}
      </div>
      <div className={`flex-1 rounded-xl border p-3 transition-colors ${cardClass}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              مرحله {index + 1} · {step.level}
              {step.isActive && (
                <Badge className="text-[9px]">فعلی</Badge>
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground" dir="rtl">
              {LEVEL_BLURB[step.level] ?? ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">جمله‌ها</p>
            <p className="text-sm font-semibold tabular-nums">
              {step.mastered}/{step.total}
            </p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Progress value={pct} className="h-1.5 flex-1" />
          <span className="text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        {!locked && (
          <div className="mt-2 flex items-center justify-end">
            <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
              <Play className="h-3 w-3" /> {step.seen === 0 ? 'شروع' : 'ادامه'}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  if (locked) {
    return <li className="block">{Inner}</li>;
  }
  return (
    <li>
      <Link to={href} className="block">{Inner}</Link>
    </li>
  );
}
