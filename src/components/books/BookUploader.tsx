import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { parseEpub } from '@/lib/epubParser';
import { saveBookBlob, saveChapters } from '@/lib/bookDb';
import { useBookStore } from '@/store/bookStore';

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — generous; epubs are usually <10 MB.

interface Props {
  /** Render style: 'button' for header use, 'card' for empty-state CTA. */
  variant?: 'button' | 'card';
  /** When provided, exposes the internal trigger button so a parent menu can
   *  open the OS file picker programmatically. The visible button is hidden. */
  triggerRef?: React.RefObject<HTMLButtonElement>;
}

/**
 * Single-file EPUB uploader.
 * - Validates extension/size
 * - Parses chapters with progress
 * - Saves: blob → metadata → chapters
 */
export function BookUploader({ variant = 'button', triggerRef }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upsertBook = useBookStore((s) => s.upsert);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState<string>('');

  async function handleFile(file: File) {
    if (!/\.epub$/i.test(file.name)) {
      toast.error('Only .epub files are supported.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`File is too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`);
      return;
    }

    setBusy(true);
    setProgress(2);
    setLabel('Opening file…');

    const bookId = crypto.randomUUID();
    try {
      // Save raw bytes first so a parser crash doesn't lose the file.
      await saveBookBlob(bookId, file);

      const parsed = await parseEpub(file, bookId, (p) => {
        setProgress(Math.round(p.ratio * 100));
        if (p.label) setLabel(p.label);
      });

      if (parsed.chapters.length === 0) {
        throw new Error('No readable chapters found in this EPUB.');
      }

      await saveChapters(parsed.chapters);
      // syncBlob: true → also pushes the EPUB file + chapters to cloud
      // storage (no-op if the user is signed out).
      await upsertBook(
        {
          ...parsed.book,
          lastChapterIndex: 0,
          lastScrollRatio: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        { syncBlob: true },
      );

      toast.success(`Imported "${parsed.book.title}" — ${parsed.chapters.length} chapters.`);
    } catch (err) {
      console.error('[BookUploader] failed', err);
      toast.error(
        err instanceof Error ? err.message : 'Could not parse this EPUB. Try another file.',
      );
    } finally {
      setBusy(false);
      setProgress(0);
      setLabel('');
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const trigger = () => inputRef.current?.click();

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".epub,application/epub+zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {variant === 'card' ? (
        <Button
          ref={triggerRef}
          onClick={trigger}
          disabled={busy}
          size="lg"
          className={`gap-2 ${triggerRef ? 'sr-only' : ''}`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? 'Importing…' : 'Upload EPUB'}
        </Button>
      ) : (
        <Button
          ref={triggerRef}
          onClick={trigger}
          disabled={busy}
          variant="outline"
          size="sm"
          className={`gap-2 ${triggerRef ? 'sr-only' : ''}`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? 'Importing…' : 'Upload EPUB'}
        </Button>
      )}

      {busy && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur p-4"
          role="status"
          aria-live="polite"
        >
          <div className="max-w-2xl mx-auto space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Importing book…</span>
              <span className="text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} />
            {label && (
              <p className="text-xs text-muted-foreground truncate">{label}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
