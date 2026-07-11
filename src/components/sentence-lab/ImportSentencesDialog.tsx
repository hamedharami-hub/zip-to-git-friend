import { useMemo, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { importSentences, type ImportSentence } from "@/lib/sentenceCategories";
import type { CategoryWithStats } from "@/lib/sentenceCategories";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categorySlug: string;
  subcategories: CategoryWithStats[];
  onImported?: () => void;
}

const SAMPLE = `[
  {
    "english": "I have a sore throat.",
    "persian": "گلوم درد می‌کنه.",
    "cefr_level": "A2",
    "expected_intent": "Describe a symptom to a pharmacist",
    "expected_duration_seconds": 4
  }
]`;

function parseInput(raw: string): ImportSentence[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  // Try JSON first
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr
      .filter((x) => x && typeof x.english === "string" && x.english.trim())
      .map((x) => ({
        english: String(x.english).trim(),
        persian: x.persian ? String(x.persian) : undefined,
        english_aussie: x.english_aussie,
        cefr_level: x.cefr_level,
        expected_intent: x.expected_intent,
        ai_counter_prompt: x.ai_counter_prompt,
        expected_duration_seconds: x.expected_duration_seconds,
        grammar_focus: Array.isArray(x.grammar_focus) ? x.grammar_focus : undefined,
        vocabulary_tags: Array.isArray(x.vocabulary_tags) ? x.vocabulary_tags : undefined,
        common_mistakes: Array.isArray(x.common_mistakes) ? x.common_mistakes : undefined,
      }));
  }
  // Fallback: each line is "english | persian"
  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [en, fa] = line.split("|").map((s) => s?.trim() ?? "");
      return { english: en, persian: fa || undefined };
    })
    .filter((s) => s.english);
}

export function ImportSentencesDialog({
  open,
  onOpenChange,
  categorySlug,
  subcategories,
  onImported,
}: Props) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [subSlug, setSubSlug] = useState<string>("__none__");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const preview = useMemo(() => {
    try {
      return parseInput(text);
    } catch {
      return [];
    }
  }, [text]);

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function handleImport() {
    if (preview.length === 0) {
      toast({ title: "Nothing to import", description: "Paste JSON or use the sample." });
      return;
    }
    setBusy(true);
    try {
      const sub = subSlug === "__none__" ? null : subSlug;
      const n = await importSentences(categorySlug, sub, preview);
      toast({ title: "Imported", description: `${n} sentences added` });
      setText("");
      setFileName(null);
      onImported?.();
    } catch (e: any) {
      toast({
        title: "Import failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import sentences</DialogTitle>
          <DialogDescription>
            Paste a JSON array, drop a .json/.txt file, or write one sentence per line as
            <code className="mx-1 rounded bg-muted px-1 text-xs">english | persian</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Sub-topic (optional)</Label>
            <Select value={subSlug} onValueChange={setSubSlug}>
              <SelectTrigger>
                <SelectValue placeholder="None — top of category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None (category root)</SelectItem>
                {subcategories.map((s) => (
                  <SelectItem key={s.id} value={s.slug}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center justify-between">
              <span>Sentences</span>
              <label className="cursor-pointer text-xs text-primary hover:underline">
                <Upload className="mr-1 inline h-3 w-3" />
                Upload file
                <input
                  type="file"
                  accept=".json,.txt,application/json,text/plain"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>
            </Label>
            {fileName && <p className="text-[11px] text-muted-foreground">📎 {fileName}</p>}
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={SAMPLE}
              rows={10}
              className="font-mono text-xs"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Preview: <strong>{preview.length}</strong> valid sentence
            {preview.length === 1 ? "" : "s"} detected
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={busy || preview.length === 0}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Import {preview.length > 0 && `(${preview.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
