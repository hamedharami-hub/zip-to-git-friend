import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Sparkles, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBookStore } from '@/store/bookStore';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CreateLanguageBookDialog } from '@/components/books/CreateLanguageBookDialog';
import { AddLanguageChapterDialog } from '@/components/books/AddLanguageChapterDialog';
import { generateGradientCover } from '@/lib/manualBook';
import { isLanguageBook } from '@/lib/languageBook';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const LanguageBooks = () => {
  const books = useBookStore((s) => s.books);
  const load = useBookStore((s) => s.load);
  const remove = useBookStore((s) => s.remove);

  useEffect(() => {
    document.title = 'Language Books — Language Learning Player';
    load();
  }, [load]);

  const handleDelete = async (id: string, title: string) => {
    try {
      await remove(id);
      toast.success(`Deleted "${title}".`);
    } catch (err) {
      console.error('[LanguageBooks] delete failed', err);
      toast.error('Could not delete this book.');
    }
  };

  const sorted = useMemo(() => {
    return books
      .filter(isLanguageBook)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }, [books]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 text-foreground pb-32">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-2">
          <Link to="/">
            <Button variant="ghost" size="icon" aria-label="Back to home">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-base sm:text-lg font-semibold flex items-center gap-2 min-w-0">
            <Sparkles className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            <span className="truncate">Language Books</span>
          </h1>
          <CreateLanguageBookDialog />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {sorted.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-10 w-10 text-muted-foreground" />}
            title="No language books yet"
            description="Give AI a list of target words, phrases or idioms — it weaves them into a short story you read like a normal chapter, with the targets underlined for tap-to-learn."
            action={<CreateLanguageBookDialog />}
          />
        ) : (
          <>
            <div className="mb-6 flex items-baseline justify-between">
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
                {sorted.length} {sorted.length === 1 ? 'book' : 'books'}
              </h2>
              <p className="text-xs text-muted-foreground">
                Tap a cover to start reading
              </p>
            </div>

            <ul className="grid gap-x-5 gap-y-8 sm:gap-x-7 sm:gap-y-10 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {sorted.map((b) => {
                const inProgress = b.lastChapterIndex > 0 || b.lastScrollRatio > 0.02;
                const progress = Math.max(
                  0,
                  Math.min(
                    1,
                    b.chapterCount > 0
                      ? (b.lastChapterIndex + (b.lastScrollRatio ?? 0)) /
                          Math.max(1, b.chapterCount)
                      : 0,
                  ),
                );
                const cover =
                  b.coverDataUrl ?? generateGradientCover(b.title, b.author);

                return (
                  <li key={b.id} className="group relative">
                    <Link
                      to={`/books/${b.id}`}
                      aria-label={`Open ${b.title}`}
                      className="block focus:outline-none"
                    >
                      <div className="relative">
                        <div
                          className={cn(
                            'aspect-[2/3] rounded-md overflow-hidden bg-muted',
                            'shadow-[0_10px_25px_-12px_hsl(var(--foreground)/0.35)]',
                            'transition-all duration-300 ease-out',
                            'group-hover:-translate-y-1 group-hover:shadow-[0_18px_35px_-12px_hsl(var(--foreground)/0.45)]',
                            'group-focus-within:ring-2 group-focus-within:ring-ring',
                          )}
                          style={{
                            backgroundImage: `url("${cover}")`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }}
                        >
                          <div
                            aria-hidden
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              background:
                                'linear-gradient(90deg, hsl(0 0% 0% / 0.18) 0, transparent 6%), linear-gradient(180deg, transparent 70%, hsl(0 0% 0% / 0.25) 100%)',
                            }}
                          />
                        </div>

                        {inProgress && (
                          <div className="absolute left-2 right-2 bottom-2 h-1 rounded-full bg-background/40 backdrop-blur overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${Math.round(progress * 100)}%` }}
                            />
                          </div>
                        )}

                        <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded bg-primary/90 text-primary-foreground border border-primary/40 backdrop-blur flex items-center gap-1">
                          <Sparkles className="h-2.5 w-2.5" />
                          AI
                        </span>
                      </div>

                      <div className="pt-3 px-0.5 space-y-0.5">
                        <p
                          className="font-semibold text-sm leading-tight line-clamp-2"
                          title={b.title}
                        >
                          {b.title}
                        </p>
                        {b.author && (
                          <p
                            className="text-xs text-muted-foreground line-clamp-1"
                            title={b.author}
                          >
                            {b.author}
                          </p>
                        )}
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 pt-0.5">
                          {b.chapterCount > 0
                            ? `${b.chapterCount} ch${
                                inProgress ? ` · ${Math.round(progress * 100)}%` : ''
                              }`
                            : 'Empty'}
                        </p>
                      </div>
                    </Link>

                    <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <AddLanguageChapterDialog
                        book={b}
                        existingChapterCount={b.chapterCount}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Add chapter to ${b.title}`}
                            title="Add AI chapter"
                            className="h-8 w-8 bg-background/85 backdrop-blur border border-border/60 hover:bg-primary hover:text-primary-foreground"
                            onClick={(e) => e.preventDefault()}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${b.title}`}
                            title="Delete book"
                            className="h-8 w-8 bg-background/85 backdrop-blur border border-border/60 hover:bg-destructive hover:text-destructive-foreground"
                            onClick={(e) => e.preventDefault()}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        title={`Delete "${b.title}"?`}
                        description="This removes the book and all its AI-generated chapters. This cannot be undone."
                        confirmLabel="Delete"
                        onConfirm={() => handleDelete(b.id, b.title)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>
    </div>
  );
};

export default LanguageBooks;
