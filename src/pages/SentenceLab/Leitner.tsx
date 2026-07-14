import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Flag, Volume2, Trash2, Filter, Headphones, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSentenceFlagStore } from "@/store/sentenceFlagStore";
import {
  fetchFlaggedSentences,
  FLAG_COLORS,
  FLAG_COLOR_META,
  type FlagColor,
} from "@/lib/sentenceFlags";
import { FlagButton } from "@/components/sentence-lab/FlagButton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Row {
  flag: ReturnType<typeof useSentenceFlagStore.getState>["flags"][string];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
  sentence: any;
}

export default function SentenceLeitnerPage() {
  const navigate = useNavigate();
  const flags = useSentenceFlagStore((s) => s.flags);
  const loadFlags = useSentenceFlagStore((s) => s.load);
  const clearFlag = useSentenceFlagStore((s) => s.clearFlag);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [colors, setColors] = useState<FlagColor[]>([...FLAG_COLORS]);

  async function load() {
    setLoading(true);
    try {
      await loadFlags();
      const data = await fetchFlaggedSentences();
      setRows(data as Row[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
    } catch (e: any) {
      toast.error(e?.message ?? "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable store refs; dynamic deps handled internally
  }, []);
  // refresh local list whenever flag store changes
  useEffect(() => {
    setRows((prev) => prev.filter((r) => flags[r.sentence.id]));
  }, [flags]);

  const filtered = useMemo(() => rows.filter((r) => colors.includes(r.flag.color)), [rows, colors]);

  const counts = useMemo(() => {
    const c: Record<FlagColor, number> = { red: 0, orange: 0, yellow: 0, blue: 0 };
    for (const r of rows) c[r.flag.color]++;
    return c;
  }, [rows]);

  function speak(text: string) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 0.95;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* noop */
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="h-8 w-8">
              <Home className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/sentence-lab")}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Sentence Lab
              </p>
              <h1 className="truncate text-sm font-semibold leading-tight sm:text-base">
                <Flag className="mr-1 inline h-4 w-4 text-primary" />
                جمله‌های پرچم‌دار
              </h1>
            </div>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {filtered.length}/{rows.length}
          </Badge>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-3 py-5 sm:px-4">
        <div className="mb-4 rounded-xl border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="h-3 w-3" /> فیلتر بر اساس رنگ
          </div>
          <ToggleGroup
            type="multiple"
            value={colors}
            onValueChange={(v) => setColors(v as FlagColor[])}
            className="grid grid-cols-4 gap-2"
          >
            {FLAG_COLORS.map((c) => {
              const meta = FLAG_COLOR_META[c];
              return (
                <ToggleGroupItem
                  key={c}
                  value={c}
                  className="flex flex-col items-center gap-1 py-2 data-[state=on]:bg-muted"
                >
                  <span className={cn("h-4 w-4 rounded-full", meta.bg)} />
                  <span className="text-[10px]">{meta.label}</span>
                  <span className="text-[10px] text-muted-foreground">{counts[c]}</span>
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </div>

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? "هنوز هیچ جمله‌ای پرچم نخورده. در پادکست یا تمرین، روی آیکون پرچم بزن."
                : "با این فیلتر چیزی پیدا نشد."}
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {filtered.map(({ flag, sentence }) => {
              const meta = FLAG_COLOR_META[flag.color];
              return (
                <li
                  key={sentence.id}
                  className="rounded-xl border bg-card p-3"
                  style={{ borderInlineStartWidth: 4, borderInlineStartColor: meta.hex }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{sentence.english}</p>
                      {sentence.persian && (
                        <p dir="rtl" className="mt-1 text-right text-xs text-muted-foreground">
                          {sentence.persian}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-[9px]"
                          style={{ color: meta.hex, borderColor: meta.hex }}
                        >
                          {flag.label || meta.label}
                        </Badge>
                        {sentence.cefr_level && (
                          <Badge variant="outline" className="text-[9px]">
                            {sentence.cefr_level}
                          </Badge>
                        )}
                        {sentence.subcategory && (
                          <Badge variant="secondary" className="text-[9px]">
                            {sentence.subcategory}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <FlagButton sentenceId={sentence.id} size="sm" />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => speak(sentence.english)}
                        aria-label="Play"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => {
                          void clearFlag(sentence.id);
                        }}
                        aria-label="Remove flag"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-6 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <Headphones className="h-3.5 w-3.5" /> حالت پیمزلر
          </p>
          <p className="mt-1">
            وقتی درس بعدی را در پادکست شروع می‌کنی، جمله‌های پرچم قرمز و نارنجی به‌صورت تنیده بین
            جمله‌های جدید پخش می‌شوند تا تثبیت بشن.
          </p>
        </div>
      </main>
    </div>
  );
}
