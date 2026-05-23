import { useMemo, useRef, useState } from 'react';
import { Sparkles, Image as ImageIcon, Loader2, X, Wand2, BookOpen } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { generateGradientCover, imageFileToDataUrl } from '@/lib/manualBook';
import {
  createLanguageBook,
  generateLanguageChapter,
  parseItemsList,
  type LanguageChapterAIResult,
} from '@/lib/languageBook';

interface Props {
  trigger?: React.ReactNode;
}

/**
 * Create a brand-new "Language Learning Book" with an AI-generated first
 * chapter. Two modes:
 *  • auto    — only items, AI invents the story
 *  • guided  — items + outline + your own teaching notes
 */
export function CreateLanguageBookDialog({ trigger }: Props) {
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiResult, setAiResult] = useState<LanguageChapterAIResult | null>(null);

  // Book metadata
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [language, setLanguage] = useState('en');
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chapter inputs
  const [chapterTitle, setChapterTitle] = useState('Chapter 1');
  const [mode, setMode] = useState<'auto' | 'guided'>('auto');
  const [itemsRaw, setItemsRaw] = useState('');
  const [outline, setOutline] = useState('');
  const [userNotes, setUserNotes] = useState('');

  const items = useMemo(() => parseItemsList(itemsRaw), [itemsRaw]);

  const reset = () => {
    setAiResult(null);
    setTitle('');
    setAuthor('');
    setLanguage('en');
    setCoverDataUrl(null);
    setChapterTitle('Chapter 1');
    setMode('auto');
    setItemsRaw('');
    setOutline('');
    setUserNotes('');
  };

  async function handleCoverPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const data = await imageFileToDataUrl(f);
    if (!data) {
      toast.error('Could not read this image. Try a smaller JPG/PNG.');
      return;
    }
    setCoverDataUrl(data);
  }

  async function handleGenerate() {
    if (items.length === 0) {
      toast.error('Add at least one word, phrase, or idiom.');
      return;
    }
    setBusy(true);
    try {
      const result = await generateLanguageChapter({
        items,
        mode,
        outline: mode === 'guided' ? outline.trim() || undefined : undefined,
      });
      setAiResult(result);
      if (!chapterTitle.trim() || chapterTitle === 'Chapter 1') {
        setChapterTitle(result.title);
      }
      toast.success(
        result.missingItems.length
          ? `Story ready — ${result.usedItems.length}/${items.length} items used.`
          : 'Story ready ✨',
      );
    } catch (err) {
      console.error('[CreateLanguageBook] generate failed', err);
      toast.error(
        err instanceof Error ? err.message : 'AI request failed. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    const t = title.trim();
    if (!t) {
      toast.error('Please enter a book title.');
      return;
    }
    if (!aiResult) {
      toast.error('Generate the story first.');
      return;
    }
    setBusy(true);
    try {
      const id = await createLanguageBook({
        title: t,
        author: author.trim() || undefined,
        language: language.trim() || 'en',
        coverDataUrl,
        firstChapter: {
          title: chapterTitle.trim() || aiResult.title,
          items,
          aiResult,
          userNotes: userNotes.trim() || undefined,
        },
      });
      toast.success(`Created "${t}" with first chapter.`);
      setOpen(false);
      reset();
      navigate(`/books/${id}`);
    } catch (err) {
      console.error('[CreateLanguageBook] create failed', err);
      toast.error('Could not create this book. Please try again.');
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
          <Button size="sm" className="gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">New language book</span>
            <span className="sm:hidden">New</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            New Language Learning Book
          </DialogTitle>
          <DialogDescription>
            Give AI your target words / idioms — it weaves a short story you read
            like a normal chapter, with the targets underlined.
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
                    : `url(${generateGradientCover(title || 'Language Book', author)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
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
                <Label htmlFor="lb-title">Book title *</Label>
                <Input
                  id="lb-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My English idioms journal"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="lb-author">Author</Label>
                  <Input
                    id="lb-author"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lb-lang">Language</Label>
                  <Input
                    id="lb-lang"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    placeholder="en"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Chapter generation */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lb-chapter-title">Chapter title</Label>
              <Input
                id="lb-chapter-title"
                value={chapterTitle}
                onChange={(e) => setChapterTitle(e.target.value)}
                placeholder="Chapter 1"
              />
            </div>

            <Tabs value={mode} onValueChange={(v) => setMode(v as 'auto' | 'guided')}>
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
                  <Label htmlFor="lb-items-auto">Words / phrases / idioms *</Label>
                  <Textarea
                    id="lb-items-auto"
                    value={itemsRaw}
                    onChange={(e) => setItemsRaw(e.target.value)}
                    placeholder={'one per line, or comma-separated\ne.g.\nbreak the ice\nspill the beans\non cloud nine'}
                    rows={6}
                    className="resize-y font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {items.length}/60 items detected
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="guided" className="space-y-3 pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="lb-items-guided">Words / phrases / idioms *</Label>
                  <Textarea
                    id="lb-items-guided"
                    value={itemsRaw}
                    onChange={(e) => setItemsRaw(e.target.value)}
                    placeholder="one per line, or comma-separated"
                    rows={4}
                    className="resize-y font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {items.length}/60 items
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lb-outline">Story outline / plot</Label>
                  <Textarea
                    id="lb-outline"
                    value={outline}
                    onChange={(e) => setOutline(e.target.value)}
                    placeholder="Two friends meet at a café and plan a surprise birthday party…"
                    rows={3}
                    className="resize-y"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lb-notes">Your teaching notes (optional)</Label>
                  <Textarea
                    id="lb-notes"
                    value={userNotes}
                    onChange={(e) => setUserNotes(e.target.value)}
                    placeholder="Notes you want appended after the story (e.g. why these idioms matter, register, register, etc.)"
                    rows={3}
                    className="resize-y"
                  />
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex items-center justify-between gap-2 pt-2">
              <p className="text-[11px] text-muted-foreground">
                {aiResult ? '✓ Story ready — review & create.' : 'Generate to preview.'}
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
                {aiResult ? 'Regenerate' : 'Generate story'}
              </Button>
            </div>

            {aiResult && (
              <div className="rounded-md border border-border bg-background p-3 space-y-2 max-h-64 overflow-y-auto">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview · ~{aiResult.targetWordCount} words
                </p>
                <h4 className="font-semibold">{aiResult.title}</h4>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {aiResult.story.slice(0, 600)}
                  {aiResult.story.length > 600 ? '…' : ''}
                </p>
                {aiResult.missingItems.length > 0 && (
                  <p className="text-[11px] text-destructive">
                    Missing: {aiResult.missingItems.join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={busy || !title.trim() || !aiResult}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
