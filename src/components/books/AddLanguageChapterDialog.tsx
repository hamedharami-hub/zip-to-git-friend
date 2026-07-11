import { useMemo, useState } from "react";
import { Plus, Sparkles, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  appendLanguageChapter,
  generateLanguageChapter,
  parseItemsList,
  type LanguageChapterAIResult,
} from "@/lib/languageBook";
import type { Book } from "@/types";

interface Props {
  book: Book;
  existingChapterCount: number;
  onAdded?: (newChapterIndex: number) => void;
  trigger?: React.ReactNode;
}

/** Append a new AI-generated chapter to an existing language book. */
export function AddLanguageChapterDialog({ book, existingChapterCount, onAdded, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiResult, setAiResult] = useState<LanguageChapterAIResult | null>(null);

  const defaultTitle = `Chapter ${existingChapterCount + 1}`;
  const [chapterTitle, setChapterTitle] = useState(defaultTitle);
  const [mode, setMode] = useState<"auto" | "guided">("auto");
  const [itemsRaw, setItemsRaw] = useState("");
  const [outline, setOutline] = useState("");
  const [userNotes, setUserNotes] = useState("");

  const items = useMemo(() => parseItemsList(itemsRaw), [itemsRaw]);

  const reset = () => {
    setAiResult(null);
    setChapterTitle(`Chapter ${existingChapterCount + 1}`);
    setMode("auto");
    setItemsRaw("");
    setOutline("");
    setUserNotes("");
  };

  async function handleGenerate() {
    if (items.length === 0) {
      toast.error("Add at least one word, phrase, or idiom.");
      return;
    }
    setBusy(true);
    try {
      const result = await generateLanguageChapter({
        items,
        mode,
        outline: mode === "guided" ? outline.trim() || undefined : undefined,
      });
      setAiResult(result);
      if (chapterTitle === defaultTitle || !chapterTitle.trim()) {
        setChapterTitle(result.title);
      }
      toast.success("Story ready ✨");
    } catch (err) {
      console.error("[AddLanguageChapter] generate failed", err);
      toast.error(err instanceof Error ? err.message : "AI request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAppend() {
    if (!aiResult) {
      toast.error("Generate the story first.");
      return;
    }
    setBusy(true);
    try {
      await appendLanguageChapter(book, {
        title: chapterTitle.trim() || aiResult.title,
        items,
        aiResult,
        userNotes: userNotes.trim() || undefined,
      });
      toast.success("Chapter added.");
      setOpen(false);
      reset();
      onAdded?.(existingChapterCount);
    } catch (err) {
      console.error("[AddLanguageChapter] append failed", err);
      toast.error("Could not save the chapter.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add chapter</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Add language chapter
          </DialogTitle>
          <DialogDescription>
            Hand AI a fresh batch of items — it weaves them into a new short story for «{book.title}
            ».
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="alc-title">Chapter title</Label>
            <Input
              id="alc-title"
              value={chapterTitle}
              onChange={(e) => setChapterTitle(e.target.value)}
              placeholder={defaultTitle}
            />
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "auto" | "guided")}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="auto" className="gap-1.5">
                <Wand2 className="h-3.5 w-3.5" />
                Auto
              </TabsTrigger>
              <TabsTrigger value="guided" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Guided
              </TabsTrigger>
            </TabsList>

            <TabsContent value="auto" className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="alc-items-auto">Words / phrases / idioms *</Label>
                <Textarea
                  id="alc-items-auto"
                  value={itemsRaw}
                  onChange={(e) => setItemsRaw(e.target.value)}
                  placeholder={"one per line, or comma-separated"}
                  rows={6}
                  className="resize-y font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">{items.length}/60 items</p>
              </div>
            </TabsContent>

            <TabsContent value="guided" className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="alc-items-guided">Words / phrases / idioms *</Label>
                <Textarea
                  id="alc-items-guided"
                  value={itemsRaw}
                  onChange={(e) => setItemsRaw(e.target.value)}
                  placeholder="one per line, or comma-separated"
                  rows={4}
                  className="resize-y font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="alc-outline">Story outline / plot</Label>
                <Textarea
                  id="alc-outline"
                  value={outline}
                  onChange={(e) => setOutline(e.target.value)}
                  placeholder="A short scene that ties the items together…"
                  rows={3}
                  className="resize-y"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="alc-notes">Teaching notes (optional)</Label>
                <Textarea
                  id="alc-notes"
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  placeholder="Appended after the story."
                  rows={2}
                  className="resize-y"
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[11px] text-muted-foreground">
              {aiResult ? "✓ Story ready." : "Generate to preview."}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={busy || items.length === 0}
              className="gap-1.5"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {aiResult ? "Regenerate" : "Generate"}
            </Button>
          </div>

          {aiResult && (
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2 max-h-56 overflow-y-auto">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Preview · ~{aiResult.targetWordCount} words
              </p>
              <h4 className="font-semibold text-sm">{aiResult.title}</h4>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {aiResult.story.slice(0, 500)}
                {aiResult.story.length > 500 ? "…" : ""}
              </p>
              {aiResult.missingItems.length > 0 && (
                <p className="text-[11px] text-destructive">
                  Missing: {aiResult.missingItems.join(", ")}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleAppend} disabled={busy || !aiResult}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Add chapter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
