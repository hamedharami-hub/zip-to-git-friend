import { Check, Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ScenarioPickerProps } from "./scenarioTypes";

export function ScenarioPicker({
  scenarios,
  loading,
  onPick,
  onRegenerate,
  targetCount,
  allSubs,
  selectedSubSlugs,
  onToggleSub,
}: ScenarioPickerProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {allSubs.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Mix subcategories ({selectedSubSlugs.length} selected)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5 pt-0">
            {allSubs.map((s) => {
              const on = selectedSubSlugs.includes(s.slug);
              return (
                <button
                  key={s.id}
                  onClick={() => onToggleSub(s.slug)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {on && <Check className="mr-1 inline h-3 w-3" />}
                  {s.name}
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      {loading || !scenarios ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Designing 3 conversations from {targetCount} sentences…
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Pick a scenario, then choose your role.</p>
            <Button variant="outline" size="sm" onClick={onRegenerate}>
              <RefreshCw className="h-3.5 w-3.5" /> New ideas
            </Button>
          </div>
          <div className="grid gap-3">
            {scenarios.map((s, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight">{s.title_en}</CardTitle>
                    <Badge
                      variant={
                        s.difficulty === "hard"
                          ? "destructive"
                          : s.difficulty === "medium"
                            ? "default"
                            : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {s.difficulty}
                    </Badge>
                  </div>
                  <p dir="rtl" className="text-right text-xs text-muted-foreground">
                    {s.title_fa}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3 pt-0 text-sm">
                  <p>{s.scene_en}</p>
                  <p dir="rtl" className="text-right text-xs text-muted-foreground">
                    {s.scene_fa}
                  </p>
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Choose your role pair:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        s.role_options ?? [
                          {
                            user_role: s.user_role,
                            ai_role: s.ai_role,
                            label: `${s.user_role} ↔ ${s.ai_role}`,
                          },
                        ]
                      ).map((r, j) => (
                        <Button
                          key={j}
                          size="sm"
                          variant="outline"
                          onClick={() => onPick(s, r)}
                          className="h-auto whitespace-normal py-1.5 text-xs"
                        >
                          <Sparkles className="mr-1 h-3 w-3" />
                          You: {r.user_role}
                          <span className="mx-1 opacity-50">·</span>
                          AI: {r.ai_role}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
