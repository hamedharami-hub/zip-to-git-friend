import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Folder,
  Hand,
  Heart,
  MessageCircle,
  HelpCircle,
  Sparkles,
  Mic,
  GitBranch,
  Calendar,
  Clock,
  Pill,
  Stethoscope,
  GraduationCap,
  ShoppingBag,
  Briefcase,
  Layers,
  Drama,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  fetchSubcategories,
  fetchCategoryBySlug,
  type CategoryWithStats,
  type SentenceCategory,
} from "@/lib/sentenceCategories";
import { CreateCategoryDialog } from "@/components/sentence-lab/CreateCategoryDialog";
import { ImportSentencesDialog } from "@/components/sentence-lab/ImportSentencesDialog";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Folder,
  Hand,
  Heart,
  MessageCircle,
  HelpCircle,
  Sparkles,
  Mic,
  GitBranch,
  Calendar,
  Clock,
  Pill,
  Stethoscope,
  GraduationCap,
  ShoppingBag,
  Briefcase,
  Layers,
};

export default function SentenceCategoryPage() {
  const { categorySlug = "" } = useParams<{ categorySlug: string }>();
  const navigate = useNavigate();
  const [cat, setCat] = useState<SentenceCategory | null>(null);
  const [subs, setSubs] = useState<CategoryWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const c = await fetchCategoryBySlug(categorySlug);
      setCat(c);
      const s = await fetchSubcategories(categorySlug);
      setSubs(s);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [categorySlug]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/sentence-lab")}
              aria-label="Back to categories"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Sentence Lab
              </p>
              <h1 className="truncate text-base font-semibold leading-none">
                {cat?.name ?? categorySlug}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Import</span>
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Sub-topic</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* All-of-category quick action */}
        {cat && (
          <Link
            to={`/sentence-lab/${cat.slug}/all/all`}
            className="mb-4 flex items-center justify-between rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 transition-colors hover:border-primary hover:bg-primary/10"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/15 p-2">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Drill all {cat.name}</p>
                <p className="text-xs text-muted-foreground">
                  Mixed daily queue across every sub-topic
                </p>
              </div>
            </div>
            <span className="text-xs text-primary">Start →</span>
          </Link>
        )}

        {loading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : subs.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No sub-topics yet in this category.
              <br />
              Use <strong>+ Sub-topic</strong> or <strong>Import</strong> to add some.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {subs.map((s) => {
              const Icon = ICONS[s.icon ?? "Folder"] ?? Folder;
              return (
                <div
                  key={s.id}
                  className="rounded-xl border bg-card transition-colors hover:border-primary/50"
                >
                  <Link
                    to={`/sentence-lab/${categorySlug}/${s.slug}`}
                    className="group flex items-center justify-between gap-3 p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-lg bg-muted/60 p-2 group-hover:bg-primary/15">
                        <Icon className="h-4 w-4 text-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        {s.description && (
                          <p className="truncate text-xs text-muted-foreground">{s.description}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {s.sentenceCount}
                    </Badge>
                  </Link>
                  {s.sentenceCount >= 3 && (
                    <Link
                      to={`/sentence-lab/${categorySlug}/${s.slug}/scenario`}
                      className="flex items-center justify-between gap-2 border-t border-dashed px-4 py-2 text-xs text-primary hover:bg-primary/5"
                    >
                      <span className="flex items-center gap-1.5">
                        <Drama className="h-3.5 w-3.5" /> Live scenario from these sentences
                      </span>
                      <span>→</span>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Whole-category scenario CTA */}
        {cat && subs.some((s) => s.sentenceCount >= 3) && (
          <Link
            to={`/sentence-lab/${cat.slug}/all/scenario`}
            className="mt-4 flex items-center justify-between rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 transition-colors hover:border-primary hover:bg-primary/10"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/15 p-2">
                <Drama className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">🎭 Scenario across all of {cat.name}</p>
                <p className="text-xs text-muted-foreground">
                  Real conversation that uses your drilled sentences
                </p>
              </div>
            </div>
            <span className="text-xs text-primary">Start →</span>
          </Link>
        )}
      </main>

      <CreateCategoryDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        parentSlug={categorySlug}
        onCreated={() => {
          setShowCreate(false);
          void load();
        }}
      />
      <ImportSentencesDialog
        open={showImport}
        onOpenChange={setShowImport}
        categorySlug={categorySlug}
        subcategories={subs}
        onImported={() => {
          setShowImport(false);
          void load();
        }}
      />
    </div>
  );
}
