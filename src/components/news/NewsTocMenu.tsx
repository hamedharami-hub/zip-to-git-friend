/**
 * Table-of-contents menu for the news reader. Parses the current article HTML
 * for h1/h2/h3 headings and lets the user jump to any section like a real
 * ebook. Headings get stable slug ids from `headingSlug()` in
 * InteractiveBookText, so the click handler can scroll directly to them.
 */
import { memo, useMemo, useState } from "react";
import { List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { headingSlug } from "@/components/books/InteractiveBookText";
import { cn } from "@/lib/utils";

interface TocItem {
  level: 1 | 2 | 3;
  text: string;
  slug: string;
}

function extractToc(html: string): TocItem[] {
  if (!html) return [];
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const nodes = doc.querySelectorAll("h1, h2, h3, h4, h5, h6");
    const out: TocItem[] = [];
    nodes.forEach((el) => {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!text) return;
      const tag = el.tagName.toLowerCase();
      const level: 1 | 2 | 3 = tag === "h1" ? 1 : tag === "h2" ? 2 : 3;
      out.push({ level, text, slug: headingSlug(text) });
    });
    return out;
  } catch {
    return [];
  }
}

interface Props {
  html: string;
}

export const NewsTocMenu = memo(function NewsTocMenu({ html }: Props) {
  const [open, setOpen] = useState(false);
  const items = useMemo(() => extractToc(html), [html]);

  if (items.length === 0) return null;

  const scrollTo = (slug: string) => {
    const el = document.getElementById(slug);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="فهرست بخش‌ها" title="فهرست بخش‌ها">
          <List className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="px-3 py-2 border-b border-border">
          <p className="text-xs font-semibold">فهرست بخش‌ها</p>
          <p className="text-[10px] text-muted-foreground">
            {items.length} عنوان — برای پرش روی هر کدام بزنید
          </p>
        </div>
        <ScrollArea className="max-h-80">
          <ul className="py-1">
            {items.map((it, i) => (
              <li key={`${it.slug}-${i}`}>
                <button
                  type="button"
                  onClick={() => scrollTo(it.slug)}
                  className={cn(
                    "w-full text-start px-3 py-1.5 text-sm hover:bg-accent transition-colors",
                    it.level === 1 && "font-semibold",
                    it.level === 2 && "pl-5 text-foreground/90",
                    it.level === 3 && "pl-7 text-foreground/70 text-[13px]",
                  )}
                >
                  {it.text}
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
});
