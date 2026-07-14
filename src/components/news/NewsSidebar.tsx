import { memo } from "react";
import { Link } from "react-router-dom";
import { useCallback } from "react";
import {
  Languages,
  Loader2,
  Download,
  CheckSquare,
  Square,
  Settings as SettingsIcon,
  Globe2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SourcesTree } from "./SourcesTree";
import { formatTime, siteFromUrl } from "@/lib/newsPageHelpers";
import { updateSource, updateFolder } from "@/lib/news";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import type { NewsSource, NewsFolder, NewsArticle, NewsDigest } from "@/lib/news";

interface Props {
  user: User | null;
  sources: NewsSource[];
  folders: NewsFolder[];
  savedArticles: NewsArticle[];
  digests: NewsDigest[];
  activeSourceId: string | null;
  activeFolderId: string | null;
  allMode: boolean;
  expandedFolders: Record<string, boolean>;
  showSaved: boolean;
  trBusy: boolean;
  trProgress: { done: number; total: number } | null;
  dlBusy: boolean;
  dlProgress: {
    done: number;
    total: number;
    failed: number;
    current?: string;
  } | null;
  selectMode: boolean;
  selectedUrls: Set<string>;
  sourcesByFolder: Map<string | null, NewsSource[]>;
  onTranslateVisibleTitles: () => void;
  onPrefetchOffline: (mode: "last10" | "last50" | "last100" | "all" | "selected") => void;
  onCancelPrefetch: () => void;
  onSelectModeToggle: () => void;
  onManageOpen: () => void;
  setExpandedFolders: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setActiveFolderId: (id: string | null) => void;
  setActiveSourceId: (id: string | null) => void;
  setAllMode: (v: boolean) => void;
  setSources: React.Dispatch<React.SetStateAction<NewsSource[]>>;
  setFolders: React.Dispatch<React.SetStateAction<NewsFolder[]>>;
  setShowSaved: (v: boolean) => void;
  onDeleteSource: (id: string) => void | Promise<void>;
}

export const NewsSidebar = memo(function NewsSidebar({
  user,
  sources,
  folders,
  savedArticles,
  digests,
  activeSourceId,
  activeFolderId,
  allMode,
  expandedFolders,
  showSaved,
  trBusy,
  trProgress,
  dlBusy,
  dlProgress,
  selectMode,
  selectedUrls,
  sourcesByFolder,
  onTranslateVisibleTitles,
  onPrefetchOffline,
  onCancelPrefetch,
  onSelectModeToggle,
  onManageOpen,
  setExpandedFolders,
  setActiveFolderId,
  setActiveSourceId,
  setAllMode,
  setSources,
  setFolders,
  setShowSaved,
  onDeleteSource,
}: Props) {
  const handleAllNews = useCallback(() => {
    setAllMode(true);
    setActiveFolderId(null);
    setActiveSourceId(null);
  }, [setActiveFolderId, setActiveSourceId, setAllMode]);

  const handleToggleFolder = useCallback(
    (id: string) => setExpandedFolders((c) => ({ ...c, [id]: !c[id] })),
    [setExpandedFolders],
  );

  const handlePickFolder = useCallback(
    (id: string) => {
      setActiveFolderId(id);
      setActiveSourceId(null);
      setAllMode(false);
    },
    [setActiveFolderId, setActiveSourceId, setAllMode],
  );

  const handlePickSource = useCallback(
    (id: string) => {
      setActiveSourceId(id);
      setActiveFolderId(null);
      setAllMode(false);
    },
    [setActiveSourceId, setActiveFolderId, setAllMode],
  );

  const handleMoveSource = useCallback(
    async (sourceId: string, folderId: string | null) => {
      await updateSource(sourceId, { folderId });
      setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, folderId } : s)));
    },
    [setSources],
  );

  const handleRenameSource = useCallback(
    async (id: string, name: string) => {
      await updateSource(id, { name });
      setSources((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
      toast.success("نام منبع به‌روز شد.");
    },
    [setSources],
  );

  const handleRenameFolder = useCallback(
    async (id: string, name: string) => {
      await updateFolder(id, { name });
      setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
      toast.success("نام پوشه به‌روز شد.");
    },
    [setFolders],
  );

  if (!user) return null;

  return (
    <aside className="space-y-6 min-w-0">
      <section>
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            منابع
          </h2>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">{sources.length}</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={onTranslateVisibleTitles}
              disabled={trBusy}
              title="ترجمه‌ی فارسی همه‌ی عنوان‌های انگلیسیِ این لیست (بَچ، کم‌هزینه)"
            >
              {trBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Languages className="h-3.5 w-3.5" />
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  disabled={dlBusy}
                  title="دانلود خبر برای حالت آفلاین (متن انگلیسی پردازش‌شده)"
                >
                  {dlBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">دانلود برای آفلاین</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onPrefetchOffline("last10")}>
                  ۱۰ خبر آخر
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onPrefetchOffline("last50")}>
                  ۵۰ خبر آخر
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onPrefetchOffline("last100")}>
                  ۱۰۰ خبر آخر
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onPrefetchOffline("all")}>
                  همه‌ی این لیست
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSelectModeToggle}>
                  {selectMode ? (
                    <>
                      <Square className="h-3.5 w-3.5 me-2" /> خروج از حالت انتخاب
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-3.5 w-3.5 me-2" /> انتخاب چند خبر…
                    </>
                  )}
                </DropdownMenuItem>
                {selectMode && (
                  <DropdownMenuItem
                    onClick={() => onPrefetchOffline("selected")}
                    disabled={selectedUrls.size === 0}
                  >
                    <Download className="h-3.5 w-3.5 me-2" />
                    دانلود {selectedUrls.size} انتخاب‌شده
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={onManageOpen}
              title="مدیریت پوشه‌ها و دامنه‌های بلاک‌شده"
            >
              <SettingsIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {trProgress && trProgress.total > 0 && (
          <p className="px-1 mb-2 text-[11px] text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            ترجمه‌ی عنوان‌ها… {trProgress.done}/{trProgress.total}
          </p>
        )}
        {dlProgress && dlProgress.total > 0 && (
          <div className="px-1 mb-2 text-[11px] text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            <span className="truncate flex-1">
              دانلود آفلاین… {dlProgress.done}/{dlProgress.total}
              {dlProgress.failed > 0 ? ` · ${dlProgress.failed} ناموفق` : ""}
            </span>
            {dlBusy && (
              <button onClick={onCancelPrefetch} className="text-destructive hover:underline">
                لغو
              </button>
            )}
          </div>
        )}
        {selectMode && (
          <div className="px-1 mb-2 text-[11px] text-primary flex items-center gap-1">
            <CheckSquare className="h-3 w-3" />
            حالت انتخاب فعال — روی خبرها بزن • {selectedUrls.size} انتخاب‌شده
          </div>
        )}
        <button
          type="button"
          onClick={handleAllNews}
          className={
            "mb-2 w-full flex items-center gap-2 rounded-2xl border px-2.5 py-2 text-sm transition-colors " +
            (allMode
              ? "border-primary/30 bg-primary/10 text-foreground shadow-sm"
              : "border-border/60 bg-card/60 hover:bg-accent text-foreground/90")
          }
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background">
            <Globe2 className="h-3.5 w-3.5 text-primary" />
          </span>
          <span className="truncate flex-1 text-start font-medium">همه‌ی اخبار</span>
          <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {sources.length}
          </span>
        </button>
        {sources.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1">
            هنوز منبعی اضافه نکرده‌ای. روی «افزودن» بزن.
          </p>
        ) : (
          <SourcesTree
            folders={folders}
            sourcesByFolder={sourcesByFolder}
            activeSourceId={activeSourceId}
            activeFolderId={activeFolderId}
            collapsed={expandedFolders}
            onToggleFolder={handleToggleFolder}
            onPickFolder={handlePickFolder}
            onPickSource={handlePickSource}
            onDeleteSource={onDeleteSource}
            onMoveSource={handleMoveSource}
            onRenameSource={handleRenameSource}
            onRenameFolder={handleRenameFolder}
          />
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            اخبار ذخیره‌شده
          </h2>
          <button
            type="button"
            onClick={() => setShowSaved((v) => !v)}
            className="text-[10px] text-primary hover:underline"
          >
            {showSaved ? "بستن" : `نمایش (${savedArticles.length})`}
          </button>
        </div>
        {showSaved &&
          (savedArticles.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1">هنوز خبری سیو نکرده‌ای.</p>
          ) : (
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {savedArticles.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/news/article/${a.id}`}
                    className="block rounded-md px-2 py-1.5 text-xs hover:bg-accent transition-colors"
                  >
                    <span className="block truncate font-medium">{a.title}</span>
                    <span className="block text-[10px] text-muted-foreground truncate">
                      {a.siteName ?? siteFromUrl(a.url)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
          خلاصه‌های ذخیره‌شده
        </h2>
        {digests.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1">هنوز خلاصه‌ای ساخته نشده.</p>
        ) : (
          <ul className="space-y-1">
            {digests.slice(0, 12).map((d) => (
              <li key={d.id}>
                <Link
                  to={`/news/digest/${d.id}`}
                  className="block rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                >
                  <span className="block truncate font-medium">{d.title}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {d.length === "max" ? "حداکثری" : d.length === "long" ? "بلند" : "کوتاه"} ·{" "}
                    {formatTime(d.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
});
