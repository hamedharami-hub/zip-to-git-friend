import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { createCategory } from "@/lib/sentenceCategories";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** If set, creates a sub-category under this parent slug. */
  parentSlug?: string;
  onCreated?: () => void;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function CreateCategoryDialog({ open, onOpenChange, parentSlug, onCreated }: Props) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await createCategory({
        slug: slugify(trimmed),
        name: trimmed,
        description: description.trim() || undefined,
        parentSlug,
      });
      toast({ title: "Created", description: trimmed });
      setName("");
      setDescription("");
      onCreated?.();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
    } catch (e: any) {
      toast({
        title: "Could not create",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{parentSlug ? "New sub-topic" : "New category"}</DialogTitle>
          <DialogDescription>
            {parentSlug
              ? `Add a sub-topic under "${parentSlug}".`
              : "Create your own top-level category for sentences."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={parentSlug ? "e.g. Cold & Flu OTC" : "e.g. Hospitality"}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">Description (optional)</Label>
            <Textarea
              id="cat-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
