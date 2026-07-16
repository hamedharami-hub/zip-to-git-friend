import { useMemo, useState } from "react";
import { Search, Plus, Loader2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATALOG_CATEGORIES, SOURCE_CATALOG, type CatalogCategory } from "@/lib/newsPublicTopics";
import { cn } from "@/lib/utils";

export interface SourceCatalogProps {
  onAdd?: (source: {
    name: string;
    nameFa: string;
    url: string;
    language: string;
    category: CatalogCategory;
  }) => void | Promise<void>;
  onPick?: (source: { name: string; url: string; language: string }) => void;
  busyId?: string | null;
}

export function SourceCatalog({ onAdd, onPick, busyId }: SourceCatalogProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CatalogCategory | "all">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return SOURCE_CATALOG.filter((s) => {
      if (category !== "all" && s.category !== category) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.nameFa.toLowerCase().includes(q) ||
        s.url.toLowerCase().includes(q)
      );
    });
  }, [search, category]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="جستجو در کاتالوگ (نام فارسی/انگلیسی یا آدرس)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 ps-8 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={cn(
            "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
            category === "all"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border hover:border-primary/50",
          )}
        >
          همه
        </button>
        {CATALOG_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
              category === c.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border hover:border-primary/50",
            )}
          >
            {c.labelFa}
          </button>
        ))}
      </div>

      <ul className="max-h-80 overflow-y-auto space-y-1 rounded-md border border-border bg-background p-1.5">
        {filtered.length === 0 ? (
          <li className="text-center text-sm text-muted-foreground py-4">موردی پیدا نشد.</li>
        ) : (
          filtered.map((s) => {
            const isBusy = busyId === s.id;
            const domain = (() => {
              try {
                return new URL(s.url).hostname.replace(/^www\./, "");
              } catch {
                return s.url;
              }
            })();
            return (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-lg border border-transparent hover:border-border hover:bg-accent/40 px-2 py-1.5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">{s.nameFa}</span>
                    <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
                      · {s.name}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate" dir="ltr">
                    {domain}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs gap-1 shrink-0"
                  disabled={isBusy || (!onAdd && !onPick)}
                  onClick={() => {
                    if (onAdd) {
                      void onAdd(s);
                    } else if (onPick) {
                      onPick({ name: s.nameFa, url: s.url, language: s.language });
                    }
                  }}
                >
                  {isBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  افزودن
                </Button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
