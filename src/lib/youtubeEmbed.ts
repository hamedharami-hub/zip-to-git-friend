/**
 * Helpers to extract a YouTube video id from a URL and build an embed URL
 * with optional start/end timestamps for inline cinema-style playback
 * inside flashcards or other UI surfaces.
 */
export function youtubeIdFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      return u.pathname.slice(1) || null;
    }
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const m = u.pathname.match(/\/(embed|shorts|live)\/([\w-]+)/);
      if (m) return m[2];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

export interface YouTubeEmbedOpts {
  videoId: string;
  startMs?: number;
  endMs?: number;
  autoplay?: boolean;
  loop?: boolean;
}

export function buildYoutubeEmbedUrl({
  videoId,
  startMs,
  endMs,
  autoplay = false,
  loop = false,
}: YouTubeEmbedOpts): string {
  const start = startMs !== undefined ? Math.max(0, Math.floor(startMs / 1000)) : undefined;
  const end = endMs !== undefined ? Math.max(0, Math.ceil(endMs / 1000)) : undefined;
  const params = new URLSearchParams();
  if (start !== undefined) params.set('start', String(start));
  if (end !== undefined) params.set('end', String(end));
  if (autoplay) params.set('autoplay', '1');
  if (loop) {
    params.set('loop', '1');
    params.set('playlist', videoId);
  }
  params.set('rel', '0');
  params.set('modestbranding', '1');
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}
