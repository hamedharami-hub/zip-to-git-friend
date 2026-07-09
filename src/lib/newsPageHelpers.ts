/**
 * Pure helpers and constants shared by the News page. Extracted from
 * News.tsx to shrink that file and make the utilities easy to reuse.
 */

export const RETURN_KEY = 'news.return.v1';

export type ReturnState = {
  sourceId: string | null;
  folderId: string | null;
  url: string;
  scrollY: number;
};

export const WINDOW_OPTIONS = [
  { value: '1', label: '۱ ساعت اخیر' },
  { value: '4', label: '۴ ساعت اخیر' },
  { value: '6', label: '۶ ساعت اخیر' },
  { value: '24', label: '۲۴ ساعت اخیر' },
  { value: '72', label: '۳ روز اخیر' },
  { value: '168', label: '۱ هفته اخیر' },
];

/** Human-friendly relative time (e.g. "5m ago"). Falls back to locale date. */
export function formatTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const min = Math.round(diff / 60_000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h}h ago`;
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

/** Hostname without leading www., or the original string if parsing fails. */
export function siteFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Persian/Arabic script detection so titles render RTL with the Persian font. */
const RTL_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
export function isRtlText(s?: string | null): boolean {
  return !!s && RTL_RE.test(s);
}
