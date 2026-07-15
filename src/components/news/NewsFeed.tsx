import { memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Newspaper,
  Rss,
  Globe2,
  Search,
  Loader2,
  Sparkles,
  Clock,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { NewsArticleCard } from "./NewsArticleCard";
import { PublicNewsView } from "./PublicNewsView";
import { AllAggregatedView, FolderAggregatedView } from "./NewsAggregatedViews";
import { NewsOnboarding } from "./NewsOnboarding";
import { siteFromUrl, WINDOW_OPTIONS } from "@/lib/newsPageHelpers";
import { isUrlCached } from "@/lib/newsOfflineCache";
import { isSeen } from "@/lib/seenArticles";
import { useSettingsStore } from "@/store/settingsStore";
import { VOICE_LABELS, DEFAULT_REWRITE_VOICE, normalizeVoice } from "@/lib/news";
import type { PublicTopic } from "@/lib/newsPublicTopics";
import type { User } from "@supabase/supabase-js";
import type { FeedItem, NewsSource, NewsFolder } from "@/lib/news";
import type { RewriteVoice } from "@/types";

interface Props {
  publicTopic: PublicTopic | null;
  setPublicTopic: (topic: PublicTopic | null) => void;
  allMode: boolean;
  allFeed: Array<FeedItem & { _sourceName?: string }>;
  allLoading: boolean;
  refreshAllFeed: () => void;
  activeFolderId: string | null;
  folderFeed: Array<FeedItem & { _sourceName?: string }>;
  folderLoading: boolean;
  refreshFolderFeed: () => void;
  activeSource: NewsSource | null;
  sources: NewsSource[];
  folders: NewsFolder[];
  feedItems: FeedItem[];
  feedLoading: boolean;
  feedError: string | null;
  refreshFeed: () => void;
  handleTrending: () => void;
  trendingBusy: boolean;
  windowHours: string;
  setWindowHours: (v: string) => void;
  digestLength: "long" | "max";
  setDigestLength: (v: "long" | "max") => void;
  handleGenerateDigest: () => void;
  digestBusy: boolean;
  titleTr: Record<string, { titleFa?: string }>;
  selectMode: boolean;
  selectedUrls: Set<string>;
  openArticle: string | null;
  handleOpenArticle: (item: FeedItem) => void;
  handlePublicBrowse: (topic: PublicTopic) => void;
  handleAddSampleSources: () => Promise<void>;
  setAddSourceOpen: (open: boolean) => void;
  onPickFolderSource: (sourceId: string) => void | Promise<void>;
  user: User | null;
}

export const NewsFeed = memo(function NewsFeed({
  publicTopic,
  setPublicTopic,
  allMode,
  allFeed,
  allLoading,
  refreshAllFeed,
  activeFolderId,
  folderFeed,
  folderLoading,
  refreshFolderFeed,
  activeSource,
  sources,
  folders,
  feedItems,
  feedLoading,
  feedError,
  refreshFeed,
  handleTrending,
  trendingBusy,
  windowHours,
  setWindowHours,
  digestLength,
  setDigestLength,
  handleGenerateDigest,
  digestBusy,
  titleTr,
  selectMode,
  selectedUrls,
  openArticle,
  handleOpenArticle,
  handlePublicBrowse,
  handleAddSampleSources,
  setAddSourceOpen,
  onPickFolderSource,
  user,
}: Props) {
  const navigate = useNavigate();
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  return (
    <section className="min-w-0 space-y-4">
      {publicTopic ? (
        <PublicNewsView
          topic={publicTopic}
          onBack={() => setPublicTopic(null)}
          onSignIn={() => navigate("/auth")}
          onTopicChange={setPublicTopic}
        />
      ) : allMode ? (
        <AllAggregatedView
          items={allFeed}
          loading={allLoading}
          onRefresh={refreshAllFeed}
          onOpenItem={handleOpenArticle}
          sourceCount={sources.length}
        />
      ) : activeFolderId ? (
        <FolderAggregatedView
          folder={folders.find((f) => f.id === activeFolderId) ?? null}
          items={folderFeed}
          loading={folderLoading}
          onRefresh={refreshFolderFeed}
          onOpenItem={handleOpenArticle}
          onPickSource={onPickFolderSource}
          sources={sources}
        />
      ) : !activeSource ? (
        <NewsOnboarding
          isLoggedIn={!!user}
          onBrowsePublic={handlePublicBrowse}
          onAddSampleSources={handleAddSampleSources}
          onAddSource={() => {
            if (user) setAddSourceOpen(true);
            else navigate("/auth");
          }}
          onSignIn={() => navigate("/auth")}
        />
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {activeSource.kind === "rss" ? (
                  <Rss className="h-4 w-4 text-primary shrink-0" />
                ) : activeSource.kind === "site" ? (
                  <Globe2 className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <Search className="h-4 w-4 text-primary shrink-0" />
                )}
                <h2 className="font-semibold truncate">{activeSource.name}</h2>
                {activeSource.url && (
                  <a
                    href={activeSource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-muted-foreground truncate hover:text-foreground"
                  >
                    {siteFromUrl(activeSource.url)}
                  </a>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleTrending}
                disabled={trendingBusy}
                className="gap-1"
                title="عنوان‌های داغ همین الان"
              >
                {trendingBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <TrendingUp className="h-3.5 w-3.5" />
                )}
                داغ‌ها
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshFeed}
                disabled={feedLoading}
                className="gap-1"
              >
                {feedLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                بروزرسانی
              </Button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {activeSource.kind !== "rss" && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <Select value={windowHours} onValueChange={setWindowHours}>
                    <SelectTrigger className="h-8 w-[140px] text-xs">
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
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  لحن بازنویسی:
                </span>
                <Select
                  value={normalizeVoice(settings.defaultRewriteVoice)}
                  onValueChange={(v) =>
                    void update({ defaultRewriteVoice: normalizeVoice(v) as RewriteVoice })
                  }
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(VOICE_LABELS) as RewriteVoice[]).map((v) => (
                      <SelectItem key={v} value={v} className="text-xs">
                        {VOICE_LABELS[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5 ms-auto">
                <Tabs
                  value={digestLength}
                  onValueChange={(v) => setDigestLength(v as "long" | "max")}
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="long" className="text-xs">
                      خلاصه بلند
                    </TabsTrigger>
                    <TabsTrigger value="max" className="text-xs">
                      خلاصه حداکثری
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button
                  onClick={handleGenerateDigest}
                  disabled={digestBusy || feedItems.length === 0}
                  size="sm"
                  className="gap-1.5"
                >
                  {digestBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  ساخت خلاصه AI
                </Button>
              </div>
            </div>
          </div>

          {feedError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {feedError}
            </div>
          ) : feedLoading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : feedItems.length === 0 ? (
            <EmptyState
              icon={<Newspaper className="h-7 w-7" />}
              title="هیچ خبری پیدا نشد"
              description="بازه زمانی را عوض کن یا منبع دیگری انتخاب کن."
            />
          ) : (
            <ul className="space-y-3">
              {feedItems.map((item) => (
                <NewsArticleCard
                  key={item.url}
                  item={item}
                  titleFa={titleTr[item.url]?.titleFa}
                  isSeen={isSeen(item.url)}
                  isCached={isUrlCached(item.url)}
                  selectMode={selectMode}
                  isSelected={selectedUrls.has(item.url)}
                  isOpening={openArticle === item.url}
                  onOpen={handleOpenArticle}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
});
