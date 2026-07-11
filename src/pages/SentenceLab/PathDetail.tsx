import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchPath, type SentencePath } from "@/lib/sentencePaths";
import { useSentenceStore } from "@/store/sentenceStore";

export default function SentencePathDetailPage() {
  const { pathId = "" } = useParams<{ pathId: string }>();
  const navigate = useNavigate();
  const [path, setPath] = useState<SentencePath | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const p = await fetchPath(pathId);
      setPath(p);
      setLoading(false);
    })();
  }, [pathId]);

  function startDrill() {
    if (!path) return;
    void useSentenceStore.getState().fetchDailyQueue({
      pathRecipe: path.recipe,
    });
    navigate(`/sentence-lab/path/${path.id}/drill`);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/sentence-lab/general")}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Sentence Path
            </p>
            <h1 className="truncate text-base font-semibold leading-none">{path?.name ?? "..."}</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-5">
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !path ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-destructive">
              Path not found
            </CardContent>
          </Card>
        ) : (
          <>
            {path.description && (
              <p className="mb-4 text-sm text-muted-foreground" dir="rtl">
                {path.description}
              </p>
            )}

            <button
              onClick={startDrill}
              className="mb-5 flex w-full items-center justify-between rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 transition-colors hover:border-primary hover:bg-primary/10"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/15 p-2.5">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold">شروع تمرین interleaved</p>
                  <p className="text-xs text-muted-foreground">
                    {path.recipe.reduce((s, r) => s + r.count, 0)} جمله از {path.recipe.length} منبع
                  </p>
                </div>
              </div>
              <Play className="h-5 w-5 text-primary" />
            </button>

            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              ترکیب این Path
            </h2>
            <div className="space-y-2">
              {path.recipe.map((step, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{step.subcategory}</p>
                    <p className="text-[11px] text-muted-foreground">{step.category}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    ×{step.count}
                  </Badge>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
