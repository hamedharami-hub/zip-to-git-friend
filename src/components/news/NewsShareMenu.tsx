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
      // Headings are also analyzed/translated — pull the cached translation.
      let fa: string | undefined;
      try {
        const cached = await getCachedParagraphAnalysis(bookId, chapterIndex, raw);
        fa = cached?.translation?.trim() || undefined;
      } catch { /* ignore */ }
      out.push({ kind: 'h', level: Number(tag.slice(1)), en: raw, fa });
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
        const enH = `<h${lvl} class="heading en" dir="ltr">${esc(p.en)}</h${lvl}>`;
        const faH = p.fa
          ? `<h${lvl} class="heading fa" dir="rtl">${esc(p.fa)}</h${lvl}>`
          : '';
        return `<div class="para">${enH}${faH}</div>`;
      }
      const en = `<p class="en" dir="ltr">${esc(p.en)}</p>`;
      const fa = p.fa
        ? `<p class="fa" dir="rtl">${esc(p.fa)}</p>`
        : '';
      return `<div class="para">${en}${fa}</div>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Nunito+Sans:wght@300;400;600;700&family=Vazirmatn:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light dark; --bg:#fafaf9; --fg:#1a1a1a; --muted:#666; --border:#e5e5e3; --btn:#fff; --btnFg:#1a1a1a; --btnBorder:#d4d4d2; --accent:#3b82f6; --accentSoft:rgba(59,130,246,.08); --toolbarBg:#fafaf9; --panelBg:#ffffff; }
  body[data-theme="dark"]  { --bg:#0f0f10; --fg:#ececec; --muted:#888; --border:#2a2a2c; --btn:#2a2a2c; --btnFg:#ececec; --btnBorder:#3a3a3c; --accentSoft:rgba(96,165,250,.12); --toolbarBg:#1a1a1c; --panelBg:#18181a; }
  body[data-theme="sepia"] { --bg:#f4ecd8; --fg:#3a2e1f; --muted:#7a6a55; --border:#e0d3b3; --btn:#fff8e8; --btnFg:#3a2e1f; --btnBorder:#d6c79a; --accentSoft:rgba(140,90,40,.10); --toolbarBg:#f4ecd8; --panelBg:#fbf5e3; }
  * { box-sizing: border-box; }
  html { font-size: var(--fs, 18px); }
  html, body { margin:0; padding:0; touch-action: pan-x pan-y; }
  body { font-family: 'Lora','Iowan Old Style','Palatino Linotype','Georgia','Vazirmatn',serif;
    max-width: 720px; margin: 0 auto; padding: 1rem 1.25rem 4rem;
    line-height: 1.85; color: var(--fg); background: var(--bg);
    transition: background .15s, color .15s; }
  body[data-font="sans"]  { font-family: 'Nunito Sans','Vazirmatn',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; }
  body[data-font="serif"] { font-family: 'Lora','Iowan Old Style','Palatino Linotype','Georgia','Vazirmatn',serif; }
  body[data-font="mono"]  { font-family: ui-monospace,'SF Mono',Menlo,Consolas,monospace; }
  body[data-font="vazir"] { font-family: 'Vazirmatn','IRANSans','Tahoma',sans-serif; }
  body[data-align="justify"] .en, body[data-align="justify"] .fa, body[data-align="justify"] .heading,
  body[data-align="justify"] h1, body[data-align="justify"] p { text-align: justify; text-justify: inter-word; }
  body[data-align="justify"] .fa { text-align: justify; }
  body[data-align="center"]  .en, body[data-align="center"]  .fa, body[data-align="center"]  .heading { text-align: center; }
  body[data-align="start"]   .en { text-align: left; }
  body[data-align="start"]   .fa { text-align: right; }
  h1 { font-family: 'Lora','Vazirmatn',Georgia,serif; font-size: 2rem; line-height: 1.2; margin: 0 0 .5rem; font-weight: 600; letter-spacing: -0.01em; }
  .meta { color: var(--muted); font-size: .85rem; margin-bottom: 1.75rem; }
  .heading { font-family: 'Lora','Vazirmatn',Georgia,serif; margin: 1.75rem 0 .6rem; font-weight: 600; letter-spacing: -0.005em; line-height: 1.3; }
  h2.heading { font-size: 1.5rem; }
  h3.heading { font-size: 1.2rem; }
  .para { margin: .65rem 0; }
  .en, .fa { margin: .35rem 0; }
  .fa { font-size: 1.02rem; line-height: 2;
    font-family: 'Vazirmatn','IRANSans','Tahoma',sans-serif; }
  /* Drop-cap on first paragraph (English only — RTL drop-caps look odd) */
  .para:first-of-type .en::first-letter {
    font-family: 'Lora',Georgia,serif;
    font-size: 3.1em; float: left; line-height: .9;
    padding: .08em .12em 0 0; color: var(--accent); font-weight: 600;
  }
  .toolbar { position: sticky; top: 0; z-index: 5; display: flex; gap: .4rem;
    padding: .5rem .6rem; background: var(--toolbarBg); border-bottom: 1px solid var(--border);
    margin: -1rem -1.25rem 1rem; align-items: center; justify-content: space-between; }
  .toolbar .grp { display: inline-flex; gap: 2px; align-items: center; }
  button { font: inherit; font-size: .8rem; padding: .35rem .6rem;
    border: 1px solid var(--btnBorder); border-radius: 7px; background: var(--btn); color: var(--btnFg);
    cursor: pointer; line-height: 1; }
  button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  button.gear { padding: .35rem .55rem; font-size: 1rem; }
  .panel { position: fixed; top: 3rem; right: .6rem; z-index: 10;
    background: var(--panelBg); border:1px solid var(--border); border-radius: 12px;
    padding: .75rem; box-shadow: 0 10px 30px rgba(0,0,0,.18); min-width: 240px; display:none; }
  .panel.open { display: block; }
  .panel .row { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:.5rem; align-items:center; }
  .panel strong { font-size: .72rem; opacity: .7; min-width: 50px; display:inline-block; }
  body[data-mode="en"] .fa { display: none; }
  body[data-mode="fa"] .en { display: none; }
  .src { margin-top: 3rem; font-size: .8rem; color: var(--muted); border-top: 1px solid var(--border); padding-top: 1rem; }
  a { color: var(--accent); }
  .hint { font-size:.7rem; color: var(--muted); margin-top:.4rem; }
  .speaking { background: var(--accentSoft); border-radius: 6px; box-shadow: 0 0 0 4px var(--accentSoft); transition: background .2s; }
</style>
</head>
<body data-mode="both" data-theme="light" data-font="serif" data-align="justify" style="--fs:18px">
<nav class="toolbar" dir="rtl">
  <div class="grp">
    <button data-mode="both" class="active" type="button">دو</button>
    <button data-mode="fa" type="button">فا</button>
    <button data-mode="en" type="button">EN</button>
  </div>
  <div class="grp">
    <button id="ttsBtn" type="button" aria-label="پخش">▶︎</button>
    <button id="ttsStopBtn" type="button" aria-label="توقف" style="display:none">■</button>
    <button class="gear" id="gearBtn" type="button" aria-label="تنظیمات">⚙</button>
  </div>
</nav>
<div class="panel" id="settingsPanel" dir="rtl">
  <div class="row"><strong>تم</strong>
    <button data-theme="light" class="active" type="button">روز</button>
    <button data-theme="sepia" type="button">کاغذ</button>
    <button data-theme="dark" type="button">شب</button>
  </div>
  <div class="row"><strong>فونت</strong>
    <button data-font="sans" type="button">Sans</button>
    <button data-font="serif" class="active" type="button">Serif</button>
    <button data-font="vazir" type="button">Vazir</button>
  </div>
  <div class="row"><strong>اندازه</strong>
    <button data-fs="dec" type="button">A−</button>
    <button data-fs="reset" type="button">A</button>
    <button data-fs="inc" type="button">A+</button>
  </div>
  <div class="row"><strong>چینش</strong>
    <button data-align="start" type="button">طبیعی</button>
    <button data-align="justify" class="active" type="button">هم‌تراز</button>
    <button data-align="center" type="button">وسط</button>
  </div>
  <div class="row"><strong>صدا</strong>
    <select id="ttsVoiceFa" style="font:inherit;padding:.25rem;border-radius:6px;border:1px solid var(--btnBorder);background:var(--btn);color:var(--btnFg);max-width:130px"></select>
    <select id="ttsVoiceEn" style="font:inherit;padding:.25rem;border-radius:6px;border:1px solid var(--btnBorder);background:var(--btn);color:var(--btnFg);max-width:130px"></select>
  </div>
  <div class="row"><strong>سرعت</strong>
    <button data-rate="0.8" type="button">۰٫۸×</button>
    <button data-rate="1" class="active" type="button">۱×</button>
    <button data-rate="1.25" type="button">۱٫۲۵×</button>
    <button data-rate="1.5" type="button">۱٫۵×</button>
  </div>
  <div class="hint">برای تغییر سریع اندازه، با دو انگشت روی متن زوم کنید. پخش صوتی از TTS سیستم استفاده می‌کند.</div>
</div>
<h1>${esc(title)}</h1>
<p class="meta">${esc(siteName ?? '')}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>` : ''}</p>

${body}

<p class="src">Generated bilingual export.</p>

<script>
(function(){
  var K='llvp-html-prefs';
  var prefs={}; try{ prefs=JSON.parse(localStorage.getItem(K)||'{}')||{}; }catch(e){}
  var fs = prefs.fs || 17;
  function apply(){
    document.documentElement.style.setProperty("--fs", fs+'px');
    ['mode','theme','font','align'].forEach(function(g){
      var v = prefs[g]; if(!v) return;
      document.body.setAttribute('data-'+g, v);
      document.querySelectorAll('button[data-'+g+']').forEach(function(b){
        b.classList.toggle('active', b.getAttribute('data-'+g) === v);
      });
    });
  }
  function save(){ try{ localStorage.setItem(K, JSON.stringify(prefs)); }catch(e){} }
  document.querySelectorAll('.toolbar button, .panel button').forEach(function(btn){
    btn.addEventListener('click', function(){
      ['mode','theme','font','align'].forEach(function(g){
        var v = btn.getAttribute('data-'+g);
        if (v){
          prefs[g]=v;
          document.body.setAttribute('data-'+g, v);
          document.querySelectorAll('button[data-'+g+']').forEach(function(b){
            b.classList.toggle('active', b.getAttribute('data-'+g) === v);
          });
        }
      });
      var fsCmd = btn.getAttribute('data-fs');
      if (fsCmd === 'inc') fs = Math.min(40, fs+2);
      else if (fsCmd === 'dec') fs = Math.max(10, fs-2);
      else if (fsCmd === 'reset') fs = 17;
      if (fsCmd){ prefs.fs = fs; document.documentElement.style.setProperty("--fs", fs+'px'); }
      save();
    });
  });
  // ⚙ panel open/close
  var gear = document.getElementById('gearBtn');
  var panel = document.getElementById('settingsPanel');
  gear.addEventListener('click', function(e){ e.stopPropagation(); panel.classList.toggle('open'); });
  document.addEventListener('click', function(e){ if (!panel.contains(e.target) && e.target !== gear) panel.classList.remove('open'); });

  // Pinch-zoom for font size
  var startDist = 0, startFs = fs;
  function dist(t){ var dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY; return Math.hypot(dx,dy); }
  document.addEventListener('touchstart', function(e){
    if (e.touches.length === 2){ startDist = dist(e.touches); startFs = fs; }
  }, { passive: true });
  document.addEventListener('touchmove', function(e){
    if (e.touches.length === 2 && startDist > 0){
      var d = dist(e.touches);
      var ratio = d / startDist;
      var next = Math.round(Math.max(10, Math.min(40, startFs * ratio)));
      if (next !== fs){ fs = next; document.documentElement.style.setProperty("--fs", fs+'px'); }
    }
  }, { passive: true });
  document.addEventListener('touchend', function(e){
    if (startDist > 0 && e.touches.length < 2){ startDist = 0; prefs.fs = fs; save(); }
  });
  apply();

  // -------- TTS playback (browser SpeechSynthesis) --------
  var synth = window.speechSynthesis;
  var ttsBtn = document.getElementById('ttsBtn');
  var ttsStop = document.getElementById('ttsStopBtn');
  var selFa = document.getElementById('ttsVoiceFa');
  var selEn = document.getElementById('ttsVoiceEn');
  var rate = prefs.rate || 1;
  var queue = [], qi = 0, playing = false, currentEl = null;

  function loadVoices(){
    if (!synth) return;
    var voices = synth.getVoices() || [];
    function fill(sel, langPrefix, savedKey){
      sel.innerHTML = '';
      var matches = voices.filter(function(v){ return v.lang && v.lang.toLowerCase().indexOf(langPrefix) === 0; });
      var list = matches.length ? matches : voices;
      list.forEach(function(v){
        var o = document.createElement('option');
        o.value = v.name; o.textContent = v.name + ' (' + v.lang + ')';
        if (prefs[savedKey] === v.name) o.selected = true;
        sel.appendChild(o);
      });
    }
    fill(selFa, 'fa', 'voiceFa');
    fill(selEn, 'en', 'voiceEn');
  }
  if (synth){
    loadVoices();
    synth.onvoiceschanged = loadVoices;
  }
  selFa && selFa.addEventListener('change', function(){ prefs.voiceFa = selFa.value; save(); });
  selEn && selEn.addEventListener('change', function(){ prefs.voiceEn = selEn.value; save(); });

  document.querySelectorAll('button[data-rate]').forEach(function(btn){
    btn.addEventListener('click', function(){
      rate = parseFloat(btn.getAttribute('data-rate'));
      prefs.rate = rate; save();
      document.querySelectorAll('button[data-rate]').forEach(function(b){
        b.classList.toggle('active', b === btn);
      });
      // restart current item with new rate
      if (playing){ synth.cancel(); speakAt(qi); }
    });
  });

  function buildQueue(){
    var items = [];
    var mode = document.body.getAttribute('data-mode') || 'both';
    // include H1 title
    var h1 = document.querySelector('h1');
    if (h1) items.push({ el: h1, text: h1.textContent.trim(), lang: 'en' });
    document.querySelectorAll('.para').forEach(function(p){
      var en = p.querySelector('.en');
      var fa = p.querySelector('.fa');
      if (mode === 'en' || mode === 'both'){
        if (en && en.textContent.trim()) items.push({ el: en, text: en.textContent.trim(), lang: 'en' });
      }
      if (mode === 'fa' || mode === 'both'){
        if (fa && fa.textContent.trim()) items.push({ el: fa, text: fa.textContent.trim(), lang: 'fa' });
      }
    });
    return items;
  }
  function pickVoice(lang){
    var voices = synth.getVoices() || [];
    var name = lang === 'fa' ? prefs.voiceFa : prefs.voiceEn;
    if (name){ var m = voices.find(function(v){ return v.name === name; }); if (m) return m; }
    return voices.find(function(v){ return v.lang && v.lang.toLowerCase().indexOf(lang) === 0; }) || null;
  }
  function clearHL(){ if (currentEl){ currentEl.classList.remove('speaking'); currentEl = null; } }
  function speakAt(i){
    if (!synth) return;
    qi = i;
    if (qi >= queue.length){ stop(); return; }
    var it = queue[qi];
    clearHL();
    currentEl = it.el; currentEl.classList.add('speaking');
    try { currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(e){}
    var u = new SpeechSynthesisUtterance(it.text);
    u.lang = it.lang === 'fa' ? 'fa-IR' : 'en-US';
    var v = pickVoice(it.lang); if (v) u.voice = v;
    u.rate = rate;
    u.onend = function(){ if (playing) speakAt(qi + 1); };
    u.onerror = function(){ if (playing) speakAt(qi + 1); };
    synth.speak(u);
  }
  function start(){
    if (!synth){ alert('مرورگر شما از TTS پشتیبانی نمی‌کند.'); return; }
    queue = buildQueue();
    if (!queue.length) return;
    playing = true;
    ttsBtn.style.display = 'none';
    ttsStop.style.display = '';
    synth.cancel();
    speakAt(0);
  }
  function stop(){
    playing = false;
    if (synth) synth.cancel();
    clearHL();
    ttsBtn.style.display = '';
    ttsStop.style.display = 'none';
  }
  ttsBtn && ttsBtn.addEventListener('click', start);
  ttsStop && ttsStop.addEventListener('click', stop);
  // set active rate button from prefs
  document.querySelectorAll('button[data-rate]').forEach(function(b){
    b.classList.toggle('active', parseFloat(b.getAttribute('data-rate')) === rate);
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
