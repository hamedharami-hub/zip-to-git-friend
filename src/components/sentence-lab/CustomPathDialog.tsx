import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { createPath, type PathStepRecipe } from "@/lib/sentencePaths";
import { toast } from "@/hooks/use-toast";

interface SubOption {
  category: string;
  subcategory: string;
  label: string;
  count: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
  domain?: string;
}

export function CustomPathDialog({ open, onOpenChange, onCreated, domain = "general" }: Props) {
  const [options, setOptions] = useState<SubOption[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<PathStepRecipe[]>([]);
  const [pickValue, setPickValue] = useState("");
  const [pickCount, setPickCount] = useState(8);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      // Get general-domain category slugs
      const { data: cats } = await supabase
        .from("sentence_categories")
        .select("slug, name")
        .eq("domain", domain)
        .is("parent_id", null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
      const catSlugs = (cats ?? []).map((c: any) => c.slug);
      if (catSlugs.length === 0) {
        setOptions([]);
        return;
      }

      const { data: rows } = await supabase
        .from("sentence_lab")
        .select("category, subcategory")
        .eq("status", "published")
        .in("category", catSlugs);

      const counts = new Map<string, number>();
      for (const r of rows ?? []) {
        if (!r.category || !r.subcategory) continue;
        const k = `${r.category}/${r.subcategory}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const opts: SubOption[] = Array.from(counts.entries())
        .map(([k, count]) => {
          const [category, subcategory] = k.split("/");
          return { category, subcategory, label: `${category} / ${subcategory}`, count };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
      setOptions(opts);
    })();
  }, [open, domain]);

  function addStep() {
    if (!pickValue) return;
    const [category, subcategory] = pickValue.split("|");
    if (steps.some((s) => s.category === category && s.subcategory === subcategory)) {
      toast({ title: "این منبع قبلاً اضافه شده" });
      return;
    }
    setSteps([...steps, { category, subcategory, count: pickCount }]);
    setPickValue("");
  }

  function removeStep(i: number) {
    setSteps(steps.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!name.trim()) {
      toast({ title: "لطفاً یک نام بگذار", variant: "destructive" });
      return;
    }
    if (steps.length === 0) {
      toast({ title: "حداقل یک منبع اضافه کن", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createPath({
        name: name.trim(),
        description: description.trim() || undefined,
        domain,
        recipe: steps,
      });
      toast({ title: "Path ساخته شد ✨" });
      setName("");
      setDescription("");
      setSteps([]);
      setPickValue("");
      onCreated();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
    } catch (e: any) {
      toast({ title: "خطا", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Path سفارشی جدید</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">نام</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: قبل از سفر"
            />
          </div>
          <div>
            <Label className="text-xs">توضیح (اختیاری)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="..."
            />
          </div>

          <div className="rounded-lg border p-2.5">
            <Label className="text-xs">منابع</Label>
            <div className="mt-2 flex gap-2">
              <Select value={pickValue} onValueChange={setPickValue}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="انتخاب زیرشاخه..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {options.map((o) => (
                    <SelectItem
                      key={`${o.category}|${o.subcategory}`}
                      value={`${o.category}|${o.subcategory}`}
                    >
                      {o.label} ({o.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={1}
                max={50}
                value={pickCount}
                onChange={(e) => setPickCount(Math.max(1, Number(e.target.value) || 1))}
                className="w-16"
              />
              <Button size="icon" onClick={addStep} disabled={!pickValue}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {steps.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {steps.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5"
                  >
                    <span className="text-xs">
                      {s.category} / {s.subcategory}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        ×{s.count}
                      </Badge>
                      <button
                        onClick={() => removeStep(i)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
