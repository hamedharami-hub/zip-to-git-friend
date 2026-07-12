import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Loader2, Plus, LogIn, Sparkles, Globe2, Rss } from "lucide-react";
import { cn } from "@/lib/utils";
import { PUBLIC_TOPICS, SAMPLE_SOURCES } from "@/lib/newsPublicTopics";

export interface NewsOnboardingProps {
  isLoggedIn: boolean;
  onBrowsePublic: (topic: (typeof PUBLIC_TOPICS)[number]) => void;
  onAddSampleSources: () => Promise<void>;
  onAddSource: () => void;
  onSignIn: () => void;
}

export function NewsOnboarding({
  isLoggedIn,
  onBrowsePublic,
  onAddSampleSources,
  onAddSource,
  onSignIn,
}: NewsOnboardingProps) {
  const [samplesLoading, setSamplesLoading] = useState(false);

  const handleAddSamples = async () => {
    setSamplesLoading(true);
    try {
      await onAddSampleSources();
    } finally {
      setSamplesLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="p-6 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center">
            <Globe2 className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">
              {isLoggedIn ? "خبرخوانی شخصی‌سازی‌شده" : "اخبار را بدون ثبت‌نام بخوانید"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {isLoggedIn
                ? "منابع خبری اضافه کنید یا از موضوعات پیش‌فرض شروع کنید."
                : "موضوعات داغ را ببینید. برای ذخیره و شخصی‌سازی وارد شوید."}
            </p>
          </div>

          {!isLoggedIn && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {PUBLIC_TOPICS.map((topic) => (
                <button
                  key={topic.query}
                  type="button"
                  onClick={() => onBrowsePublic(topic)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm transition-colors hover:border-primary/50 hover:bg-accent text-center",
                  )}
                >
                  <Search className="h-4 w-4 text-primary" />
                  <span className="font-medium">{topic.labelFa}</span>
                  <span className="text-[11px] text-muted-foreground">{topic.label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3">
            {isLoggedIn ? (
              <>
                <Button onClick={handleAddSamples} disabled={samplesLoading} className="gap-2">
                  {samplesLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  اضافه کردن {SAMPLE_SOURCES.length} منبع نمونه
                </Button>
                <Button variant="outline" onClick={onAddSource} className="gap-2">
                  <Plus className="h-4 w-4" /> افزودن منبع دستی
                </Button>
              </>
            ) : (
              <>
                <Button onClick={onSignIn} className="gap-2">
                  <LogIn className="h-4 w-4" /> ورود / ثبت‌نام
                </Button>
                <Button variant="outline" onClick={onAddSource} className="gap-2">
                  <Rss className="h-4 w-4" /> افزودن RSS
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-2">
            <h4 className="font-semibold flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" /> جستجوی موضوعی
            </h4>
            <p className="text-sm text-muted-foreground">
              موضوعی مثل "artificial intelligence" یا "بورس" را بنویسید و AI جدیدترین اخبار مرتبط را
              پیدا کند.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <h4 className="font-semibold flex items-center gap-2">
              <Rss className="h-4 w-4 text-primary" /> فید RSS
            </h4>
            <p className="text-sm text-muted-foreground">
              آدرس فید RSS سایت خبری مورد علاقه‌تان را وارد کنید.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
