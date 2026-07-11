/**
 * Dialog to paste any URL (article or YouTube video) and import it as
 * a polished English article into the news reader.
 */
import { useState, useEffect } from "react";
import { Loader2, Sparkles, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  importUrl,
  upsertArticle,
  addSource,
  youtubeChannelFeed,
  type NewsSource,
} from "@/lib/news";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Props {
  trigger?: React.ReactNode;
  initialUrl?: string;
  autoOpen?: boolean;
  onClose?: () => void;
  onChannelAdded?: (s: NewsSource) => void;
}

export function ImportUrlDialog({ trigger, initialUrl, autoOpen, onClose, onChannelAdded }: Props) {
  const [open, setOpen] = useState(!!autoOpen);
  const [url, setUrl] = useState(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  // Re-open whenever a new shared URL arrives.
  // (Parent passes a fresh initialUrl + autoOpen=true via search params.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (autoOpen && initialUrl) {
      setUrl(initialUrl);
      setOpen(true);
    }
  }, [autoOpen, initialUrl]);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) onClose?.();
  };

  const handleImport = async () => {
    const u = url.trim();
    if (!u) {
      toast.error("یک لینک وارد کن.");
      return;
    }
    setBusy(true);
    try {
      const result = await importUrl(u);
      if (result.kind === "youtube_channel") {
        // Resolve the canonical channel id + title via the feed endpoint so
        // we can store a real RSS URL (channel handle URLs aren't valid feeds).
        let channelTitle = u;
        let feedUrl = u;
        try {
          const ch = await youtubeChannelFeed({ channel: result.channel });
          channelTitle = ch.channelTitle || u;
          feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channelId}`;
        } catch (err) {
          console.warn("[importUrl] channel resolve failed", err);
        }
        const created = await addSource({
          kind: "rss",
          name: channelTitle,
          url: feedUrl,
          topic: null,
          language: null,
        });
        onChannelAdded?.(created);
        toast.success("کانال یوتیوب اضافه شد.");
        handleOpenChange(false);
        return;
      }
      const a = result.article;
      const saved = await upsertArticle({
        sourceId: null,
        url: u,
        title: a.title,
        author: a.author,
        excerpt: a.excerpt,
        contentMd: a.contentMd,
        contentHtml: a.contentHtml,
        imageUrl: a.imageUrl,
        siteName: a.siteName,
        language: a.language,
        publishedAt: a.publishedAt,
        wordCount: a.wordCount,
      });
      toast.success("مقاله آماده شد.");
      handleOpenChange(false);
      navigate(`/news/article/${saved.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="gap-1.5">
            <Link2 className="h-4 w-4" />
            وارد کردن لینک
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>وارد کردن لینک</DialogTitle>
          <DialogDescription>
            لینک یک مقاله یا ویدیوی یوتیوب. هوش مصنوعی متن کامل را به انگلیسی تمیز می‌کند و مثل یک
            مقاله نشان می‌دهد. لینک کانال یوتیوب → به‌عنوان فید اضافه می‌شود.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          <Label htmlFor="import-url">لینک</Label>
          <Input
            id="import-url"
            type="url"
            dir="ltr"
            placeholder="https://… یا https://youtube.com/watch?v=…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            انصراف
          </Button>
          <Button onClick={handleImport} disabled={busy || !url.trim()} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            استخراج با هوش مصنوعی
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
