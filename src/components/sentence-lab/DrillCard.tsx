import { memo, useEffect, useMemo, useState } from "react";
import { Volume2, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FlagButton } from "@/components/sentence-lab/FlagButton";
import {
  looksLikePhrase,
  getCachedExample,
  getAutoExample,
  type AutoExample,
} from "@/lib/autoExample";
import type { SentenceQueueItem } from "@/store/sentenceStore";

interface DrillCardProps {
  item: SentenceQueueItem;
  onNext: () => void;
  compact?: boolean;
}

export const DrillCard = memo(function DrillCard({
  item,
  onNext,
  compact = false,
}: DrillCardProps) {
  const { sentence, kind } = item;
  const isPhrase = useMemo(() => looksLikePhrase(sentence.english), [sentence.english]);

  const [example, setExample] = useState<AutoExample | null>(() =>
    isPhrase ? getCachedExample(sentence.id) : null,
  );
  const [exampleLoading, setExampleLoading] = useState(false);
  const [revealEnglish, setRevealEnglish] = useState(false);
  const [revealExampleEn, setRevealExampleEn] = useState(false);

  // Reset reveal state when the sentence changes
  useEffect(() => {
    setRevealEnglish(false);
    setRevealExampleEn(false);
    if (isPhrase) {
      const cached = getCachedExample(sentence.id);
      setExample(cached);
    } else {
      setExample(null);
    }
  }, [sentence.id, isPhrase]);

  async function handleGenerateExample() {
    if (exampleLoading) return;
    setExampleLoading(true);
    try {
      const ex = await getAutoExample(sentence.id, sentence.english, sentence.persian);
      setExample(ex);
    } finally {
      setExampleLoading(false);
    }
  }

  function speak(text: string, lang: "en" | "fa") {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === "fa" ? "fa-IR" : "en-US";
      u.rate = 0.95;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={kind === "new" ? "default" : "secondary"} className="text-[10px]">
            {kind === "new" ? "New" : "Review"}
          </Badge>
          {sentence.cefrLevel && (
            <Badge variant="outline" className="text-[10px]">
              {sentence.cefrLevel}
            </Badge>
          )}
          {isPhrase && (
            <Badge variant="outline" className="text-[10px]">
              عبارت
            </Badge>
          )}
          {sentence.examTaskType && (
            <Badge variant="outline" className="text-[10px]">
              {sentence.examTaskType}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <FlagButton sentenceId={sentence.id} size="sm" />
          {sentence.audioUrl && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => void new Audio(sentence.audioUrl!).play()}
              aria-label="Play audio"
            >
              <Volume2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 1) Persian first — what the learner needs to express */}
        {sentence.persian && (
          <div dir="rtl" className="rounded-md bg-muted/40 p-3 text-right">
            <div className="mb-0.5 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">فارسی</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => speak(sentence.persian!, "fa")}
                aria-label="پخش فارسی"
              >
                <Volume2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-base leading-relaxed">{sentence.persian}</p>
          </div>
        )}

        {/* 2) English — hidden until the learner has tried, then revealed */}
        <div className="rounded-md border bg-card p-3">
          <div className="mb-0.5 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">English</p>
            <div className="flex items-center gap-1">
              {revealEnglish && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => speak(sentence.english, "en")}
                  aria-label="Play English"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                </Button>
              )}
              {!revealEnglish && sentence.persian && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setRevealEnglish(true)}
                >
                  نمایش
                </Button>
              )}
            </div>
          </div>
          <p
            className={`font-medium leading-snug ${compact ? "text-base" : "text-xl"} ${
              !revealEnglish && sentence.persian ? "select-none blur-sm" : ""
            }`}
            onClick={() => !revealEnglish && setRevealEnglish(true)}
          >
            {sentence.english}
          </p>
        </div>

        {/* 3) Example — only for short phrases. Auto-generated, cached. */}
        {isPhrase && (
          <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Wand2 className="h-3 w-3" /> مثال در جمله
              </p>
              {!example && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={handleGenerateExample}
                  disabled={exampleLoading}
                >
                  {exampleLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "ساخت مثال"}
                </Button>
              )}
            </div>
            {example ? (
              <div className="space-y-2">
                {/* Persian example first */}
                <div dir="rtl" className="text-right">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] uppercase text-muted-foreground">FA</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => speak(example.persian, "fa")}
                      aria-label="پخش مثال فارسی"
                    >
                      <Volume2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-sm leading-relaxed">{example.persian}</p>
                </div>
                {/* English example, blurred until reveal */}
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] uppercase text-muted-foreground">EN</p>
                    <div className="flex items-center gap-1">
                      {revealExampleEn ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => speak(example.english, "en")}
                          aria-label="Play example English"
                        >
                          <Volume2 className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-[9px]"
                          onClick={() => setRevealExampleEn(true)}
                        >
                          نمایش
                        </Button>
                      )}
                    </div>
                  </div>
                  <p
                    className={`text-sm leading-snug ${
                      !revealExampleEn ? "select-none blur-sm" : ""
                    }`}
                    onClick={() => !revealExampleEn && setRevealExampleEn(true)}
                  >
                    {example.english}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                این یک عبارت کوتاه است — یک مثال جمله‌ای کوتاه هم بسازم؟
              </p>
            )}
          </div>
        )}

        {!compact && sentence.expectedIntent && (
          <div className="rounded-md border border-dashed p-2.5 text-xs">
            <span className="font-medium">Intent:</span>{" "}
            <span className="text-muted-foreground">{sentence.expectedIntent}</span>
          </div>
        )}
        <Separator />
        <div className="flex items-center justify-end">
          <Button size="sm" onClick={onNext}>
            Next →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});
