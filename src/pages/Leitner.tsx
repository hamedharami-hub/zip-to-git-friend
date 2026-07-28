import { usePageMeta } from "@/hooks/usePageMeta";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Layers,
  LineChart,
  Zap,
  Headphones,
  Star,
  Repeat,
  Download,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLeitnerStore } from "@/store/leitnerStore";
import { useLeitnerFolderStore } from "@/store/leitnerFolderStore";
import { ReviewMode, type ReviewProfile } from "@/components/leitner/ReviewMode";
import { FoldersSidebar } from "@/components/leitner/FoldersSidebar";
import { CardList } from "@/components/leitner/CardList";
import { CardEditor } from "@/components/leitner/CardEditor";
import { StatsExtras } from "@/components/leitner/StatsExtras";
import { AccountButton, SyncBadge } from "@/components/auth/AccountButton";
import { downloadBackup, importBackupFromFile } from "@/lib/leitnerBackup";
import { toast } from "sonner";
import type { LeitnerCard } from "@/types";

const PROFILES: Array<{ key: ReviewProfile; label: string; icon: typeof Zap; hint: string }> = [
  { key: "due", label: "Due", icon: Brain, hint: "All cards scheduled for today" },
  { key: "quick", label: "Quick 10", icon: Zap, hint: "Top 10 due cards — a 5 min sprint" },
  { key: "cram", label: "Cram", icon: Repeat, hint: "Review every card (ignore schedule)" },
  {
    key: "listening",
    label: "Listening",
    icon: Headphones,
    hint: "Audio first — guess before you see",
  },
  { key: "starred", label: "Starred", icon: Star, hint: "Only your flagged cards" },
];

const BOX_META: Array<{ box: 1 | 2 | 3 | 4 | 5; label: string; interval: string }> = [
  { box: 1, label: "Box 1", interval: "1 day" },
  { box: 2, label: "Box 2", interval: "3 days" },
  { box: 3, label: "Box 3", interval: "7 days" },
  { box: 4, label: "Box 4", interval: "14 days" },
  { box: 5, label: "Box 5", interval: "30 days" },
];

const Leitner = () => {
  usePageMeta({
    title: "Leitner — Language Learning Player",
    description: "مرور واژگان با روش لایتنر — تمرین هوشمند برای حفظ ماندگار.",
  });
  const cards = useLeitnerStore((s) => s.cards);
  const loadCards = useLeitnerStore((s) => s.load);
  const folders = useLeitnerFolderStore((s) => s.folders);
  const loadFolders = useLeitnerFolderStore((s) => s.load);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [tab, setTab] = useState<"browse" | "review" | "stats">("browse");
  const [editing, setEditing] = useState<LeitnerCard | null>(null);
  const [profile, setProfile] = useState<ReviewProfile>("due");

  const stats = useMemo(() => {
    const now = Date.now();
    const list = folderId ? cards.filter((c) => c.folderId === folderId) : cards;
    const s = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, total: 0, due: 0 } as Record<string, number>;
    for (const c of list) {
      s[c.box] += 1;
      s.total += 1;
      if (c.nextReview <= now) s.due += 1;
    }
    return s as {
      1: number;
      2: number;
      3: number;
      4: number;
      5: number;
      total: number;
      due: number;
    };
  }, [cards, folderId]);

  // Keep `editing` in sync with the underlying card (after AI updates).
  useEffect(() => {
    if (!editing) return;
    const fresh = cards.find((c) => c.id === editing.id);
    if (!fresh) {
      setEditing(null);
    } else if (fresh !== editing) {
      setEditing(fresh);
    }
  }, [cards, editing]);

  useEffect(() => {}, []);

  const handleExport = () => {
    downloadBackup(cards, folders);
    toast.success("Backup downloaded");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await importBackupFromFile(file);
      await loadCards();
      await loadFolders();
      toast.success(
        `Imported ${res.cardsAdded} cards, ${res.foldersAdded} folders (skipped ${res.cardsSkipped + res.foldersSkipped})`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--surface))] text-foreground">
      <header className="m3-top-app-bar sticky top-0 z-30 border-b border-outline-variant/40">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <Link to="/">
            <Button variant="ghost" size="sm" className="rounded-full gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Home
            </Button>
          </Link>
          <h1 className="text-[15px] font-semibold flex items-center gap-2">
            <span className="h-9 w-9 rounded-2xl bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))] flex items-center justify-center">
              <Brain className="h-4 w-4" />
            </span>
            Leitner
          </h1>
          <AccountButton />
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[hsl(var(--primary-container))] via-[hsl(var(--surface-container))] to-[hsl(var(--tertiary-container))] p-6 sm:p-8">
          <div
            aria-hidden
            className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-[hsl(var(--primary)/0.18)] blur-3xl"
          />
          <div className="relative flex items-end justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-[hsl(var(--on-surface-variant))]">
                Spaced repetition
              </p>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[hsl(var(--on-primary-container))] leading-tight">
                مرور هوشمند
              </h2>
              <p className="text-sm text-[hsl(var(--on-surface-variant))] inline-flex items-center gap-2 flex-wrap">
                <span>
                  {stats.total} کارت ·{" "}
                  <span className="text-[hsl(var(--primary))] font-semibold">
                    {stats.due} آماده الان
                  </span>
                </span>
                <SyncBadge />
              </p>
            </div>
            <Button
              onClick={() => setTab("review")}
              disabled={stats.due === 0}
              size="lg"
              className="rounded-full h-12 px-6 gap-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90 m3-elevation-2"
            >
              <Layers className="h-4 w-4" />
              مرور {stats.due} کارت
            </Button>
          </div>
        </section>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-6">
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="browse" className="gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Browse
            </TabsTrigger>
            <TabsTrigger value="review" className="gap-1.5">
              <Brain className="h-3.5 w-3.5" />
              Review
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5">
              <LineChart className="h-3.5 w-3.5" />
              Stats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-6">
            <div className="flex flex-col lg:flex-row gap-6">
              <FoldersSidebar
                selectedId={folderId}
                onSelect={setFolderId}
                onReview={(id) => {
                  setFolderId(id);
                  setProfile("due");
                  setTab("review");
                }}
              />
              <div className="flex-1 min-w-0 space-y-4">
                <CardList folderId={folderId} onEdit={setEditing} />
                {editing && <CardEditor card={editing} onClose={() => setEditing(null)} />}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="review" className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Reviewing {folderId ? "this folder" : "all folders"}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setTab("browse")}>
                Back to browse
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {PROFILES.map((p) => {
                const Icon = p.icon;
                const active = profile === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => setProfile(p.key)}
                    title={p.hint}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {p.label}
                  </button>
                );
              })}
            </div>
            <ReviewMode
              key={`${profile}-${folderId ?? "all"}`}
              folderId={folderId}
              profile={profile}
              audioOnly={profile === "listening"}
              onEmpty={() => {
                /* stay on screen */
              }}
            />
          </TabsContent>

          <TabsContent value="stats" className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {BOX_META.map((m, i) => {
                const tones = [
                  "bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]",
                  "bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]",
                  "bg-[hsl(var(--tertiary-container))] text-[hsl(var(--on-tertiary-container))]",
                  "bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]",
                  "bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]",
                ];
                return (
                  <div
                    key={m.box}
                    className={`rounded-[20px] p-5 text-center ${tones[i]} m3-elevation-1`}
                  >
                    <p className="text-[10px] uppercase tracking-[0.12em] opacity-70 font-medium">
                      {m.label}
                    </p>
                    <p className="text-4xl font-semibold mt-1.5 tabular-nums">{stats[m.box]}</p>
                    <p className="text-[11px] opacity-70 mt-1">{m.interval}</p>
                  </div>
                );
              })}
            </div>
            {stats.total > 0 && <StatsExtras cards={cards} folderId={folderId} />}
            {stats.total === 0 && (
              <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
                No cards yet. Add words from subtitle analyses, books, or news.
              </div>
            )}

            <section className="rounded-[20px] border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">پشتیبان‌گیری</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    خروجی یا ورودی JSON تمام کارت‌ها و فولدرها
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExport}
                    disabled={cards.length === 0 && folders.length === 0}
                  >
                    <Download className="h-4 w-4 mr-1.5" />
                    خروجی
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => importInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-1.5" />
                    ورودی
                  </Button>
                </div>
              </div>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImport}
              />
            </section>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Leitner;
