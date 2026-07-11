import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AIModelChoice, AppSettings, SegmentAnalysis } from "@/types";
import { runAnalyze, runTranslate, getApiKeyFor } from "@/lib/ai";

/**
 * In-memory cache wrapper for AI analyze calls.
 * Avoids repeated network round-trips when the same cue text + model is
 * visited multiple times in a single session. IndexedDB still owns the
 * persistent cache (per-cueId), this is the per-text dedup layer.
 */
export function useAnalyzeCached(
  text: string | undefined,
  choice: AIModelChoice,
  settings: AppSettings,
  options: { enabled?: boolean } = {},
) {
  const enabled = !!text && (options.enabled ?? true) && !!getApiKeyFor(choice, settings);
  return useQuery<SegmentAnalysis>({
    queryKey: ["ai", "analyze", choice.provider, choice.model, text ?? ""],
    queryFn: () => runAnalyze(text!, choice, settings),
    enabled,
    staleTime: 1000 * 60 * 60, // an hour — text is stable
    gcTime: 1000 * 60 * 60,
    retry: 1,
  });
}

export function useTranslateCached(
  text: string | undefined,
  choice: AIModelChoice,
  settings: AppSettings,
  options: { enabled?: boolean; context?: string } = {},
) {
  const enabled = !!text && (options.enabled ?? true) && !!getApiKeyFor(choice, settings);
  return useQuery<string>({
    queryKey: ["ai", "translate", choice.provider, choice.model, text ?? "", options.context ?? ""],
    queryFn: () => runTranslate(text!, choice, settings, options.context),
    enabled,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60,
    retry: 1,
  });
}

/** Imperative invalidation helper if you need to force a re-fetch. */
export function useInvalidateAIQueries() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["ai"] });
}
