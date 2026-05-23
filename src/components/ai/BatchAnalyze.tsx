import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useSettingsStore } from '@/store/settingsStore';
import { useSubtitleStore } from '@/store/subtitleStore';
import { useOnline } from '@/hooks/useOnline';
import { runAnalyze, runAnalyzeBatch, batchSizeFor, AIError, getApiKeyFor, aiErrorMessage } from '@/lib/ai';
import { getAnalysis, saveAnalysis } from '@/lib/db';
import { toast } from 'sonner';

interface Props {
  videoId: string;
}

/** How many batch requests to run in parallel. Each batch already covers many cues. */
const PARALLEL_BATCHES = 2;

export function BatchAnalyze({ videoId }: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const primary = useSubtitleStore((s) => s.primary);
  const online = useOnline();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!running) return;
    return () => {
      cancelRef.current = true;
    };
  }, [running]);

  const start = async () => {
    if (running) return;
    if (!primary || primary.cues.length === 0) {
      toast.error('No primary subtitles loaded.');
      return;
    }
    const choice = settings.batchModel;
    if (!getApiKeyFor(choice, settings)) {
      toast.error(
        choice.provider === 'gemini'
          ? 'Add your Gemini API key in Settings.'
          : 'Add your Groq API key in Settings.',
      );
      return;
    }

    setRunning(true);
    cancelRef.current = false;
    setDone(0);
    setTotal(primary.cues.length);

    // 1) Skip cues already cached — they count as done immediately.
    const todo: Array<{ id: string; text: string }> = [];
    let processed = 0;
    for (const cue of primary.cues) {
      const cached = await getAnalysis(videoId, cue.id);
      if (cached) {
        processed++;
      } else {
        todo.push({ id: cue.id, text: cue.text });
      }
    }
    setDone(processed);

    if (todo.length === 0) {
      setRunning(false);
      toast.success(`All ${primary.cues.length} cues already analyzed.`);
      return;
    }

    // 2) Chunk remaining cues into provider-sized batches
    //    (Gemini ≈ 20 per request, Groq ≈ 8 — huge cost reduction vs one-by-one).
    const size = batchSizeFor(choice.provider);
    const batches: Array<Array<{ id: string; text: string }>> = [];
    for (let i = 0; i < todo.length; i += size) {
      batches.push(todo.slice(i, i + size));
    }

    let failed = 0;

    const runOneBatch = async (batch: Array<{ id: string; text: string }>) => {
      try {
        const map = await runAnalyzeBatch(batch, choice, settings);
        for (const item of batch) {
          if (cancelRef.current) return;
          const result = map.get(item.id);
          if (result) {
            await saveAnalysis(videoId, item.id, result);
            processed++;
            setDone(processed);
          } else {
            // Missing from batch response — single-cue fallback.
            try {
              const single = await runAnalyze(item.text, choice, settings);
              await saveAnalysis(videoId, item.id, single);
              processed++;
              setDone(processed);
            } catch (e) {
              failed++;
              console.warn('Single fallback failed for', item.id, aiErrorMessage(e));
            }
          }
        }
      } catch (e) {
        if (e instanceof AIError && e.code === 'rate_limit') {
          await new Promise((r) => setTimeout(r, 1800));
          batches.unshift(batch);
          return;
        }
        // Batch-wide failure (e.g. bad JSON) — fall back to per-cue calls.
        console.warn('Batch failed, falling back per-cue:', aiErrorMessage(e));
        for (const item of batch) {
          if (cancelRef.current) return;
          try {
            const single = await runAnalyze(item.text, choice, settings);
            await saveAnalysis(videoId, item.id, single);
            processed++;
            setDone(processed);
          } catch (err) {
            failed++;
            console.warn('Per-cue fallback failed for', item.id, aiErrorMessage(err));
          }
        }
      }
    };

    const worker = async () => {
      while (!cancelRef.current) {
        const next = batches.shift();
        if (!next) return;
        await runOneBatch(next);
      }
    };

    const workers = Array.from({ length: PARALLEL_BATCHES }, worker);
    await Promise.all(workers);

    setRunning(false);
    if (cancelRef.current) {
      toast.info(`Cancelled. Analyzed ${processed} of ${primary.cues.length}.`);
    } else if (failed > 0) {
      toast.warning(`Analyzed ${processed} cues — ${failed} failed.`);
    } else {
      toast.success(`Analyzed ${processed} cues.`);
    }
  };

  const cancel = () => {
    cancelRef.current = true;
  };

  if (!running) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={start}
        disabled={!primary?.cues.length || !online}
        title={!online ? 'Requires an internet connection' : undefined}
        aria-label="Analyze all cues"
      >
        <Sparkles className="h-4 w-4 mr-1.5" aria-hidden="true" />
        Analyze All
      </Button>
    );
  }

  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 min-w-[220px]">
      <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
      <div className="flex-1 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">
            Analyzed {done} / {total}
          </span>
          <span className="text-muted-foreground tabular-nums">{pct}%</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancel} aria-label="Cancel">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
