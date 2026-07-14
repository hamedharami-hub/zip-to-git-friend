import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Sparkles, Loader2, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useSettingsStore } from "@/store/settingsStore";
import { useSentenceStore } from "@/store/sentenceStore";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { BidiText } from "@/components/BidiText";
import type { DissectionModalProps, Turn } from "./roleplayTypes";

export function RoleplayDissectionModal({ open, onOpenChange, turns, item }: DissectionModalProps) {
  const { toast } = useToast();
  const sentenceLabModelRef = useSettingsStore((s) => s.settings.sentenceLabModelRef);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);

  interface GrammarPack {
    rule_label: string;
    rule_explanation: string;
    examples: string[];
  }

  const [grammarPack, setGrammarPack] = useState<GrammarPack | null>(null);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarError, setGrammarError] = useState<string | null>(null);

  // Combined grammar feedback across all turns (used as the AI prompt input).
  const grammarNotes = useMemo(
    () =>
      turns
        .map((t) => t.ai.grammar_corrections?.trim())
        .filter((s): s is string => !!s)
        .join("\n"),
    [turns],
  );

  // Trigger contextual grammar generation in the background as soon as the
  // modal opens, IF the AI flagged at least one grammar issue in the session.
  useEffect(() => {
    if (!open) return;
    if (!grammarNotes) {
      setGrammarPack(null);
      return;
    }
    let cancelled = false;
    setGrammarLoading(true);
    setGrammarError(null);
    setGrammarPack(null);
    (async () => {
      try {
        const topic = [item.category, item.subcategory].filter(Boolean).join(" / ") || null;
        const { data, error } = await supabase.functions.invoke("sentence-grammar-examples", {
          body: {
            grammar_notes: grammarNotes,
            topic,
            cefr_level: item.cefrLevel,
            scenario_english: item.english,
            model:
              sentenceLabModelRef?.provider === "gateway" ? sentenceLabModelRef.model : undefined,
          },
        });
        if (cancelled) return;
        if (error) throw error;
        const pack = data as GrammarPack;
        if (!pack || !Array.isArray(pack.examples) || pack.examples.length === 0) {
          throw new Error("No examples returned.");
        }
        setGrammarPack(pack);
      } catch (e) {
        if (cancelled) return;
        setGrammarError(e instanceof Error ? e.message : "Failed to generate examples.");
      } finally {
        if (!cancelled) setGrammarLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    grammarNotes,
    item.category,
    item.subcategory,
    item.cefrLevel,
    item.english,
    sentenceLabModelRef,
  ]);

  // Aggregate harvested sentences (deduped, preserve order).
  const harvested = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; text: string; turnIndex: number }[] = [];
    turns.forEach((t, i) => {
      for (const raw of t.ai.harvested_sentences) {
        const text = raw.trim();
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ key, text, turnIndex: i });
      }
    });
    return out;
  }, [turns]);

  const totalSpoken = useMemo(() => turns.reduce((s, t) => s + t.spokenSeconds, 0), [turns]);
  const expected = item.expectedDurationSeconds ?? 0;
  const fluencyDelta = expected
    ? Math.round(((totalSpoken / turns.length - expected) / expected) * 100)
    : 0;

  const handleAdd = async (
    text: string,
    key: string,
    opts?: { category?: string; grammarFocus?: string[] },
  ) => {
    setSavingKey(key);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        toast({
          title: "Sign in required",
          description: "Please sign in to save phrases to your deck.",
          variant: "destructive",
        });
        return;
      }
      const newId = `harvest_${crypto.randomUUID()}`;
      // 1) insert into sentence_lab (so the FK from sentence_progress holds)
      const { error: insErr } = await supabase.from("sentence_lab").insert({
        id: newId,
        status: "published",
        category: opts?.category ?? "harvested",
        subcategory: item.subcategory ?? null,
        cefr_level: item.cefrLevel ?? null,
        english: text,
        persian: null,
        grammar_focus: opts?.grammarFocus ?? [],
        vocabulary_tags: [],
        common_mistakes: [],
      });
      if (insErr) throw insErr;

      // 2) seed a fresh FSRS progress row so it shows up in tomorrow's queue
      const { error: progErr } = await supabase.from("sentence_progress").insert({
        user_id: userId,
        sentence_id: newId,
        state: "new",
        stability: 0,
        difficulty: 5,
        elapsed_days: 0,
        reps: 0,
        lapses: 0,
        next_review_date: new Date().toISOString(),
      });
      if (progErr) throw progErr;

      setSavedIds((s) => new Set(s).add(key));
      toast({ title: "Added to your deck", description: text });
    } catch (e) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Drill dissection</DialogTitle>
          <DialogDescription>
            Detailed feedback from your {turns.length}-turn roleplay.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-3">
          <div className="space-y-4 py-2">
            {/* Fluency summary */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">Fluency</h3>
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg. spoken / turn</span>
                  <span className="font-medium">
                    {(totalSpoken / Math.max(1, turns.length)).toFixed(1)}s
                  </span>
                </div>
                {expected > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expected</span>
                    <span className="font-medium">{expected}s</span>
                  </div>
                )}
                {expected > 0 && (
                  <div className="mt-1 flex items-start gap-2 text-xs">
                    <AlertCircle
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5",
                        Math.abs(fluencyDelta) > 30 ? "text-amber-500" : "text-emerald-500",
                      )}
                    />
                    <span className="text-muted-foreground">
                      {fluencyDelta > 0
                        ? `You spoke ${fluencyDelta}% slower than expected.`
                        : fluencyDelta < 0
                          ? `You spoke ${Math.abs(fluencyDelta)}% faster than expected.`
                          : "Pacing on target."}
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Per-turn corrections */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">Grammar & fluency notes</h3>
              <div className="space-y-2">
                {turns.map((t, i) => {
                  const hasFeedback =
                    t.ai.grammar_corrections.trim() || t.ai.fluency_penalty_notes.trim();
                  return (
                    <div key={t.id} className="rounded-md border p-2 text-sm">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-xs">
                          Turn {i + 1}
                        </Badge>
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            t.light === "green" && "bg-emerald-500",
                            t.light === "yellow" && "bg-amber-500",
                            t.light === "red" && "bg-red-500",
                          )}
                        />
                      </div>
                      <BidiText className="text-xs text-muted-foreground italic mb-1">
                        “{t.userTranscript}”
                      </BidiText>
                      {!hasFeedback ? (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          No issues detected.
                        </p>
                      ) : (
                        <>
                          {t.ai.grammar_corrections.trim() && (
                            <BidiText className="text-xs">
                              <span className="font-medium">Grammar:</span>{" "}
                              {t.ai.grammar_corrections}
                            </BidiText>
                          )}
                          {t.ai.fluency_penalty_notes.trim() && (
                            <BidiText className="text-xs">
                              <span className="font-medium">Fluency:</span>{" "}
                              {t.ai.fluency_penalty_notes}
                            </BidiText>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Dynamic grammar drill — only when AI flagged grammar issues */}
            {grammarNotes && (
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Targeted grammar drill
                </h3>
                {grammarLoading && (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating contextual examples…
                  </div>
                )}
                {grammarError && !grammarLoading && (
                  <p className="text-xs text-destructive">
                    Could not generate examples: {grammarError}
                  </p>
                )}
                {grammarPack && !grammarLoading && (
                  <div className="space-y-2">
                    <div className="rounded-md border bg-primary/5 p-2">
                      <p className="text-xs font-medium text-primary">{grammarPack.rule_label}</p>
                      {grammarPack.rule_explanation && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {grammarPack.rule_explanation}
                        </p>
                      )}
                    </div>
                    {grammarPack.examples.map((ex, i) => {
                      const key = `grammar_${i}_${ex.toLowerCase()}`;
                      const saved = savedIds.has(key);
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-2 rounded-md border bg-card/40 p-2"
                        >
                          <p className="flex-1 text-sm">{ex}</p>
                          <Button
                            size="sm"
                            variant={saved ? "secondary" : "outline"}
                            disabled={saved || savingKey === key}
                            onClick={() =>
                              void handleAdd(ex, key, {
                                category: "grammar-drill",
                                grammarFocus: [grammarPack.rule_label],
                              })
                            }
                          >
                            {saved ? (
                              <>
                                <Check className="h-3.5 w-3.5 mr-1" /> Added
                              </>
                            ) : savingKey === key ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <Plus className="h-3.5 w-3.5 mr-1" /> Add to deck
                              </>
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Harvested */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">
                Native phrases harvested ({harvested.length})
              </h3>
              {harvested.length === 0 ? (
                <p className="text-xs text-muted-foreground">No reusable phrases captured yet.</p>
              ) : (
                <div className="space-y-2">
                  {harvested.map((h) => {
                    const saved = savedIds.has(h.key);
                    return (
                      <div
                        key={h.key}
                        className="flex items-center gap-2 rounded-md border bg-card/40 p-2"
                      >
                        <p className="flex-1 text-sm">{h.text}</p>
                        <Button
                          size="sm"
                          variant={saved ? "secondary" : "outline"}
                          disabled={saved || savingKey === h.key}
                          onClick={() => void handleAdd(h.text, h.key)}
                        >
                          {saved ? (
                            <>
                              <Check className="h-3.5 w-3.5 mr-1" /> Added
                            </>
                          ) : savingKey === h.key ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5 mr-1" /> Add to deck
                            </>
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>

        <div className="pt-2 flex justify-end gap-2 border-t mt-2">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              // Refresh queue so newly-added harvested sentences appear soon.
              void useSentenceStore.getState().fetchDailyQueue();
            }}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
