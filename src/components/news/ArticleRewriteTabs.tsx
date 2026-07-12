/**
 * AI rewrite tabs for a single news article. Extracted from NewsArticle.tsx
 * to keep that page focused. Purely presentational — parent owns the
 * rewrites map, active tab, busy state, and CRUD callbacks.
 */
import { Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InteractiveBookText, type DisplayLang } from "@/components/books/InteractiveBookText";
import { getAvailableBookModels } from "@/lib/aiModels";
import { rewriteKey } from "@/lib/news";
import type { BookAIModelRef, AppSettings, RewriteLength, RewriteVoice, NewsDigest } from "@/types";

const LENGTHS: RewriteLength[] = ["simple", "auto-max", "long", "max"];

const VOICE_LABELS: Record<RewriteVoice, string> = {
  auto: "رسمی مجله‌ای (مانند قبل)",
  storyteller: "داستان‌سرا",
  friend: "دوستانه",
  teacher: "معلمانه",
  socratic: "سقراطی",
  journalist: "خبری-تحلیلی",
};

interface Props {
  articleId: string;
  articleTitle: string;
  rewrites: Record<string, NewsDigest | undefined>;
  activeRewrite: RewriteLength;
  onActiveRewriteChange: (v: RewriteLength) => void;
  voice: RewriteVoice;
  onVoiceChange: (v: RewriteVoice) => void;
  rewriteBusy: RewriteLength | null;
  onRewrite: (length: RewriteLength, force?: boolean) => void;
  onDeleteRewrite: (length: RewriteLength) => void;
  /** Injects inline images from the original article HTML. Parent computes it. */
  rewriteHtmlWithImages?: string;
  typo: { sizeClass: string; familyClass: string };
  rwDisplayLang: DisplayLang;
  onRwTranslationCountChange: (n: number) => void;
  modelRef: BookAIModelRef;
  onModelChange: (ref: BookAIModelRef) => void;
  settings: AppSettings;
}

function labelFor(len: RewriteLength): string {
  return len === "simple"
    ? "ساده روزمره"
    : len === "auto-max"
      ? "نسخه حداکثری"
      : len === "long"
        ? "نسخه بلند"
        : "نسخه کامل";
}

function tabLabel(len: RewriteLength): string {
  return len === "simple"
    ? "ساده"
    : len === "auto-max"
      ? "حداکثری"
      : len === "long"
        ? "بلند"
        : "کامل";
}

export function ArticleRewriteTabs({
  articleId,
  articleTitle,
  rewrites,
  activeRewrite,
  onActiveRewriteChange,
  voice,
  onVoiceChange,
  rewriteBusy,
  onRewrite,
  onDeleteRewrite,
  rewriteHtmlWithImages,
  typo,
  rwDisplayLang,
  onRwTranslationCountChange,
  modelRef,
  onModelChange,
  settings,
}: Props) {
  return (
    <section className="mt-12 pt-8 border-t border-border/50">
      <header className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold">بازنویسی این خبر با هوش مصنوعی</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">لحن نگارش:</span>
          <Select value={voice} onValueChange={(v) => onVoiceChange(v as RewriteVoice)}>
            <SelectTrigger className="h-7 text-[11px] min-w-[120px] max-w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(VOICE_LABELS) as RewriteVoice[]).map((v) => (
                <SelectItem key={v} value={v}>
                  {VOICE_LABELS[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">مدل بازنویسی:</span>
          <Select
            value={`${modelRef.provider}:${modelRef.model}`}
            onValueChange={(v) => {
              const idx = v.indexOf(":");
              const provider = v.slice(0, idx) as "gateway" | "gemini" | "groq";
              const model = v.slice(idx + 1);
              onModelChange({ provider, model });
            }}
          >
            <SelectTrigger className="h-7 text-[11px] min-w-[180px] max-w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(() => {
                const opts = getAvailableBookModels(settings);
                const groups: Record<string, typeof opts> = {};
                for (const o of opts) (groups[o.group] ??= []).push(o);
                return Object.entries(groups).map(([group, items]) => (
                  <div key={group}>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group}
                    </div>
                    {items.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </div>
                ));
              })()}
            </SelectContent>
          </Select>
        </div>
      </header>

      <Tabs value={activeRewrite} onValueChange={(v) => onActiveRewriteChange(v as RewriteLength)}>
        <TabsList className="bg-muted/50 flex-wrap h-auto">
          {LENGTHS.map((len) => (
            <TabsTrigger key={len} value={len} className="text-xs">
              {tabLabel(len)}
              {rewrites[rewriteKey(len, voice)] && <span className="ms-1.5 text-primary">●</span>}
            </TabsTrigger>
          ))}
        </TabsList>
        {LENGTHS.map((len) => {
          const key = rewriteKey(len, voice);
          const r = rewrites[key];
          const busy = rewriteBusy === len;
          const html =
            len === activeRewrite && rewriteHtmlWithImages ? rewriteHtmlWithImages : r?.contentHtml;
          return (
            <TabsContent key={len} value={len} className="mt-4">
              <div className="rounded-lg border border-border bg-card/40 p-4 sm:p-6">
                {!r ? (
                  <div className="py-8 text-center space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {labelFor(len)} هنوز ساخته نشده.
                    </p>
                    <Button onClick={() => onRewrite(len, false)} disabled={busy} size="sm">
                      {busy ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      {busy ? "در حال ساخت…" : "ساخت بازنویسی"}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-border/50">
                      <div className="text-[11px] text-muted-foreground">
                        {r.wordCount.toLocaleString()} words ·{" "}
                        <span className="opacity-70">{r.model}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onRewrite(len, true)}
                          disabled={busy}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          )}
                          بازسازی
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onDeleteRewrite(len)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> حذف
                        </Button>
                      </div>
                    </div>
                    <InteractiveBookText
                      html={html ?? r.contentHtml}
                      bookId={`news-rw-${articleId}-${len}-${voice}`}
                      chapterIndex={0}
                      fontSizeClass={typo.sizeClass}
                      fontFamilyClass={typo.familyClass}
                      displayLang={len === activeRewrite ? rwDisplayLang : "en"}
                      onTranslationCountChange={
                        len === activeRewrite ? onRwTranslationCountChange : undefined
                      }
                      sourceKind="news"
                      sourceTitle={articleTitle}
                    />
                  </>
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </section>
  );
}
