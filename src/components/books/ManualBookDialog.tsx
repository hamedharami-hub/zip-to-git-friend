import { useRef, useState } from "react";
import { Pencil, Image as ImageIcon, Loader2, X } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useBookStore } from "@/store/bookStore";
import { appendChapter } from "@/lib/bookDb";
import { pastedTextToChapter, generateGradientCover, imageFileToDataUrl } from "@/lib/manualBook";

interface Props {
  /** Optional custom trigger; defaults to a small outline button. */
  trigger?: React.ReactNode;
}

/**
 * Create a brand-new book from typed metadata (and optionally paste the
 * first chapter inline). The user can keep adding chapters from the reader.
 */
export function ManualBookDialog({ trigger }: Props) {
  const navigate = useNavigate();
  const upsert = useBookStore((s) => s.upsert);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [language, setLanguage] = useState("en");
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [includeFirstChapter, setIncludeFirstChapter] = useState(true);
  const [chapterTitle, setChapterTitle] = useState("Chapter 1");
  const [chapterText, setChapterText] = useState("");

  const reset = () => {
    setTitle("");
    setAuthor("");
    setLanguage("en");
    setCoverDataUrl(null);
    setIncludeFirstChapter(true);
    setChapterTitle("Chapter 1");
    setChapterText("");
  };

  async function handleCoverPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const data = await imageFileToDataUrl(f);
    if (!data) {
      toast.error("Could not read this image. Try a smaller JPG/PNG.");
      return;
    }
    setCoverDataUrl(data);
  }

  async function handleCreate() {
    const t = title.trim();
    if (!t) {
      toast.error("Please enter a book title.");
      return;
    }
    setBusy(true);
    try {
      const bookId = crypto.randomUUID();
      const cover = coverDataUrl ?? generateGradientCover(t, author.trim() || undefined);

      let chapterCount = 0;
      let firstChapterWords = 0;

      if (includeFirstChapter && chapterText.trim()) {
        const parsed = pastedTextToChapter(chapterText);
        if (!parsed.text) {
          toast.error("The pasted chapter looks empty.");
          setBusy(false);
          return;
        }
        await appendChapter(bookId, {
          title: chapterTitle.trim() || "Chapter 1",
          html: parsed.html,
          text: parsed.text,
          wordCount: parsed.wordCount,
        });
        chapterCount = 1;
        firstChapterWords = parsed.wordCount;
      }

      await upsert(
        {
          id: bookId,
          title: t,
          author: author.trim() || undefined,
          language: language.trim() || undefined,
          fileName: `${t}.manual`,
          chapterCount,
          lastChapterIndex: 0,
          lastScrollRatio: 0,
          coverDataUrl: cover,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        // syncBlob:true triggers a full chapter push to the cloud too.
        { syncBlob: true },
      );

      toast.success(
        chapterCount > 0
          ? `Created "${t}" with first chapter (${firstChapterWords.toLocaleString()} words).`
          : `Created "${t}". Open it to paste your first chapter.`,
      );
      setOpen(false);
      reset();
      // Take the user straight into the reader.
      navigate(`/books/${bookId}`);
    } catch (err) {
      console.error("[ManualBookDialog] create failed", err);
      toast.error("Could not create this book. Please try again.");
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
            <Pencil className="h-4 w-4" />
            <span className="hidden sm:inline">Add manually</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a book manually</DialogTitle>
          <DialogDescription>
            Type the book details, optionally paste the first chapter, and keep adding chapters one
            by one from the reader.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Cover + metadata */}
          <div className="flex gap-4">
            <div className="shrink-0">
              <div
                className="w-24 h-36 rounded-md overflow-hidden border border-border bg-muted relative group"
                style={{
                  backgroundImage: coverDataUrl
                    ? `url(${coverDataUrl})`
                    : `url(${generateGradientCover(title || "Book", author)})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {coverDataUrl && (
                  <button
                    type="button"
                    onClick={() => setCoverDataUrl(null)}
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-background/90 text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                    aria-label="Remove cover image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverPick}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full mt-2 gap-1.5 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Cover
              </Button>
            </div>

            <div className="flex-1 space-y-3 min-w-0">
              <div className="space-y-1.5">
                <Label htmlFor="mb-title">Title *</Label>
                <Input
                  id="mb-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="The Great Gatsby"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mb-author">Author</Label>
                <Input
                  id="mb-author"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="F. Scott Fitzgerald"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mb-lang">Language</Label>
                <Input
                  id="mb-lang"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="en"
                  className="max-w-[8rem]"
                />
              </div>
            </div>
          </div>

          {/* First-chapter toggle */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Add the first chapter now</p>
                <p className="text-xs text-muted-foreground">
                  Paste one chapter at a time. You can add more later from the reader.
                </p>
              </div>
              <Switch
                checked={includeFirstChapter}
                onCheckedChange={setIncludeFirstChapter}
                aria-label="Add first chapter"
              />
            </div>

            {includeFirstChapter && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="mb-cht">Chapter title</Label>
                  <Input
                    id="mb-cht"
                    value={chapterTitle}
                    onChange={(e) => setChapterTitle(e.target.value)}
                    placeholder="Chapter 1"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mb-chx">Chapter text</Label>
                  <Textarea
                    id="mb-chx"
                    value={chapterText}
                    onChange={(e) => setChapterText(e.target.value)}
                    placeholder="Paste the chapter text here. Separate paragraphs with a blank line."
                    rows={10}
                    className="resize-y font-serif text-base leading-relaxed"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {chapterText.trim()
                      ? `${chapterText.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words`
                      : "Tip: each blank line starts a new paragraph."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={busy || !title.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
