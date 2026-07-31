import { usePageMeta } from "@/hooks/usePageMeta";
import { useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBookStore } from "@/store/bookStore";
import { EmptyState } from "@/components/EmptyState";
import { BookCard } from "@/components/books/BookCard";
import { CreateLanguageBookDialog } from "@/components/books/CreateLanguageBookDialog";
import { isLanguageBook } from "@/lib/languageBook";
import { toast } from "sonner";

const LanguageBooks = () => {
  usePageMeta({
    title: "Language Books — Language Learning Player",
    description: "کتاب‌های زبان — مرور و مطالعه‌ی دوره‌های زبانی.",
  });
  const books = useBookStore((s) => s.books);
  const load = useBookStore((s) => s.load);
  const remove = useBookStore((s) => s.remove);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = useCallback(
    async (id: string, title: string) => {
      try {
        await remove(id);
        toast.success(`Deleted "${title}".`);
      } catch (err) {
        console.error("[LanguageBooks] delete failed", err);
        toast.error("Could not delete this book.");
      }
    },
    [remove],
  );

  const sorted = useMemo(() => {
    return books.filter(isLanguageBook).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }, [books]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 text-foreground pb-32">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-2">
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

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
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
                {sorted.length} {sorted.length === 1 ? "book" : "books"}
              </h2>
              <p className="text-xs text-muted-foreground">Tap a cover to start reading</p>
            </div>

            <ul className="grid gap-x-5 gap-y-8 sm:gap-x-7 sm:gap-y-10 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {sorted.map((b) => (
                <BookCard
                  key={b.id}
                  book={b}
                  badge="ai"
                  allowAddAiChapter
                  onDelete={handleDelete}
                  emptyLabel="Empty"
                />
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
};

export default LanguageBooks;
