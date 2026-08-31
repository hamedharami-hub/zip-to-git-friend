import { usePageMeta } from "@/hooks/usePageMeta";
import { useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useBookStore } from "@/store/bookStore";
import { EmptyState } from "@/components/EmptyState";
import { BookCard } from "@/components/books/BookCard";
import { CreateLanguageBookDialog } from "@/components/books/CreateLanguageBookDialog";
import { isLanguageBook } from "@/lib/languageBook";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";

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
    <div className="min-h-[100dvh] bg-gradient-to-b from-background to-muted/20 text-foreground pb-32">
      <AppHeader
        icon={Sparkles}
        title="Language Books"
        subtitle="کتاب‌های زبان"
        backTo="/"
        width="default"
        actions={<CreateLanguageBookDialog />}
      />

      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12">
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
