import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Plus, Sparkles, Sprout, Briefcase,
  MessageCircle, Folder, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  fetchTopCategories, type CategoryWithStats,
} from '@/lib/sentenceCategories';
import {
  fetchPaths, deletePath, type SentencePath,
} from '@/lib/sentencePaths';
import { CustomPathDialog } from '@/components/sentence-lab/CustomPathDialog';
import { toast } from '@/hooks/use-toast';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles, Sprout, Briefcase, MessageCircle, Folder,
};

const COLOR_BG: Record<string, string> = {
  emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-400',
  amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-400',
  rose: 'from-rose-500/20 to-rose-500/5 border-rose-500/30 text-rose-400',
  violet: 'from-violet-500/20 to-violet-500/5 border-violet-500/30 text-violet-400',
  sky: 'from-sky-500/20 to-sky-500/5 border-sky-500/30 text-sky-400',
};

const GENERAL_BROWSE_SLUGS = new Set([
  'general', 'business', 'aussie_life', 'professional', 'grammar',
]);

export default function SentenceGeneralPage() {
  const navigate = useNavigate();
  const [paths, setPaths] = useState<SentencePath[]>([]);
  const [cats, setCats] = useState<CategoryWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCustom, setShowCustom] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        fetchPaths('general'),
        fetchTopCategories(),
      ]);
      setPaths(p);
      setCats(c.filter((x) => GENERAL_BROWSE_SLUGS.has(x.slug)));
    } catch (e: any) {
      toast({ title: 'Failed to load', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleDelete(p: SentencePath) {
    if (!confirm(`حذف "${p.name}"؟`)) return;
    try {
      await deletePath(p.id);
      toast({ title: 'حذف شد' });
      void load();
    } catch (e: any) {
      toast({ title: 'خطا', description: e?.message, variant: 'destructive' });
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate('/sentence-lab')} aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sentence Lab</p>
              <h1 className="text-base font-semibold leading-none">General English</h1>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowCustom(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Custom Path</span>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-5">
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="paths">
            <TabsList className="mb-4 grid w-full grid-cols-2">
              <TabsTrigger value="paths">🎯 Paths</TabsTrigger>
              <TabsTrigger value="browse">📂 Browse</TabsTrigger>
            </TabsList>

            <TabsContent value="paths" className="space-y-3">
              {paths.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
                  هنوز مسیری ساخته نشده.
                </CardContent></Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {paths.map((p) => {
                    const Icon = ICONS[p.icon ?? 'Sparkles'] ?? Sparkles;
                    const color = COLOR_BG[p.color ?? 'sky'] ?? COLOR_BG.sky;
                    const totalCount = p.recipe.reduce((s, r) => s + r.count, 0);
                    return (
                      <div
                        key={p.id}
                        className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${color} p-4 transition-all hover:scale-[1.01]`}
                      >
                        <Link to={`/sentence-lab/path/${p.id}`} className="block">
                          <div className="flex items-start justify-between">
                            <div className="rounded-xl bg-background/40 p-2.5">
                              <Icon className="h-5 w-5" />
                            </div>
                            {p.isBuiltin ? (
                              <Badge variant="secondary" className="text-[10px]">Built-in</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">Custom</Badge>
                            )}
                          </div>
                          <h3 className="mt-3 text-base font-semibold leading-tight text-foreground">
                            {p.name}
                          </h3>
                          {p.description && (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2" dir="rtl">
                              {p.description}
                            </p>
                          )}
                          <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{p.recipe.length} منبع</span>
                            <span>{totalCount} جمله</span>
                          </div>
                        </Link>
                        {!p.isBuiltin && (
                          <button
                            onClick={() => handleDelete(p)}
                            className="absolute bottom-2 left-2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                            aria-label="حذف"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => setShowCustom(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-5 text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-primary/10"
              >
                <Plus className="h-4 w-4" />
                ساخت Path سفارشی
              </button>
            </TabsContent>

            <TabsContent value="browse" className="space-y-2">
              {cats.map((c) => (
                <Link
                  key={c.id}
                  to={`/sentence-lab/${c.slug}`}
                  className="flex items-center justify-between rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.name}</p>
                    {c.description && (
                      <p className="truncate text-xs text-muted-foreground">{c.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {c.sentenceCount}
                    </Badge>
                  </div>
                </Link>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </main>

      <CustomPathDialog
        open={showCustom}
        onOpenChange={setShowCustom}
        onCreated={() => { setShowCustom(false); void load(); }}
      />
    </div>
  );
}
