import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Headphones,
  Mic,
  BarChart3,
  Home,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSentenceStore } from "@/store/sentenceStore";
import { PodcastMode } from "@/components/sentence-lab/PodcastMode";
import { RoleplayMode } from "@/components/sentence-lab/RoleplayMode";
import { GamificationHUD } from "@/components/sentence-lab/GamificationHUD";
import { DrillCard } from "@/components/sentence-lab/DrillCard";
import {
  SessionPanel,
  FsrsPanel,
  HarvestPanel,
  ContextPanel,
} from "@/components/sentence-lab/DrillPanels";
import { fetchCategoryBySlug, type SentenceCategory } from "@/lib/sentenceCategories";
import { fetchPath, type SentencePath } from "@/lib/sentencePaths";

type Mode = "drill" | "roleplay";

export default function SentenceDrillPage() {
  const params = useParams<{
    categorySlug?: string;
    subSlug?: string;
    level?: string;
    pathId?: string;
  }>();
  const categorySlug = params.categorySlug ?? "";
  const subSlug = params.subSlug ?? "";
  const level = params.level ?? "";
  const pathId = params.pathId ?? "";
  const navigate = useNavigate();

  const { queue, currentIndex, loading, error, fetchDailyQueue, next } = useSentenceStore(
    useShallow((s) => ({
      queue: s.queue,
      currentIndex: s.currentIndex,
      loading: s.loading,
      error: s.error,
      fetchDailyQueue: s.fetchDailyQueue,
      next: s.next,
    })),
  );

  const [category, setCategory] = useState<SentenceCategory | null>(null);
  const [sub, setSub] = useState<SentenceCategory | null>(null);
  const [path, setPath] = useState<SentencePath | null>(null);
  const [mode, setMode] = useState<Mode>("drill");
  const [harvested, setHarvested] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      if (pathId) {
        const p = await fetchPath(pathId);
        setPath(p);
        setCategory(null);
        setSub(null);
      } else {
        const c = await fetchCategoryBySlug(categorySlug);
        setCategory(c);
        const s = subSlug && subSlug !== "all" ? await fetchCategoryBySlug(subSlug) : null;
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
    const subFilter = subSlug && subSlug !== "all" ? subSlug : null;
    const levelFilter = level && level !== "all" ? level : null;
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

  const dueCount = useMemo(() => queue.filter((q) => q.kind === "due").length, [queue]);
  const newCount = queue.length - dueCount;

  const title = path?.name ?? sub?.name ?? category?.name ?? categorySlug;
  const crumb = path ? "Sentence Path" : sub ? category?.name : "Sentence Lab";

  const handleHarvest = useCallback((texts: string[]) => {
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
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
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
                else navigate("/sentence-lab");
              }}
              aria-label="Back"
              className="h-8 w-8 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{crumb}</p>
              <h1 className="truncate text-sm font-semibold leading-tight sm:text-base">
                {title}
                {level && level !== "all" && (
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
              {queue.length ? `${currentIndex + 1}/${queue.length}` : "—"}
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
                    subcategory: subSlug && subSlug !== "all" ? subSlug : null,
                    cefrLevel: level && level !== "all" ? level : null,
                  });
                }
              }}
              disabled={loading}
              aria-label="Refresh"
              className="h-8 w-8"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        <div className="h-0.5 w-full bg-muted">
          <div className="h-0.5 bg-primary transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </header>

      <main className="container mx-auto px-3 py-4 sm:px-4 sm:py-6">
        {loading && queue.length === 0 ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card className="mx-auto max-w-md">
            <CardContent className="py-8 text-center text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : !current ? (
          <Card className="mx-auto max-w-md">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No sentences here yet. Try the <strong>Import</strong> button on the previous screen.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
            {/* ───────── LEFT PANE ───────── */}
            <section className="space-y-4 min-w-0">
              {/* Mode selector */}
              <div className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-1">
                <button
                  onClick={() => setMode("drill")}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    mode === "drill"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  <Headphones className="h-4 w-4" />
                  Podcast Drill
                </button>
                <button
                  onClick={() => setMode("roleplay")}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    mode === "roleplay"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  <Mic className="h-4 w-4" />
                  Live Roleplay
                </button>
              </div>

              {mode === "drill" ? (
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
