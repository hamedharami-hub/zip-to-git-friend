import { useEffect, useMemo, useState, useCallback } from "react";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBookStore } from "@/store/bookStore";
import { EmptyState } from "@/components/EmptyState";
import { BookImportMenu } from "@/components/books/BookImportMenu";
import { BookCard } from "@/components/books/BookCard";
import { toast } from "sonner";

const Books = () => {
  const books = useBookStore((s) => s.books);
  const load = useBookStore((s) => s.load);
  const remove = useBookStore((s) => s.remove);

  usePageMeta({
    title: "Library — Language Learning Player",
    description: "کتابخانه‌ی شخصی شما — افزودن، مطالعه، ترجمه و تحلیل کتاب‌ها با هوش مصنوعی.",
  });
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let alive = true;
    load().finally(() => {
      if (alive) setHydrated(true);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  const handleDelete = useCallback(
    async (id: string, title: string) => {
      try {
        await remove(id);
        toast.success(`Deleted "${title}".`);
      } catch (err) {
        console.error("[Books] delete failed", err);
        toast.error("Could not delete this book.");
      }
    },
    [remove],
  );

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
        {!hydrated ? (
          <ul className="grid gap-x-5 gap-y-8 sm:gap-x-7 sm:gap-y-10 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <li key={i} className="animate-pulse">
                <div className="aspect-[2/3] rounded-md bg-muted/70" />
                <div className="pt-3 space-y-2">
                  <div className="h-3 rounded bg-muted/70 w-4/5" />
                  <div className="h-2.5 rounded bg-muted/60 w-2/5" />
                </div>
              </li>
            ))}
          </ul>
        ) : books.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-10 w-10 text-muted-foreground" />}
            title="Your shelf is empty"
            description="Upload an EPUB or paste a chapter to get started. Tap any word for a translation, send phrases to Leitner, and let AI break down each paragraph."
            action={<BookImportMenu variant="card" />}
          />
        ) : (
          <>
            <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[hsl(var(--secondary-container))] via-[hsl(var(--surface-container))] to-[hsl(var(--primary-container))] p-6 sm:p-8 mb-8">
              <div
                aria-hidden
                className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-[hsl(var(--secondary)/0.18)] blur-3xl"
              />
              <div className="relative">
                <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-[hsl(var(--on-surface-variant))]">
                  Your Library
                </p>
                <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-[hsl(var(--on-secondary-container))] leading-tight">
                  {sorted.length} {sorted.length === 1 ? "کتاب" : "کتاب"}
                </h2>
                <p className="mt-2 text-sm text-[hsl(var(--on-surface-variant))]">
                  روی جلد ضربه بزن تا شروع به خواندن کنی
                </p>
              </div>
            </section>

            <ul className="grid gap-x-5 gap-y-8 sm:gap-x-7 sm:gap-y-10 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {sorted.map((b) => {
                const isManual = !b.fileName || /\.manual$/i.test(b.fileName);
                return (
                  <BookCard
                    key={b.id}
                    book={b}
                    badge={isManual ? "manual" : undefined}
                    allowAddChapter={isManual}
                    onDelete={handleDelete}
                  />
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
