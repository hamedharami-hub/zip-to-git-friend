/**
 * Share menu for a news article.
 *
 * Two flavours:
 *
 *   1. Download a bilingual HTML file — each paragraph appears with both the
 *      original (English) text and its cached Persian translation, plus a
 *      sticky header at the top of the file that lets the reader toggle
 *      between English-only / Persian-only / both.
 *
 *   2. Copy the article body to clipboard:
 *        - raw (Persian translation joined, with title heading), or
 *        - AI-rewritten for Telegram (blog-style Persian, bold headings &
 *          key points). Copies both rich-text HTML and plain-text so paste
 *          inside Telegram keeps the bold.
 */
import { useState } from 'react';
import { Share2, Loader2, FileDown, Copy, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { getCachedParagraphAnalysis } from '@/lib/bookAnalysis';
import { splitIntoShortChunks } from '@/lib/paragraphSplit';
import { formatForTelegram } from '@/lib/news';

interface Props {
  /** Cache key used by the renderer for this article view. */
  bookId: string;
  /** Chapter index inside that cache (news articles are single-chapter). */
  chapterIndex: number;
  title: string;
  /** HTML body currently shown to the user. */
  contentHtml: string;
  /** Plain-text / markdown body — used for the raw-copy and AI rewrite. */
  contentMd?: string | null;
  url?: string;
  siteName?: string | null;
  /** Optional AI model id forwarded to the Telegram-format edge function. */
  aiModel?: string;
}

interface ParaPair {
  /** Block kind — 'h' = heading, 'p' = paragraph/list/quote. */
  kind: 'h' | 'p';
  level?: number; // for headings
  en: string;
  fa?: string;
}

async function buildPairs(
  bookId: string,
  chapterIndex: number,
  html: string,
): Promise<ParaPair[]> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body ?? doc.documentElement;
  const out: ParaPair[] = [];
  // Walk top-level block elements in order.
  const blocks = root.querySelectorAll(
    'h1, h2, h3, h4, h5, h6, p, blockquote, li',
  );
  for (const el of Array.from(blocks)) {
    const raw = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      out.push({ kind: 'h', level: Number(tag.slice(1)), en: raw });
      continue;
    }
    // Mirror the renderer's chunking so cache lookups align with what the
    // batch analyzer wrote.
    const chunks = splitIntoShortChunks(raw);
    for (const text of chunks) {
      if (text.split(/\s+/).length < 4) {
        out.push({ kind: 'p', en: text });
        continue;
      }
      let fa: string | undefined;
      try {
        const cached = await getCachedParagraphAnalysis(bookId, chapterIndex, text);
        fa = cached?.translation?.trim() || undefined;
      } catch {
        /* ignore */
      }
      out.push({ kind: 'p', en: text, fa });
    }
  }
  return out;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeFilename(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'article'
  );
}

function buildBilingualHtml(title: string, siteName: string | undefined, url: string | undefined, pairs: ParaPair[]): string {
  const body = pairs
    .map((p) => {
      if (p.kind === 'h') {
        const lvl = Math.max(2, Math.min(6, p.level ?? 2));
        return `<h${lvl} class="heading">${esc(p.en)}</h${lvl}>`;
      }
      const en = `<p class="en" dir="ltr"><span class="lang-tag">EN</span>${esc(p.en)}</p>`;
      const fa = p.fa
        ? `<p class="fa" dir="rtl"><span class="lang-tag">FA</span>${esc(p.fa)}</p>`
        : '';
      return `<div class="para">${en}${fa}</div>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    max-width: 760px; margin: 0 auto; padding: 1rem 1.25rem 4rem;
    line-height: 1.65; color: #1a1a1a; background: #fafaf9; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f0f10; color: #ececec; }
    .toolbar { background: #1a1a1c; border-color: #2a2a2c; }
    .para { border-color: #2a2a2c; }
    .lang-tag { background: #2a2a2c; color: #aaa; }
    .meta { color: #888; }
    button { background: #2a2a2c; color: #ececec; border-color: #3a3a3c; }
    button.active { background: #3b82f6; color: #fff; border-color: #3b82f6; }
  }
  h1 { font-size: 1.75rem; margin: 0 0 .25rem; }
  .meta { color: #666; font-size: .85rem; margin-bottom: 1rem; }
  .heading { margin: 2rem 0 .75rem; font-weight: 700; }
  .para { margin: 1rem 0; padding: .75rem .9rem; border: 1px solid #e5e5e3;
    border-radius: 10px; background: rgba(255,255,255,.5); }
  .en, .fa { margin: .15rem 0; }
  .fa { font-size: 1.02rem; }
  .lang-tag { display: inline-block; font-size: .65rem; font-weight: 600;
    background: #ececea; color: #555; padding: 1px 6px; border-radius: 999px;
    margin-inline-end: .4rem; vertical-align: middle; }
  .toolbar { position: sticky; top: 0; z-index: 5; display: flex; gap: .4rem;
    padding: .55rem .65rem; background: #fafaf9; border-bottom: 1px solid #e5e5e3;
    margin: -1rem -1.25rem 1rem; flex-wrap: wrap; align-items: center; }
  .toolbar strong { font-size: .8rem; margin-inline-end: .35rem; opacity: .7; }
  button { font: inherit; font-size: .8rem; padding: .35rem .7rem;
    border: 1px solid #d4d4d2; border-radius: 8px; background: #fff;
    cursor: pointer; }
  button.active { background: #3b82f6; color: #fff; border-color: #3b82f6; }
  body[data-mode="en"] .fa { display: none; }
  body[data-mode="fa"] .en { display: none; }
  /* per-paragraph toggle */
  .para[data-hide="en"] .en { display: none; }
  .para[data-hide="fa"] .fa { display: none; }
  .para .row { display: flex; gap: .3rem; margin-bottom: .25rem; opacity: .7; }
  .para .row button { font-size: .65rem; padding: .15rem .45rem; border-radius: 6px; }
  .src { margin-top: 3rem; font-size: .8rem; color: #888; border-top: 1px solid #e5e5e3; padding-top: 1rem; }
  a { color: #2563eb; }
</style>
</head>
<body data-mode="both">
<nav class="toolbar" dir="rtl">
  <strong>نمایش زبان:</strong>
  <button data-mode="both" class="active" type="button">دو زبانه</button>
  <button data-mode="en" type="button">English</button>
  <button data-mode="fa" type="button">فارسی</button>
</nav>
<h1>${esc(title)}</h1>
<p class="meta">${esc(siteName ?? '')}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>` : ''}</p>

${body}

<p class="src">Generated bilingual export.</p>

<script>
(function(){
  // Global mode toggle.
  document.querySelectorAll('.toolbar button').forEach(function(btn){
    btn.addEventListener('click', function(){
      var m = btn.getAttribute('data-mode');
      document.body.setAttribute('data-mode', m);
      document.querySelectorAll('.toolbar button').forEach(function(b){
        b.classList.toggle('active', b === btn);
      });
      // clear per-paragraph overrides
      document.querySelectorAll('.para').forEach(function(p){ p.removeAttribute('data-hide'); });
    });
  });
  // Per-paragraph toggle (click anywhere on the .lang-tag to hide that side).
  document.querySelectorAll('.para').forEach(function(p){
    var row = document.createElement('div');
    row.className = 'row';
    row.dir = 'rtl';
    ['EN','FA'].forEach(function(L){
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = (L === 'EN' ? 'فقط انگلیسی' : 'فقط فارسی');
      b.addEventListener('click', function(){
        var hide = (L === 'EN') ? 'fa' : 'en';
        p.setAttribute('data-hide', p.getAttribute('data-hide') === hide ? '' : hide);
      });
      row.appendChild(b);
    });
    var reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'هر دو';
    reset.addEventListener('click', function(){ p.removeAttribute('data-hide'); });
    row.appendChild(reset);
    p.insertBefore(row, p.firstChild);
  });
})();
</script>
</body>
</html>`;
}

async function copyRich(html: string, plain: string): Promise<void> {
  // Prefer the modern Clipboard API with multiple MIME types so Telegram
  // (which honours rich-text paste) keeps the bold formatting.
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return;
    }
  } catch {
    /* fall through to plain-text fallback */
  }
  await navigator.clipboard.writeText(plain);
}

export function NewsShareMenu({
  bookId,
  chapterIndex,
  title,
  contentHtml,
  contentMd,
  url,
  siteName,
  aiModel,
}: Props) {
  const [busy, setBusy] = useState<null | 'html' | 'fa' | 'raw' | 'tg'>(null);

  const downloadHtml = async () => {
    setBusy('html');
    try {
      const pairs = await buildPairs(bookId, chapterIndex, contentHtml);
      if (pairs.length === 0) {
        toast.error('متنی برای خروجی پیدا نشد.');
        return;
      }
      const html = buildBilingualHtml(title, siteName ?? undefined, url, pairs);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${safeFilename(title)}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      const withFa = pairs.filter((p) => p.fa).length;
      toast.success(`فایل ذخیره شد — ${withFa} پاراگراف ترجمه دارد.`);
    } catch (e: any) {
      toast.error(e?.message ?? 'ذخیره فایل شکست خورد.');
    } finally {
      setBusy(null);
    }
  };

  const copyRaw = async () => {
    setBusy('raw');
    try {
      const body = (contentMd && contentMd !== '__SCRAPE_FAILED__'
        ? contentMd
        : '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (!body) {
        toast.error('متنی برای کپی پیدا نشد.');
        return;
      }
      const out = `${title}\n${siteName ? siteName + (url ? ' · ' + url : '') : (url ?? '')}\n\n${body}`.trim();
      await navigator.clipboard.writeText(out);
      toast.success('متن خام کپی شد.');
    } catch (e: any) {
      toast.error(e?.message ?? 'کپی شکست خورد.');
    } finally {
      setBusy(null);
    }
  };

  const copyFaRaw = async () => {
    setBusy('fa');
    try {
      const pairs = await buildPairs(bookId, chapterIndex, contentHtml);
      const lines: string[] = [title, ''];
      let withFa = 0;
      for (const p of pairs) {
        if (p.kind === 'h') { lines.push('', p.en, ''); continue; }
        if (p.fa) { lines.push(p.fa); withFa++; }
        else lines.push(p.en);
      }
      if (withFa === 0) {
        toast.error('هنوز ترجمه‌ای کش نشده — اول دکمه ترجمه را بزن.');
        return;
      }
      await navigator.clipboard.writeText(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
      toast.success(`متن فارسی کپی شد — ${withFa} پاراگراف.`);
    } catch (e: any) {
      toast.error(e?.message ?? 'کپی شکست خورد.');
    } finally {
      setBusy(null);
    }
  };

  const copyTelegram = async () => {
    setBusy('tg');
    try {
      // Prefer the assembled Persian translation if cached; otherwise fall back
      // to the original markdown and let the AI translate inside the same call.
      const pairs = await buildPairs(bookId, chapterIndex, contentHtml);
      const faLines = pairs
        .map((p) => (p.kind === 'h' ? `\n${p.en}\n` : (p.fa ?? '')))
        .filter(Boolean)
        .join('\n\n')
        .trim();
      const res = await formatForTelegram({
        title,
        contentMd: contentMd ?? undefined,
        contentFa: faLines || undefined,
        url,
        siteName: siteName ?? undefined,
        model: aiModel,
      });
      await copyRich(res.html, res.plain);
      toast.success('متن آماده تلگرام کپی شد ✨');
    } catch (e: any) {
      toast.error(e?.message ?? 'بازنویسی شکست خورد.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Share" title="اشتراک‌گذاری">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>ذخیره فایل</DropdownMenuLabel>
        <DropdownMenuItem onClick={downloadHtml} disabled={busy !== null}>
          <FileDown className="h-4 w-4 me-2" />
          <div className="flex flex-col">
            <span>HTML دوزبانه</span>
            <span className="text-[10px] text-muted-foreground">با سوییچ EN/FA برای هر پاراگراف</span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>کپی متن</DropdownMenuLabel>
        <DropdownMenuItem onClick={copyRaw} disabled={busy !== null}>
          <Copy className="h-4 w-4 me-2" />
          <div className="flex flex-col">
            <span>متن خام + تیتر</span>
            <span className="text-[10px] text-muted-foreground">همان متن اصلی به‌علاوهٔ عنوان و منبع</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copyFaRaw} disabled={busy !== null}>
          <Copy className="h-4 w-4 me-2" />
          <div className="flex flex-col">
            <span>متن فارسی (ترجمه شده)</span>
            <span className="text-[10px] text-muted-foreground">از کش پاراگراف‌ها</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copyTelegram} disabled={busy !== null}>
          <Sparkles className="h-4 w-4 me-2 text-primary" />
          <div className="flex flex-col">
            <span>بازنویسی برای تلگرام (AI)</span>
            <span className="text-[10px] text-muted-foreground">سبک وبلاگی، با bold روی نکات</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
