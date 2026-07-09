import { useState } from 'react';
import type React from 'react';
import {
  Plus, Rss, Globe2, Search, Loader2, Sparkles, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  addSource, discoverRss, getCachedDiscovery,
  type DiscoveryResult, type NewsSource, type NewsSourceKind,
} from '@/lib/news';

function bingNewsRssUrl(topic: string): string {
  return `https://www.bing.com/news/search?q=${encodeURIComponent(topic)}&format=rss`;
}

function RssDiscovery({
  onPick,
  onInstantDigest,
}: {
  onPick: (feed: { name: string; url: string }) => void;
  onInstantDigest?: (topic: string, feedUrl: string, label: string) => Promise<void> | void;
}) {
  const [topic, setTopic] = useState('');
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [searchedTopic, setSearchedTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [digestBusy, setDigestBusy] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const handleSearch = async (forceRefresh = false) => {
    const t = topic.trim();
    if (!t) return;
    setBusy(true);
    setSearched(true);
    setSearchedTopic(t);
    try {
      const cached = getCachedDiscovery(t);
      if (cached && !forceRefresh) setResult(cached);
      const fresh = await discoverRss({ topic: t, forceRefresh });
      setResult(fresh);
      if (fresh.sites.length === 0) toast.info('سایت اختصاصی پیدا نشد — از Google News یا Bing News استفاده کن.');
    } catch (e: any) {
      toast.error(e.message ?? 'جستجو شکست خورد.');
    } finally {
      setBusy(false);
    }
  };

  const runDigest = async (label: string, feedUrl: string) => {
    if (!onInstantDigest || !searchedTopic) return;
    setDigestBusy(label);
    try {
      await onInstantDigest(searchedTopic, feedUrl, label);
    } finally {
      setDigestBusy(null);
    }
  };

  const bingUrl = searchedTopic ? bingNewsRssUrl(searchedTopic) : '';

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <Input
          placeholder="مثلاً: تکنولوژی، ورزش، اقتصاد"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void handleSearch(false); }
          }}
          className="h-8 text-sm"
        />
        <Button type="button" size="sm" variant="secondary"
          onClick={() => void handleSearch(false)}
          disabled={busy || !topic.trim()} className="gap-1 shrink-0">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          جستجو
        </Button>
      </div>

      {result && searchedTopic && (
        <div className="space-y-2">
          <div className="rounded-lg bg-gradient-to-l from-primary/10 to-transparent border border-primary/20 px-3 py-2">
            <div className="text-[10px] text-muted-foreground">موضوع جستجو</div>
            <div className="text-sm font-semibold truncate">{searchedTopic}</div>
          </div>

          <ul className="max-h-80 overflow-y-auto space-y-1.5 rounded-md border border-border bg-background p-1.5">
            {result.googleNews.url && (
              <li className="rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                  <div className="text-sm font-semibold truncate flex-1">Google News — {searchedTopic}</div>
                </div>
                <div className="text-[10px] text-muted-foreground">همه منابع، اخبار جدید و زنده</div>
                <div className="flex gap-1.5 pt-0.5">
                  <Button type="button" size="sm" variant="secondary" className="h-7 text-xs gap-1 flex-1"
                    onClick={() => onPick({ name: `Google News — ${searchedTopic}`, url: result.googleNews.url })}>
                    <Plus className="h-3 w-3" /> افزودن منبع
                  </Button>
                  {onInstantDigest && (
                    <Button type="button" size="sm" className="h-7 text-xs gap-1 flex-1"
                      disabled={digestBusy !== null}
                      onClick={() => void runDigest('google', result.googleNews.url)}>
                      {digestBusy === 'google'
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Sparkles className="h-3 w-3" />}
                      خلاصه فوری
                    </Button>
                  )}
                </div>
              </li>
            )}

            {bingUrl && (
              <li className="rounded-lg border border-border bg-card p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Globe2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="text-sm font-semibold truncate flex-1">Bing News — {searchedTopic}</div>
                </div>
                <div className="text-[10px] text-muted-foreground">منبع عمومی جایگزین (مایکروسافت)</div>
                <div className="flex gap-1.5 pt-0.5">
                  <Button type="button" size="sm" variant="secondary" className="h-7 text-xs gap-1 flex-1"
                    onClick={() => onPick({ name: `Bing News — ${searchedTopic}`, url: bingUrl })}>
                    <Plus className="h-3 w-3" /> افزودن منبع
                  </Button>
                  {onInstantDigest && (
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1 flex-1"
                      disabled={digestBusy !== null}
                      onClick={() => void runDigest('bing', bingUrl)}>
                      {digestBusy === 'bing'
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Sparkles className="h-3 w-3" />}
                      خلاصه فوری
                    </Button>
                  )}
                </div>
              </li>
            )}

            {result.sites.length > 0 && (
              <li className="px-1 pt-1 text-[10px] font-medium text-muted-foreground">
                سایت‌های مرتبط با این موضوع
              </li>
            )}
            {result.sites.map((site) => {
              const open = expanded[site.domain] ?? false;
              const hasMultiple = site.feeds.length > 1;
              return (
                <li key={site.domain} className="rounded border border-transparent hover:border-border">
                  <div className="flex items-center gap-1 px-1">
                    <button type="button"
                      onClick={() => onPick({ name: site.siteName, url: site.feeds[0].url })}
                      className="flex-1 text-start rounded px-2 py-1.5 hover:bg-accent transition-colors min-w-0">
                      <div className="text-sm font-medium truncate">{site.siteName}</div>
                      <div className="text-[10px] text-muted-foreground truncate" dir="ltr">
                        {site.domain} · {site.articleCount} خبر اخیر
                        {hasMultiple ? ` · ${site.feeds.length} فید` : ''}
                      </div>
                    </button>
                    {hasMultiple && (
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                        onClick={() => setExpanded((e) => ({ ...e, [site.domain]: !open }))}
                        title="نمایش فیدهای دیگر این سایت">
                        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </div>
                  {open && hasMultiple && (
                    <ul className="ms-6 mb-1 space-y-0.5 border-s border-border ps-2">
                      {site.feeds.map((f) => (
                        <li key={f.url}>
                          <button type="button"
                            onClick={() => onPick({ name: `${site.siteName} — ${f.name}`, url: f.url })}
                            className="w-full text-start rounded px-2 py-1 hover:bg-accent transition-colors">
                            <div className="text-xs truncate">{f.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate" dir="ltr">{f.url}</div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {searched && !busy && !result?.sites.length && !result?.googleNews.url && (
        <p className="text-[11px] text-muted-foreground">فیدی پیدا نشد.</p>
      )}
    </div>
  );
}

export function AddSourceDialog({
  onAdded,
  trigger,
  onInstantDigest,
}: {
  onAdded: (s: NewsSource) => void;
  trigger?: React.ReactNode;
  onInstantDigest?: (topicText: string, feedUrl: string, label: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<NewsSourceKind>('rss');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setKind('rss');
    setName('');
    setUrl('');
    setTopic('');
  };

  const handleSubmit = async () => {
    setBusy(true);
    try {
      const finalName = name.trim() ||
        (kind === 'topic'
          ? topic.trim()
          : (() => {
              try {
                return new URL(url).hostname.replace(/^www\./, '');
              } catch {
                return 'Untitled source';
              }
            })());
      const created = await addSource({
        kind,
        name: finalName,
        url: kind === 'topic' ? null : url.trim() || null,
        topic: kind === 'rss' ? null : topic.trim() || null,
        language: null,
      });
      onAdded(created);
      toast.success('منبع اضافه شد.');
      setOpen(false);
      reset();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to add source.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            افزودن
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>افزودن منبع خبر</DialogTitle>
          <DialogDescription>
            فید RSS یک سایت، یا یک موضوع برای جستجو با هوش مصنوعی.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={kind} onValueChange={(v) => setKind(v as NewsSourceKind)} className="mt-2">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="rss" className="gap-1 text-xs">
              <Rss className="h-3.5 w-3.5" />
              RSS
            </TabsTrigger>
            <TabsTrigger value="topic" className="gap-1 text-xs">
              <Search className="h-3.5 w-3.5" />
              موضوع
            </TabsTrigger>
            <TabsTrigger value="site" className="gap-1 text-xs">
              <Globe2 className="h-3.5 w-3.5" />
              سایت
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rss" className="space-y-3 mt-4">
            <div className="space-y-1.5">
              <Label htmlFor="rss-url">لینک فید RSS</Label>
              <Input
                id="rss-url"
                type="url"
                placeholder="https://example.com/feed.xml"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rss-name">نام نمایشی (اختیاری)</Label>
              <Input
                id="rss-name"
                placeholder="BBC News"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                پیدا کردن فید RSS با موضوع
              </div>
              <RssDiscovery
                onPick={(feed) => {
                  setUrl(feed.url);
                  if (!name.trim()) setName(feed.name);
                }}
                onInstantDigest={onInstantDigest}
              />
            </div>
          </TabsContent>

          <TabsContent value="topic" className="space-y-3 mt-4">
            <div className="space-y-1.5">
              <Label htmlFor="topic">موضوع</Label>
              <Input
                id="topic"
                placeholder="AI breakthroughs, climate change…"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                هر بار باز کنی، تازه‌ترین خبرهای این موضوع را در بازه انتخابی نشانت می‌دهیم.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topic-name">نام نمایشی (اختیاری)</Label>
              <Input
                id="topic-name"
                placeholder="هوش مصنوعی"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </TabsContent>

          <TabsContent value="site" className="space-y-3 mt-4">
            <div className="space-y-1.5">
              <Label htmlFor="site-url">آدرس سایت</Label>
              <Input
                id="site-url"
                type="url"
                placeholder="https://techcrunch.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-topic">موضوع داخل سایت (اختیاری)</Label>
              <Input
                id="site-topic"
                placeholder="startup funding"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-name">نام نمایشی (اختیاری)</Label>
              <Input
                id="site-name"
                placeholder="TechCrunch — Startups"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            انصراف
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              busy ||
              (kind === 'rss' && !url.trim()) ||
              (kind === 'topic' && !topic.trim()) ||
              (kind === 'site' && !url.trim())
            }
            className="gap-1.5"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            افزودن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
