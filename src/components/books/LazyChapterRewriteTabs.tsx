import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";

const ChapterRewriteTabs = lazy(() =>
  import("./ChapterRewriteTabs").then((m) => ({ default: m.ChapterRewriteTabs })),
);

type Props = ComponentProps<typeof ChapterRewriteTabs>;

function Fallback() {
  return (
    <div className="mt-12 pt-8 border-t border-border/50 flex items-center justify-center p-6 text-xs text-muted-foreground">
      <div className="h-5 w-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin mr-2" />
      در حال بارگذاری…
    </div>
  );
}

export function LazyChapterRewriteTabs(props: Props) {
  return (
    <Suspense fallback={<Fallback />}>
      <ChapterRewriteTabs {...props} />
    </Suspense>
  );
}
