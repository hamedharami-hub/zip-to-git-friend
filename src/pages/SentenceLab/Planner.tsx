import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  Play,
  Trash2,
  Wand2,
  Check,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSettingsStore } from "@/store/settingsStore";
import { fetchTopCategories, type CategoryWithStats } from "@/lib/sentenceCategories";
import {
  saveScenario,
  listScenarios,
  deleteScenario,
  type CachedScenario,
  type ScenarioStep,
} from "@/lib/scenarioOfflineCache";
import { speak } from "@/lib/leitnerTts";

export default function SentencePlanner() {
  const navigate = useNavigate();
  const [cats, setCats] = useState<CategoryWithStats[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [topic, setTopic] = useState("");
  const [role, setRole] = useState("Pharmacist");
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState<CachedScenario[]>([]);
  const [active, setActive] = useState<CachedScenario | null>(null);
  const sentenceLabModelRef = useSettingsStore((s) => s.settings.sentenceLabModelRef);

  async function loadAll() {
    try {
      const [c, s] = await Promise.all([fetchTopCategories(), listScenarios()]);
      setCats(c);
      setSaved(s);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  function toggle(slug: string) {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setSelected(next);
  }

  async function generate() {
    if (selected.size === 0) {
      toast.error("At least one folder");
      return;
    }
    setGenerating(true);
    try {
      const { data: rows, error } = await supabase
        .from("sentence_lab")
        .select("id, english, persian, category, subcategory")
        .eq("status", "published")
        .in("category", Array.from(selected))
        .limit(40);
      if (error) throw error;
      const sentences = (rows ?? []).sort(() => Math.random() - 0.5).slice(0, 20);
      if (sentences.length === 0) {
        toast.error("No sentences in chosen folders");
        return;
      }

      const modelId =
        sentenceLabModelRef?.provider === "gateway" ? sentenceLabModelRef.model : undefined;
      const { data, error: fnErr } = await supabase.functions.invoke("sentence-planner", {
        body: { topic: topic || "general practice", role, sentences, model: modelId },
      });
      if (fnErr) throw fnErr;
      if (!data?.steps?.length) throw new Error("No steps returned");

      const scenario: CachedScenario = {
        id: `sc_${Date.now()}`,
        title: data.title ?? "Scenario",
        scenario: data.scenario ?? "",
        topic,
        role,
        steps: data.steps as ScenarioStep[],
        createdAt: Date.now(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
        sentenceIds: sentences.map((s: any) => s.id),
      };
      await saveScenario(scenario);
      setSaved(await listScenarios());
      setActive(scenario);
      toast.success("Scenario ready");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  if (active) {
    return <ScenarioPlayer scenario={active} onClose={() => setActive(null)} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/sentence-lab")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold leading-none">
              <Wand2 className="h-4 w-4 text-primary" /> AI Planner
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              سناریوی ترکیبی از فولدرهای انتخاب‌شده
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-6 px-4 py-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="topic">Topic / موضوع</Label>
                <Input
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Dispensing antibiotics"
                />
              </div>
              <div>
                <Label htmlFor="role">Role / نقش</Label>
                <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} />
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Folders / فولدرها</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {cats.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.slug)}
                    className={`flex items-center justify-between rounded-lg border p-3 text-start transition ${
                      selected.has(c.slug) ? "border-primary bg-primary/10" : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox checked={selected.has(c.slug)} />
                      <div>
                        <div className="text-sm font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.sentenceCount} sentences
                        </div>
                      </div>
                    </div>
                    {selected.has(c.slug) && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={generate}
              disabled={generating || selected.size === 0}
              className="w-full"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate scenario
            </Button>
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Offline scenarios ({saved.length})
          </h2>
          {saved.length === 0 ? (
            <p className="text-xs text-muted-foreground">هیچ سناریوی ذخیره‌شده‌ای نیست.</p>
          ) : (
            <div className="space-y-2">
              {saved.map((s) => (
                <Card
                  key={s.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setActive(s)}
                >
                  <CardContent className="flex items-center justify-between gap-2 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{s.title}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-[10px]">
                          {s.steps.length} steps
                        </Badge>
                        {s.topic && <span className="truncate">{s.topic}</span>}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActive(s);
                      }}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await deleteScenario(s.id);
                        setSaved(await listScenarios());
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ScenarioPlayer({ scenario, onClose }: { scenario: CachedScenario; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const step = scenario.steps[idx];
  const total = scenario.steps.length;
  const progress = useMemo(() => Math.round(((idx + 1) / total) * 100), [idx, total]);

  if (!step) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{scenario.title}</div>
            <div className="text-xs text-muted-foreground">
              Step {idx + 1} / {total} · {progress}%
            </div>
          </div>
        </div>
        <div className="h-1 bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <main className="container mx-auto max-w-2xl space-y-4 px-4 py-6">
        {scenario.scenario && idx === 0 && (
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">
              {scenario.scenario}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                موقعیت
              </div>
              <div dir="rtl" className="text-base leading-relaxed">
                {step.prompt_fa}
              </div>
              {step.prompt_en && (
                <div className="mt-2 text-xs italic text-muted-foreground">"{step.prompt_en}"</div>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Your line
                </div>
                <Button size="sm" variant="ghost" onClick={() => speak(step.target_english)}>
                  🔊
                </Button>
              </div>
              {revealed ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-base font-medium">
                  {step.target_english}
                </div>
              ) : (
                <button
                  onClick={() => setRevealed(true)}
                  className="w-full rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:bg-muted"
                >
                  اول خودت بگو، بعد کلیک کن تا انگلیسی نشان داده بشه
                </button>
              )}
              {step.hint && revealed && (
                <p className="mt-2 text-xs text-muted-foreground">💡 {step.hint}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={idx === 0}
            onClick={() => {
              setIdx(idx - 1);
              setRevealed(false);
            }}
            className="flex-1"
          >
            Prev
          </Button>
          {idx < total - 1 ? (
            <Button
              onClick={() => {
                setIdx(idx + 1);
                setRevealed(false);
              }}
              className="flex-1"
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={onClose} className="flex-1">
              Finish
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
