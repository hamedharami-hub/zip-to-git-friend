import { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useBookStore } from '@/store/bookStore';
import { appendChapter } from '@/lib/bookDb';
import { pastedTextToChapter } from '@/lib/manualBook';
import type { Book } from '@/types';

interface Props {
  book: Book;
  /** Total chapters this book already has (used to suggest the next title). */
  existingChapterCount: number;
  /** Optional callback when a chapter has been appended (the index it landed on). */
  onAdded?: (newIndex: number) => void;
  /** Optional custom trigger; defaults to a small "Add chapter" button. */
  trigger?: React.ReactNode;
}

/** Append a new chapter to an existing book by pasting plain text. */
export function AddChapterDialog({
  book,
  existingChapterCount,
  onAdded,
  trigger,
}: Props) {
  const upsert = useBookStore((s) => s.upsert);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(`Chapter ${existingChapterCount + 1}`);
  const [text, setText] = useState('');

  function reset() {
    setTitle(`Chapter ${existingChapterCount + 1}`);
    setText('');
  }

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error('Please paste the chapter text first.');
      return;
    }
    setBusy(true);
    try {
      const parsed = pastedTextToChapter(trimmed);
      const newIndex = existingChapterCount;
      await appendChapter(book.id, {
        title: title.trim() || `Chapter ${newIndex + 1}`,
        html: parsed.html,
        text: parsed.text,
        wordCount: parsed.wordCount,
      });
      // Bump chapter count and push to cloud (full sync so chapters travel).
      await upsert(
        {
          ...book,
          chapterCount: existingChapterCount + 1,
          updatedAt: Date.now(),
        },
        { syncBlob: true },
      );
      toast.success(`Added "${title || `Chapter ${newIndex + 1}`}".`);
      onAdded?.(newIndex);
      setOpen(false);
      reset();
    } catch (err) {
      console.error('[AddChapterDialog] failed', err);
      toast.error('Could not add this chapter.');
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
        if (v) setTitle(`Chapter ${existingChapterCount + 1}`);
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

      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add chapter to "{book.title}"</DialogTitle>
          <DialogDescription>
            This will be chapter {existingChapterCount + 1}. Paste the text and tap save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ac-title">Chapter title</Label>
            <Input
              id="ac-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Chapter ${existingChapterCount + 1}`}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-text">Chapter text</Label>
            <Textarea
              id="ac-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the chapter text here. Separate paragraphs with a blank line."
              rows={12}
              className="resize-y font-serif text-base leading-relaxed"
            />
            <p className="text-[11px] text-muted-foreground">
              {text.trim()
                ? `${text.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words`
                : 'Tip: each blank line starts a new paragraph.'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy || !text.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save chapter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
