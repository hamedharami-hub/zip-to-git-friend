/**
 * Live news discovery via Gemini 3.5 Flash + Google Search Grounding.
 * User enters a topic and a time window; the model searches the web
 * in real time and returns fresh articles + an optional combined article.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, Clock, ExternalLink, Newspaper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  discoverLiveNews, scrapeArticle, upsertArticle,
  type LiveDiscoverItem, type LiveDiscoverResult,
} from '@/lib/news';

const WINDOW_OPTIONS = [
  { value: '6', label: '۶ ساعت اخیر' },
  { value: '24', label: '۲۴ ساعت اخیر' },
  { value: '72', label: '۳ روز اخیر' },
  { value: '168', label: '۱ هفته اخیر' },
];

function siteFromUrl(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function LiveDiscoverDialog() {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [windowHours, setWindowHours] = useState('24');
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [combining, setCombining] = useState(false);
  const [result, setResult] = useState<LiveDiscoverResult | null>(null);
  const navigate = useNavigate();

  const handleDiscover = async () => {
    const t = topic.trim();
    if (!t) {
      toast.error('یک موضوع وارد کن.');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await discoverLiveNews({
        topic: t,
        windowHours: Number(windowHours),
        maxResults: 10,
      });
      setResult(r);
      if (r.items.length === 0) {
        toast.info('چیزی پیدا نشد. موضوع دیگری امتحان کن.');
      }
    } catch (e: any) {
      toast.error(e.message ?? 'جستجوی زنده شکست خورد.');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenItem = async (item: LiveDiscoverItem) => {
    setOpening(item.url);
    try {
      const a = await scrapeArticle(item.url, {
        excerpt: item.summary,
        siteName: item.source,
      });
      const saved = await upsertArticle({
        sourceId: null,
        url: item.url,
        title: a.title || item.title,
        author: a.author,
        excerpt: a.excerpt ?? item.summary,
        contentMd: a.contentMd,
        contentHtml: a.contentHtml,
        imageUrl: a.imageUrl,
        siteName: a.siteName ?? item.source,
        language: a.language,
        publishedAt: a.publishedAt ?? item.publishedAt,
        wordCount: a.wordCount,
      });
      setOpen(false);
      navigate(`/news/article/${saved.id}`);
    } catch (e: any) {
      toast.error(e.message ?? 'باز کردن مقاله شکست خورد.');
    } finally {
      setOpening(null);
    }
  };

  const handleOpenCombined = async () => {
    if (!result?.combinedArticle?.markdown) return;
    setCombining(true);
    try {
      const ca = result.combinedArticle;
      // synthetic URL to dedupe in DB
      const syntheticUrl = `lovable://live-discover/${encodeURIComponent(topic.trim().toLowerCase())}/${Date.now()}`;
      const html = ca.markdown
        .split(/\n{2,}/)
        .map((p) => (p.startsWith('#') ? p : `<p>${p.replace(/\n/g, '<br/>')}</p>`))
        .join('\n');
      const saved = await upsertArticle({
        sourceId: null,
        url: syntheticUrl,
        title: ca.title,
        author: 'Live discovery (Gemini)',
        excerpt: null,
        contentMd: ca.markdown,
        contentHtml: html,
        imageUrl: null,
        siteName: 'Live discovery',
        language: 'en',
        publishedAt: new Date().toISOString(),
        wordCount: ca.markdown.split(/\s+/).filter(Boolean).length,
      });
      setOpen(false);
      navigate(`/news/article/${saved.id}`);
    } catch (e: any) {
      toast.error(e.message ?? 'ساخت مقالهٔ ترکیبی شکست خورد.');
    } finally {
      setCombining(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">کشف زنده</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            کشف زندهٔ خبر
          </DialogTitle>
          <DialogDescription>
            موضوعی وارد کن — مدل Gemini 3.5 Flash با جستجوی زندهٔ گوگل،
            تازه‌ترین خبرها را پیدا می‌کند.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="live-topic" className="text-xs">موضوع</Label>
            <Input
              id="live-topic"
              placeholder="مثلاً: AI regulation in Europe"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy) handleDiscover(); }}
              disabled={busy}
            />
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Select value={windowHours} onValueChange={setWindowHours} disabled={busy}>
              <SelectTrigger className="h-9 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleDiscover} disabled={busy} size="sm" className="ms-auto gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              جستجو
            </Button>
          </div>
        </div>

        {result && (
          <div className="mt-4 space-y-3">
            {result.combinedArticle?.markdown && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Newspaper className="h-4 w-4 text-primary" />
                  مقالهٔ ترکیبی آماده است
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2">
                  {result.combinedArticle.title}
                </div>
                <Button
                  size="sm"
                  onClick={handleOpenCombined}
                  disabled={combining}
                  className="gap-1.5"
                >
                  {combining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  باز کن
                </Button>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              {result.items.length} منبع پیدا شد
            </div>
            <ul className="space-y-2">
              {result.items.map((it) => (
                <li
                  key={it.url}
                  className="rounded-lg border border-border p-3 hover:bg-accent/30 transition-colors"
                >
                  <div className="text-sm font-medium leading-snug">{it.title}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span>{it.source || siteFromUrl(it.url)}</span>
                    {it.publishedAt && <span>· {it.publishedAt}</span>}
                  </div>
                  {it.summary && (
                    <p className="mt-1.5 text-xs text-muted-foreground line-clamp-3">{it.summary}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 gap-1 text-xs"
                      disabled={opening === it.url}
                      onClick={() => handleOpenItem(it)}
                    >
                      {opening === it.url
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Sparkles className="h-3 w-3" />}
                      باز کن
                    </Button>
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      منبع
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}
