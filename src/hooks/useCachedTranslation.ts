import { useEffect, useState } from 'react';
import { getAnalysis } from '@/lib/db';

/**
 * Returns the cached AI translation for a given (videoId, cueId), if any.
 * Reads from IndexedDB only — never triggers an AI call. This is the data
 * source for the "dual subtitle" line shown under the source subtitle.
 */
export function useCachedTranslation(
  videoId: string | undefined,
  cueId: string | undefined,
): string | null {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!videoId || !cueId) {
      setText(null);
      return;
    }
    setText(null);
    getAnalysis(videoId, cueId)
      .then((a) => {
        if (cancelled) return;
        setText(a?.translation?.trim() || null);
      })
      .catch(() => {
        if (!cancelled) setText(null);
      });
    return () => {
      cancelled = true;
    };
  }, [videoId, cueId]);

  return text;
}
