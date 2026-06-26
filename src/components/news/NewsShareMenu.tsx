/**
 * Share menu for a news article.
 *
 * The HTML export now supports:
 *  - optional inclusion of images from the article body
 *  - a user-chosen filename (Persian or English)
 *  - per-paragraph cached analyses (vocab + idioms) that pop open on tap
 *    of the Persian paragraph in bilingual mode
 *  - reliable light/dark/sepia toggle and the settings panel
 *    (font / size / alignment) restored
 *  - export options + in-document reader prefs persisted in localStorage
 */
import { useEffect, useState } from 'react';
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { getCachedParagraphAnalysis } from '@/lib/bookAnalysis';
import { splitIntoShortChunks } from '@/lib/paragraphSplit';
import { formatForTelegram } from '@/lib/news';
import { suggestPersianHtmlFilename } from '@/lib/htmlFilename';
import type { BookParagraphAnalysis } from '@/types';

interface Props {
  bookId: string;
  chapterIndex: number;
  title: string;
  contentHtml: string;
  contentMd?: string | null;
  url?: string;
  siteName?: string | null;
  aiModel?: string;
}

type ParaPair =
  | { kind: 'h'; level: number; en: string; fa?: string }
  | { kind: 'p'; en: string; fa?: string; analysis?: BookParagraphAnalysis | null }
  | { kind: 'img'; src: string; alt?: string; caption?: string };

async function buildPairs(
  bookId: string,
  chapterIndex: number,
  html: string,
  opts: { includeImages: boolean },
): Promise<ParaPair[]> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body ?? doc.documentElement;
  const out: ParaPair[] = [];
  const selector = opts.includeImages
    ? 'h1, h2, h3, h4, h5, h6, p, blockquote, li, figure, img'
    : 'h1, h2, h3, h4, h5, h6, p, blockquote, li';
  const blocks = root.querySelectorAll(selector);
  const seenImgs = new Set<string>();
  for (const el of Array.from(blocks)) {
    const tag = el.tagName.toLowerCase();
    if (opts.includeImages && (tag === 'figure' || tag === 'img')) {
      const img = tag === 'img' ? (el as HTMLImageElement) : el.querySelector('img');
      const src = img?.getAttribute('src') || img?.getAttribute('data-src') || '';
      if (!src || seenImgs.has(src) || src.startsWith('data:')) continue;
      seenImgs.add(src);
      const alt = img?.getAttribute('alt') || '';
      const cap = tag === 'figure' ? (el.querySelector('figcaption')?.textContent ?? '').trim() : '';
      out.push({ kind: 'img', src, alt, caption: cap || undefined });
      continue;
    }
    const raw = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    if (/^h[1-6]$/.test(tag)) {
      let fa: string | undefined;
      try {
        const cached = await getCachedParagraphAnalysis(bookId, chapterIndex, raw);
        fa = cached?.translation?.trim() || undefined;
      } catch { /* ignore */ }
      out.push({ kind: 'h', level: Number(tag.slice(1)), en: raw, fa });
      continue;
    }
    const chunks = splitIntoShortChunks(raw);
    for (const text of chunks) {
      if (text.split(/\s+/).length < 4) {
        out.push({ kind: 'p', en: text });
        continue;
      }
      let cached: BookParagraphAnalysis | null = null;
      try {
        cached = (await getCachedParagraphAnalysis(bookId, chapterIndex, text)) ?? null;
      } catch { /* ignore */ }
      out.push({
        kind: 'p',
        en: text,
        fa: cached?.translation?.trim() || undefined,
        analysis: cached,
      });
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

function safeFilename(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'article'
  );
}

function plainSnippetFromHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2500);
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2500);
  }
}

function buildAnalysisHtml(a: BookParagraphAnalysis | null | undefined): string {
  if (!a) return '';
  const vocab = (a.vocabulary ?? []).filter((v) => v?.word);
  const idioms = (a.idioms ?? []).filter((i) => i?.phrase);
  if (vocab.length === 0 && idioms.length === 0) return '';
  const vocabHtml = vocab.length
    ? `<div class="anx-sec"><div class="anx-h">واژگان</div><ul>${vocab
        .map(
          (v) =>
            `<li><b dir="ltr">${esc(v.word)}</b>${v.partOfSpeech ? ` <i>(${esc(v.partOfSpeech)})</i>` : ''} — ${esc(v.translation || '')}${v.example ? `<div class="anx-ex" dir="ltr">${esc(v.example)}</div>` : ''}</li>`,
        )
        .join('')}</ul></div>`
    : '';
  const idiomsHtml = idioms.length
    ? `<div class="anx-sec"><div class="anx-h">اصطلاحات</div><ul>${idioms
        .map(
          (i) =>
            `<li><b dir="ltr">${esc(i.phrase)}</b> — ${esc(i.meaning || '')}${i.literalTranslation ? `<div class="anx-ex">${esc(i.literalTranslation)}</div>` : ''}</li>`,
        )
        .join('')}</ul></div>`
    : '';
  return `<div class="anx" hidden>${vocabHtml}${idiomsHtml}</div>`;
}

function buildBilingualHtml(
  title: string,
  siteName: string | undefined,
  url: string | undefined,
  pairs: ParaPair[],
): string {
  const body = pairs
    .map((p) => {
      if (p.kind === 'img') {
        return `<figure class="fig"><img src="${esc(p.src)}" alt="${esc(p.alt ?? '')}" loading="lazy" />${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`;
      }
      if (p.kind === 'h') {
        const lvl = Math.max(2, Math.min(6, p.level));
        const enH = `<h${lvl} class="heading en" dir="ltr">${esc(p.en)}</h${lvl}>`;
        const faH = p.fa ? `<h${lvl} class="heading fa" dir="rtl">${esc(p.fa)}</h${lvl}>` : '';
        return `<div class="para">${enH}${faH}</div>`;
      }
      const en = `<p class="en" dir="ltr">${esc(p.en)}</p>`;
      const anx = buildAnalysisHtml(p.analysis);
      const hasAnx = anx ? ' data-anx="1"' : '';
      const fa = p.fa
        ? `<p class="fa${anx ? ' has-anx' : ''}" dir="rtl"${hasAnx}>${esc(p.fa)}</p>`
        : '';
      return `<div class="para">${en}${fa}${anx}</div>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<title>${esc(title)}</title>
<style>
  :root { --bg:#fafaf9; --fg:#1a1a1a; --muted:#666; --border:#e5e5e3; --btn:#fff; --btnFg:#1a1a1a; --btnBorder:#d4d4d2; --accent:#3b82f6; --toolbarBg:#fafaf9f2; --panelBg:#ffffff; --anxBg:#f1f5f9; }
  html[data-theme="dark"]  { --bg:#0f0f10; --fg:#ececec; --muted:#888; --border:#2a2a2c; --btn:#2a2a2c; --btnFg:#ececec; --btnBorder:#3a3a3c; --toolbarBg:#1a1a1cf2; --panelBg:#18181a; --anxBg:#1d1d20; }
  html[data-theme="sepia"] { --bg:#f4ecd8; --fg:#3a2e1f; --muted:#7a6a55; --border:#e0d3b3; --btn:#fff8e8; --btnFg:#3a2e1f; --btnBorder:#d6c79a; --toolbarBg:#f4ecd8f2; --panelBg:#fbf5e3; --anxBg:#ede2c4; }
  * { box-sizing: border-box; }
  html { font-size: var(--fs, 17px); background: var(--bg); color: var(--fg); }
  html, body { margin:0; padding:0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, 'Vazirmatn', 'Tahoma', sans-serif;
    max-width: 760px; margin: 0 auto; padding: 1rem 1.25rem 4rem;
    line-height: 1.85; color: var(--fg); background: var(--bg);
    transition: background .15s, color .15s; }
  html[data-font="serif"] body { font-family: 'Iowan Old Style','Palatino Linotype','Georgia',serif; }
  html[data-font="mono"]  body { font-family: ui-monospace,'SF Mono',Menlo,Consolas,monospace; }
  html[data-font="vazir"] body { font-family: 'Vazirmatn','IRANSans','Tahoma',sans-serif; }
  html[data-align="justify"] .en, html[data-align="justify"] .fa, html[data-align="justify"] .heading { text-align: justify; text-justify: inter-word; }
  html[data-align="center"]  .en, html[data-align="center"]  .fa, html[data-align="center"]  .heading { text-align: center; }
  html[data-align="start"]   .en { text-align: left; }
  html[data-align="start"]   .fa { text-align: right; }
  h1 { font-size: 1.75rem; margin: 0 0 .25rem; }
  .meta { color: var(--muted); font-size: .85rem; margin-bottom: 1.25rem; }
  .heading { margin: 1.5rem 0 .5rem; font-weight: 700; }
  .para { margin: .5rem 0; }
  .en, .fa { margin: .25rem 0; }
  .fa { font-size: 1.02rem; line-height: 2;
    font-family: 'Vazirmatn','IRANSans','Tahoma',sans-serif; }
  .fa.has-anx { cursor: pointer; }
  .fa.has-anx:hover { background: var(--anxBg); border-radius: 6px; }
  .anx-tag { font-size: .75rem; opacity: .55; margin-inline-start: .35rem; }
  .anx { background: var(--anxBg); border-radius: 10px; padding: .6rem .8rem; margin: .35rem 0 .6rem;
    border: 1px solid var(--border); font-size: .92rem; }
  .anx[hidden] { display: none; }
  .anx-sec + .anx-sec { margin-top: .5rem; }
  .anx-h { font-size: .75rem; opacity: .7; margin-bottom: .25rem; font-weight: 700; }
  .anx ul { margin: 0; padding-inline-start: 1.2rem; }
  .anx li { margin: .15rem 0; }
  .anx-ex { opacity: .75; font-size: .85rem; margin-top: .1rem; }
  .fig { margin: 1rem 0; }
  .fig img { max-width: 100%; height: auto; border-radius: 8px; display: block; }
  .fig figcaption { font-size: .8rem; color: var(--muted); margin-top: .3rem; text-align: center; }
  .toolbar { position: sticky; top: 0; z-index: 5; display: flex; gap: .4rem;
    padding: .5rem .6rem; background: var(--toolbarBg); backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
    margin: -1rem -1.25rem 1rem; align-items: center; justify-content: space-between; }
  .toolbar .grp { display: inline-flex; gap: 2px; align-items: center; }
  button { font: inherit; font-size: .8rem; padding: .35rem .6rem;
    border: 1px solid var(--btnBorder); border-radius: 7px; background: var(--btn); color: var(--btnFg);
    cursor: pointer; line-height: 1; }
  button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  button.gear { padding: .35rem .55rem; font-size: 1rem; }
  .panel { position: fixed; top: 3rem; inset-inline-end: .6rem; z-index: 10;
    background: var(--panelBg); border:1px solid var(--border); border-radius: 12px;
    padding: .75rem; box-shadow: 0 10px 30px rgba(0,0,0,.25); min-width: 240px; display:none; }
  .panel.open { display: block; }
  .panel .row { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:.5rem; align-items:center; }
  .panel strong { font-size: .72rem; opacity: .7; min-width: 50px; display:inline-block; }
  html[data-mode="en"] .fa, html[data-mode="en"] .anx { display: none !important; }
  html[data-mode="fa"] .en, html[data-mode="fa"] .anx { display: none !important; }
  .src { margin-top: 3rem; font-size: .8rem; color: var(--muted); border-top: 1px solid var(--border); padding-top: 1rem; }
  a { color: var(--accent); }
  .hint { font-size:.7rem; color: var(--muted); margin-top:.4rem; }
</style>
</head>
<body>
<nav class="toolbar" dir="rtl">
  <div class="grp">
    <button data-mode="both" type="button">دو</button>
    <button data-mode="fa" type="button">فا</button>
    <button data-mode="en" type="button">EN</button>
  </div>
  <button class="gear" id="gearBtn" type="button" aria-label="تنظیمات">⚙</button>
</nav>
<div class="panel" id="settingsPanel" dir="rtl">
  <div class="row"><strong>تم</strong>
    <button data-theme="light" type="button">روز</button>
    <button data-theme="sepia" type="button">کاغذ</button>
    <button data-theme="dark" type="button">شب</button>
  </div>
  <div class="row"><strong>فونت</strong>
    <button data-font="sans" type="button">Sans</button>
    <button data-font="serif" type="button">Serif</button>
    <button data-font="vazir" type="button">Vazir</button>
  </div>
  <div class="row"><strong>اندازه</strong>
    <button data-fs="dec" type="button">A−</button>
    <button data-fs="reset" type="button">A</button>
    <button data-fs="inc" type="button">A+</button>
  </div>
  <div class="row"><strong>چینش</strong>
    <button data-align="start" type="button">طبیعی</button>
    <button data-align="justify" type="button">هم‌تراز</button>
    <button data-align="center" type="button">وسط</button>
  </div>
  <div class="hint">روی پاراگراف فارسی بزن تا واژگان/اصطلاحات باز شود.</div>
</div>
<h1>${esc(title)}</h1>
<p class="meta">${esc(siteName ?? '')}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>` : ''}</p>

${body}

<p class="src">Generated bilingual export.</p>

<script>
(function(){
  var K='llvp-html-prefs-v2';
  var DEFAULTS = { mode:'both', theme:'light', font:'sans', align:'start', fs:17 };
  var prefs = Object.assign({}, DEFAULTS);
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(K)||'{}')||{}); } catch(e){}
  var root = document.documentElement;
  function applyAll(){
    root.style.setProperty('--fs', prefs.fs+'px');
    ['mode','theme','font','align'].forEach(function(g){
      root.setAttribute('data-'+g, prefs[g]);
      document.querySelectorAll('button[data-'+g+']').forEach(function(b){
        b.classList.toggle('active', b.getAttribute('data-'+g) === prefs[g]);
      });
    });
  }
  function save(){ try { localStorage.setItem(K, JSON.stringify(prefs)); } catch(e){} }

  document.querySelectorAll('.toolbar button, .panel button').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      ['mode','theme','font','align'].forEach(function(g){
        var v = btn.getAttribute('data-'+g);
        if (v){ prefs[g] = v; }
      });
      var fsCmd = btn.getAttribute('data-fs');
      if (fsCmd === 'inc') prefs.fs = Math.min(40, prefs.fs+2);
      else if (fsCmd === 'dec') prefs.fs = Math.max(10, prefs.fs-2);
      else if (fsCmd === 'reset') prefs.fs = 17;
      applyAll();
      save();
    });
  });

  var gear = document.getElementById('gearBtn');
  var panel = document.getElementById('settingsPanel');
  gear.addEventListener('click', function(e){ e.stopPropagation(); panel.classList.toggle('open'); });
  document.addEventListener('click', function(e){
    if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== gear) {
      panel.classList.remove('open');
    }
  });

  // Tap a Persian paragraph to reveal cached analysis
  document.querySelectorAll('.fa.has-anx').forEach(function(p){
    p.addEventListener('click', function(){
      var anx = p.parentElement && p.parentElement.querySelector('.anx');
      if (!anx) return;
      anx.hidden = !anx.hidden;
    });
  });

  // Pinch-zoom for font size
  var startDist = 0, startFs = prefs.fs;
  function dist(t){ var dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY; return Math.hypot(dx,dy); }
  document.addEventListener('touchstart', function(e){
    if (e.touches.length === 2){ startDist = dist(e.touches); startFs = prefs.fs; }
  }, { passive: true });
  document.addEventListener('touchmove', function(e){
    if (e.touches.length === 2 && startDist > 0){
      var d = dist(e.touches);
      var ratio = d / startDist;
      var next = Math.round(Math.max(10, Math.min(40, startFs * ratio)));
      if (next !== prefs.fs){ prefs.fs = next; root.style.setProperty('--fs', prefs.fs+'px'); }
    }
  }, { passive: true });
  document.addEventListener('touchend', function(e){
    if (startDist > 0 && e.touches.length < 2){ startDist = 0; save(); }
  });
  applyAll();
})();
</script>
</body>
</html>`;
}

async function copyRich(html: string, plain: string): Promise<void> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return;
    }
  } catch { /* fall through */ }
  await navigator.clipboard.writeText(plain);
}

// ----- Export-options persisted in localStorage -----
const EXPORT_PREFS_KEY = 'news-html-export-prefs-v1';
interface ExportPrefs {
  includeImages: boolean;
  filenameLang: 'auto' | 'fa' | 'en';
}
const DEFAULT_EXPORT_PREFS: ExportPrefs = { includeImages: true, filenameLang: 'auto' };

function loadExportPrefs(): ExportPrefs {
  try {
    const raw = localStorage.getItem(EXPORT_PREFS_KEY);
    if (!raw) return DEFAULT_EXPORT_PREFS;
    return { ...DEFAULT_EXPORT_PREFS, ...(JSON.parse(raw) ?? {}) };
  } catch { return DEFAULT_EXPORT_PREFS; }
}
function saveExportPrefs(p: ExportPrefs) {
  try { localStorage.setItem(EXPORT_PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prefs, setPrefs] = useState<ExportPrefs>(() => loadExportPrefs());
  const [filename, setFilename] = useState<string>(() => safeFilename(title));
  const [namingBusy, setNamingBusy] = useState(false);

  // Re-seed filename when the article (title) changes.
  useEffect(() => { setFilename(safeFilename(title)); }, [title]);

  function updatePrefs(patch: Partial<ExportPrefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveExportPrefs(next);
      return next;
    });
  }

  const suggestFilename = async () => {
    setNamingBusy(true);
    try {
      const name = await suggestPersianHtmlFilename({
        title,
        excerpt: plainSnippetFromHtml(contentHtml),
        siteName,
        url,
      });
      setFilename(safeFilename(name));
      toast.success('نام فارسی پیشنهاد شد.');
    } catch (e: any) {
      toast.error(e?.message ?? 'پیشنهاد نام فایل شکست خورد.');
    } finally {
      setNamingBusy(false);
    }
  };

  const runDownload = async () => {
    setBusy('html');
    try {
      const pairs = await buildPairs(bookId, chapterIndex, contentHtml, {
        includeImages: prefs.includeImages,
      });
      const textCount = pairs.filter((p) => p.kind !== 'img').length;
      if (textCount === 0) {
        toast.error('متنی برای خروجی پیدا نشد.');
        return;
      }
      const html = buildBilingualHtml(title, siteName ?? undefined, url, pairs);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${safeFilename(filename || title)}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      const withFa = pairs.filter((p) => p.kind === 'p' && p.fa).length;
      const imgs = pairs.filter((p) => p.kind === 'img').length;
      const withAnx = pairs.filter((p) => p.kind === 'p' && p.analysis && ((p.analysis.vocabulary?.length || 0) + (p.analysis.idioms?.length || 0)) > 0).length;
      toast.success(`فایل ذخیره شد — ${withFa} ترجمه، ${withAnx} پردازش، ${imgs} عکس.`);
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'ذخیره فایل شکست خورد.');
    } finally {
      setBusy(null);
    }
  };

  const copyRaw = async () => {
    setBusy('raw');
    try {
      const body = (contentMd && contentMd !== '__SCRAPE_FAILED__' ? contentMd : '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (!body) { toast.error('متنی برای کپی پیدا نشد.'); return; }
      const out = `${title}\n${siteName ? siteName + (url ? ' · ' + url : '') : (url ?? '')}\n\n${body}`.trim();
      await navigator.clipboard.writeText(out);
      toast.success('متن خام کپی شد.');
    } catch (e: any) {
      toast.error(e?.message ?? 'کپی شکست خورد.');
    } finally { setBusy(null); }
  };

  const copyFaRaw = async () => {
    setBusy('fa');
    try {
      const pairs = await buildPairs(bookId, chapterIndex, contentHtml, { includeImages: false });
      const lines: string[] = [title, ''];
      let withFa = 0;
      for (const p of pairs) {
        if (p.kind === 'h') { lines.push('', p.en, ''); continue; }
        if (p.kind === 'p') {
          if (p.fa) { lines.push(p.fa); withFa++; }
          else lines.push(p.en);
        }
      }
      if (withFa === 0) { toast.error('هنوز ترجمه‌ای کش نشده — اول دکمه ترجمه را بزن.'); return; }
      await navigator.clipboard.writeText(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
      toast.success(`متن فارسی کپی شد — ${withFa} پاراگراف.`);
    } catch (e: any) {
      toast.error(e?.message ?? 'کپی شکست خورد.');
    } finally { setBusy(null); }
  };

  const copyTelegram = async () => {
    setBusy('tg');
    try {
      const pairs = await buildPairs(bookId, chapterIndex, contentHtml, { includeImages: false });
      const faLines = pairs
        .map((p) => (p.kind === 'h' ? `\n${p.en}\n` : (p.kind === 'p' ? (p.fa ?? '') : '')))
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
    } finally { setBusy(null); }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Share" title="اشتراک‌گذاری">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>ذخیره فایل</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setDialogOpen(true)} disabled={busy !== null}>
            <FileDown className="h-4 w-4 me-2" />
            <div className="flex flex-col">
              <span>HTML دوزبانه…</span>
              <span className="text-[10px] text-muted-foreground">گزینه‌های نام فایل، عکس و پردازش</span>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>ذخیره HTML دوزبانه</DialogTitle>
            <DialogDescription>
              تنظیمات زیر برای دفعه‌های بعد ذخیره می‌شود.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="export-filename">نام فایل</Label>
              <Input
                id="export-filename"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="نام دلخواه (فارسی یا انگلیسی)"
                dir="auto"
              />
              <p className="text-[11px] text-muted-foreground">
                پسوند <code>.html</code> به‌صورت خودکار اضافه می‌شود.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={suggestFilename}
                disabled={namingBusy}
              >
                {namingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-primary" />}
                پیشنهاد اسم فارسی با AI
              </Button>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={prefs.includeImages}
                onCheckedChange={(v) => updatePrefs({ includeImages: Boolean(v) })}
              />
              <span className="text-sm">عکس‌های مقاله هم در فایل باشند</span>
            </label>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              ترجمه‌ها و پردازش‌های کش‌شده (واژگان و اصطلاحات) هم در فایل ذخیره می‌شوند؛
              در حالت دو زبانه با تَپ روی پاراگراف فارسی نمایان می‌شوند.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={busy === 'html'}>
              انصراف
            </Button>
            <Button onClick={runDownload} disabled={busy === 'html'}>
              {busy === 'html' ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <FileDown className="h-4 w-4 me-2" />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
