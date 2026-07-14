import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Pill,
  Stethoscope,
  Globe2,
  Sparkles,
  Flag,
  Wand2,
  Folder,
  MessageCircle,
  GraduationCap,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { GamificationHUD } from "@/components/sentence-lab/GamificationHUD";

const QUICK_SLUGS = ["grammar", "aussie_life", "professional", "general"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
const QUICK_ICONS: Record<string, any> = {
  grammar: GraduationCap,
  aussie_life: Globe2,
  professional: Briefcase,
  general: MessageCircle,
};

interface QuickCat {
  slug: string;
  name: string;
  count: number;
}

export default function SentenceLabPage() {
  const navigate = useNavigate();
  const [quick, setQuick] = useState<QuickCat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data: cats } = await supabase
        .from("sentence_categories")
        .select("slug, name")
        .in("slug", QUICK_SLUGS);
      const { data: counts } = await supabase
        .from("sentence_lab")
        .select("category")
        .eq("status", "published")
        .in("category", QUICK_SLUGS);
      const map = new Map<string, number>();
      for (const c of counts ?? []) {
        if (c.category) map.set(c.category, (map.get(c.category) ?? 0) + 1);
      }
      const ordered: QuickCat[] = QUICK_SLUGS.map((slug) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
        const c = (cats ?? []).find((x: any) => x.slug === slug);
        return c ? { slug, name: c.name, count: map.get(slug) ?? 0 } : null;
      }).filter(Boolean) as QuickCat[];
      setQuick(ordered);
      setLoading(false);
    })();
  }, []);

  const domains = [
    {
      to: "/sentence-lab/domain/pharmacy",
      icon: Pill,
      title: "Pharmacy",
      sub: "تخصصی دارویی",
      gradient: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-400",
    },
    {
      to: "/sentence-lab/domain/medical",
      icon: Stethoscope,
      title: "Medical",
      sub: "تخصصی پزشکی",
      gradient: "from-rose-500/20 to-rose-500/5 border-rose-500/30 text-rose-400",
    },
    {
      to: "/sentence-lab/general",
      icon: Globe2,
      title: "General",
      sub: "انگلیسی عمومی + Paths",
      gradient: "from-sky-500/20 to-sky-500/5 border-sky-500/30 text-sky-400",
    },
  ];

  return (
    <div className="min-h-screen bg-[hsl(var(--surface))] text-foreground">
      <header className="m3-top-app-bar sticky top-0 z-30 border-b border-outline-variant/40">
        <div className="container mx-auto flex items-center justify-between gap-3 px-4 h-16">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => navigate("/")}
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-9 w-9 rounded-2xl bg-[hsl(var(--tertiary-container))] text-[hsl(var(--on-tertiary-container))] flex items-center justify-center shrink-0">
                <MessageCircle className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h1 className="text-[15px] font-semibold leading-tight truncate">Sentence Lab</h1>
                <p className="text-[11px] text-muted-foreground truncate" dir="rtl">
                  یک حوزه را انتخاب کن
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <GamificationHUD />
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full"
              onClick={() => navigate("/sentence-lab/leitner")}
            >
              <Flag className="h-4 w-4" />
              <span className="hidden sm:inline">پرچم‌ها</span>
            </Button>
            <Button
              size="sm"
              className="rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
              onClick={() => navigate("/sentence-lab/planner")}
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">AI Planner</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-5">
        {/* 3 domain cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          {domains.map((d) => (
            <Link
              key={d.to}
              to={d.to}
              className={`group flex flex-col gap-3 overflow-hidden rounded-2xl border bg-gradient-to-br ${d.gradient} p-5 transition-all hover:scale-[1.02] hover:shadow-lg`}
            >
              <div className="rounded-xl bg-background/40 p-2.5 w-fit">
                <d.icon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold leading-tight text-foreground">{d.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground" dir="rtl">
                  {d.sub}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Quick access */}
        <div className="mt-7">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            دسترسی سریع
          </h2>
          {loading ? (
            <div className="flex min-h-[20vh] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {quick.map((c) => {
                const Icon = QUICK_ICONS[c.slug] ?? Folder;
                return (
                  <Link
                    key={c.slug}
                    to={`/sentence-lab/${c.slug}`}
                    className="flex items-center justify-between rounded-xl border bg-card p-3.5 transition-colors hover:border-primary/50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-lg bg-muted/60 p-2">
                        <Icon className="h-4 w-4" />
                      </div>
                      <p className="truncate text-sm font-medium">{c.name}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {c.count}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => navigate("/sentence-lab/admin")}
          >
            <Wand2 className="h-3.5 w-3.5 mr-1" />
            تکمیل خودکار محتوا
          </Button>
        </div>
      </main>
    </div>
  );
}
