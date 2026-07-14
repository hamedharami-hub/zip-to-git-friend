import { useState } from "react";
import { Plus, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { BidiText } from "@/components/BidiText";
import type { MarkerPopoverProps } from "./roleplayTypes";

export function RoleplayMarkerPopover({ marker, text, item }: MarkerPopoverProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleAdd = async () => {
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        toast({ title: "Sign in required", variant: "destructive" });
        return;
      }
      const newId = `correction_${crypto.randomUUID()}`;
      const { error: insErr } = await supabase.from("sentence_lab").insert({
        id: newId,
        status: "published",
        category: "grammar-correction",
        subcategory: item.subcategory ?? null,
        cefr_level: item.cefrLevel ?? null,
        english: marker.correction,
        persian: null,
        grammar_focus: [marker.rule_label],
        vocabulary_tags: [],
        common_mistakes: [marker.span],
      });
      if (insErr) throw insErr;
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
      setSaved(true);
      toast({ title: "Correction added to deck", description: marker.correction });
    } catch (e) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const isMajor = marker.severity === "major";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "mx-0.5 inline rounded px-1 align-baseline underline decoration-wavy underline-offset-4 transition-colors",
            isMajor
              ? "decoration-red-500 text-red-700 dark:text-red-400 hover:bg-red-500/10"
              : "decoration-amber-500 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10",
          )}
        >
          {text}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" align="start">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                isMajor
                  ? "border-red-500/40 text-red-600 dark:text-red-400"
                  : "border-amber-500/40 text-amber-600 dark:text-amber-400",
              )}
            >
              {marker.rule_label}
            </Badge>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {marker.severity}
            </span>
          </div>
          <div className="rounded-md bg-muted/40 p-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-muted-foreground line-through">{marker.span}</span>
              <span className="text-muted-foreground">→</span>
              <BidiText as="span" className="font-medium text-foreground">
                {marker.correction}
              </BidiText>
            </div>
          </div>
          {marker.explanation && (
            <p className="text-xs text-muted-foreground">{marker.explanation}</p>
          )}
          <Button
            size="sm"
            variant={saved ? "secondary" : "default"}
            disabled={saved || saving}
            onClick={handleAdd}
            className="w-full"
          >
            {saved ? (
              <>
                <Check className="h-3.5 w-3.5 mr-1" /> Added to deck
              </>
            ) : saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add correction to deck
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
