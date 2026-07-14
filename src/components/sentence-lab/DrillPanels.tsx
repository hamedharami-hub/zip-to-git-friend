import { memo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Layers, TrendingUp, Sparkles, BookOpen, Tag, AlertTriangle } from "lucide-react";
import type { SentenceQueueItem } from "@/store/sentenceStore";

interface SessionPanelProps {
  currentIndex: number;
  total: number;
  due: number;
  fresh: number;
}

export const SessionPanel = memo(function SessionPanel({
  currentIndex,
  total,
  due,
  fresh,
}: SessionPanelProps) {
  const pct = total ? Math.round(((currentIndex + 1) / total) * 100) : 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="h-4 w-4 text-primary" /> Session
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="tabular-nums font-medium">
              {Math.min(currentIndex + 1, total)} / {total}
            </span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-md border bg-muted/30 p-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Due</p>
            <p className="text-lg font-semibold tabular-nums">{due}</p>
          </div>
          <div className="rounded-md border bg-muted/30 p-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">New</p>
            <p className="text-lg font-semibold tabular-nums">{fresh}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

interface FsrsPanelProps {
  item: SentenceQueueItem;
}

export const FsrsPanel = memo(function FsrsPanel({ item }: FsrsPanelProps) {
  const { progress } = item;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-primary" /> FSRS
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {progress ? (
          <>
            <Row label="State" value={progress.state} />
            <Row label="Reps" value={String(progress.reps)} />
            <Row label="Lapses" value={String(progress.lapses)} />
            <Row label="Stability" value={progress.stability.toFixed(1)} />
            <Row label="Difficulty" value={progress.difficulty.toFixed(1)} />
            <Row label="Next" value={new Date(progress.nextReviewDate).toLocaleDateString()} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">First time seeing this sentence.</p>
        )}
      </CardContent>
    </Card>
  );
});

interface HarvestPanelProps {
  items: string[];
}

export const HarvestPanel = memo(function HarvestPanel({ items }: HarvestPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Harvested
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sophisticated phrases the AI uses during roleplay will appear here.
          </p>
        ) : (
          <ScrollArea className="max-h-48">
            <ul className="space-y-1 pr-2">
              {items.map((text, i) => (
                <li
                  key={i}
                  className="rounded-md border bg-muted/30 px-2 py-1.5 text-xs leading-snug"
                >
                  {text}
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
});

interface ContextPanelProps {
  item: SentenceQueueItem;
}

export const ContextPanel = memo(function ContextPanel({ item }: ContextPanelProps) {
  const { sentence } = item;
  const hasAny =
    sentence.grammarFocus.length > 0 ||
    sentence.vocabularyTags.length > 0 ||
    sentence.commonMistakes.length > 0;
  if (!hasAny) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="h-4 w-4 text-primary" /> Context
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {sentence.grammarFocus.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Grammar
            </p>
            <div className="flex flex-wrap gap-1">
              {sentence.grammarFocus.map((g) => (
                <Badge key={g} variant="outline" className="text-[10px]">
                  {g}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {sentence.vocabularyTags.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Tag className="h-3 w-3" /> Vocabulary
            </p>
            <div className="flex flex-wrap gap-1">
              {sentence.vocabularyTags.map((v) => (
                <Badge key={v} variant="secondary" className="text-[10px]">
                  {v}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {sentence.commonMistakes.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <AlertTriangle className="h-3 w-3 text-amber-500" /> Pitfalls
            </p>
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              {sentence.commonMistakes.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

interface RowProps {
  label: string;
  value: string;
}

const Row = memo(function Row({ label, value }: RowProps) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
});
