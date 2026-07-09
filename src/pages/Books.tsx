import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBookStore } from '@/store/bookStore';
import { EmptyState } from '@/components/EmptyState';
import { BookImportMenu } from '@/components/books/BookImportMenu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AddChapterDialog } from '@/components/books/AddChapterDialog';
import { generateGradientCover } from '@/lib/manualBook';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const Books = () => {
  const books = useBookStore((s) => s.books);
  const load = useBookStore((s) => s.load);
  const remove = useBookStore((s) => s.remove);

  usePageMeta({
    title: 'Library — Language Learning Player',
    description: 'کتابخانه‌ی شخصی شما — افزودن، مطالعه، ترجمه و تحلیل کتاب‌ها با هوش مصنوعی.',
  });
  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string, title: string) => {
    try {
      await remove(id);
      toast.success(`Deleted "${title}".`);
    } catch (err) {
      console.error('[Books] delete failed', err);
      toast.error('Could not delete this book.');
    }
  };

  // Sort: in-progress first, then most recently added.
  const sorted = useMemo(() => {
    return [...books].sort((a, b) => {
      const aProg = a.lastChapterIndex > 0 ? 1 : 0;
      const bProg = b.lastChapterIndex > 0 ? 1 : 0;
      if (aProg !== bProg) return bProg - aProg;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
  }, [books]);

  return (
    <div className="min-h-screen bg-[hsl(var(--surface))] text-foreground pb-32">
      <header className="m3-top-app-bar sticky top-0 z-30 border-b border-outline-variant/40">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <Link to="/">
            <Button variant="ghost" size="icon" aria-label="Back to home" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-[15px] font-semibold flex items-center gap-2 min-w-0">
            <span className="h-9 w-9 rounded-2xl bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] flex items-center justify-center shrink-0">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="truncate">Library</span>
          </h1>
          <BookImportMenu variant="button" />
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {books.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-10 w-10 text-muted-foreground" />}
            title="Your shelf is empty"
            description="Upload an EPUB or paste a chapter to get started. Tap any word for a translation, send phrases to Leitner, and let AI break down each paragraph."
            action={<BookImportMenu variant="card" />}
          />
        ) : (
          <>
            <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[hsl(var(--secondary-container))] via-[hsl(var(--surface-container))] to-[hsl(var(--primary-container))] p-6 sm:p-8 mb-8">
              <div aria-hidden className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-[hsl(var(--secondary)/0.18)] blur-3xl" />
              <div className="relative">
                <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-[hsl(var(--on-surface-variant))]">
                  Your Library
                </p>
                <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-[hsl(var(--on-secondary-container))] leading-tight">
                  {sorted.length} {sorted.length === 1 ? 'کتاب' : 'کتاب'}
                </h2>
                <p className="mt-2 text-sm text-[hsl(var(--on-surface-variant))]">
                  روی جلد ضربه بزن تا شروع به خواندن کنی
                </p>
              </div>
            </section>

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
                  b.coverDataUrl ??
                  generateGradientCover(b.title, b.author);
                const isManual =
                  !b.fileName || /\.manual$/i.test(b.fileName);

                return (
                  <li key={b.id} className="group relative">
                    <Link
                      to={`/books/${b.id}`}
                      aria-label={`Open ${b.title}`}
                      className="block focus:outline-none"
                    >
                      {/* Cover */}
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
                          {/* Subtle inner shadow + spine line for depth */}
                          <div
                            aria-hidden
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              background:
                                'linear-gradient(90deg, hsl(0 0% 0% / 0.18) 0, transparent 6%), linear-gradient(180deg, transparent 70%, hsl(0 0% 0% / 0.25) 100%)',
                            }}
                          />
                        </div>

                        {/* Progress bar */}
                        {inProgress && (
                          <div className="absolute left-2 right-2 bottom-2 h-1 rounded-full bg-background/40 backdrop-blur overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${Math.round(progress * 100)}%` }}
                            />
                          </div>
                        )}

                        {/* Manual-book pill */}
                        {isManual && (
                          <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded bg-background/85 text-foreground/80 border border-border/60 backdrop-blur">
                            Manual
                          </span>
                        )}
                      </div>

                      {/* Meta */}
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
                            : 'Empty — add a chapter'}
                        </p>
                      </div>
                    </Link>

                    {/* Hover actions */}
                    <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      {isManual && (
                        <AddChapterDialog
                          book={b}
                          existingChapterCount={b.chapterCount}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Add chapter to ${b.title}`}
                              title="Add chapter"
                              className="h-8 w-8 bg-background/85 backdrop-blur border border-border/60 hover:bg-primary hover:text-primary-foreground"
                              onClick={(e) => e.preventDefault()}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          }
                        />
                      )}
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
                        description="This removes the book, its chapters, highlights, and any cached AI analysis. This cannot be undone."
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

export default Books;
