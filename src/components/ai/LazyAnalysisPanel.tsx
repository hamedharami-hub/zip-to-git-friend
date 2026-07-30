import { lazy, Suspense } from "react";
import type { SubtitleCue } from "@/types";

interface Props {
  videoId: string;
  cue: SubtitleCue | null;
  autoRun?: boolean;
  showTranslate?: boolean;
}

const AnalysisPanel = lazy(() =>
  import("./AnalysisPanel").then((m) => ({ default: m.AnalysisPanel })),
);

function Fallback() {
  return (
    <div className="flex items-center justify-center p-6 text-muted-foreground text-xs">
      <div className="h-5 w-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin mr-2" />
      در حال بارگذاری…
    </div>
  );
}

export function LazyAnalysisPanel(props: Props) {
  return (
    <Suspense fallback={<Fallback />}>
      <AnalysisPanel {...props} />
    </Suspense>
  );
}
