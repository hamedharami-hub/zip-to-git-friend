import { usePageMeta } from "@/hooks/usePageMeta";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Upload,
  Settings as SettingsIcon,
  Film,
  Brain,
  Trophy,
  WifiOff,
  Play,
  Package,
  ArrowLeft,
  Search,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAllVideos,
  saveVideo,
  deleteVideo,
  saveVideoBlob,
  setAppState,
  getAppState,
} from "@/lib/db";
import { useLeitnerStore } from "@/store/leitnerStore";
import type { Video } from "@/types";
import { toast } from "sonner";
import { VideoCard } from "@/components/VideoCard";
import { VideoGridSkeleton } from "@/components/VideoCardSkeleton";
import { InstallButton } from "@/components/pwa/InstallButton";
import { EmptyState } from "@/components/EmptyState";
import { useOnline } from "@/hooks/useOnline";
import { AccountButton, SyncBadge } from "@/components/auth/AccountButton";
import { importLLP } from "@/lib/llpPack";
import { validateMediaFile } from "@/lib/fileValidation";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { captureVideoThumbnail } from "@/lib/videoThumbnail";
import { formatDuration } from "@/lib/utils";

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

const Videos = () => {
  usePageMeta({
    title: "Videos — Language Learning Player",
    description: "کتابخانه‌ی ویدیو — مدیریت فیلم‌ها و اپیزودهای شما.",
  });
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastVideoId, setLastVideoId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "title" | "duration">("recent");
  const [dragActive, setDragActive] = useState(false);
  const cards = useLeitnerStore((s) => s.cards);
  const stats = useMemo(() => {
    const now = Date.now();
    const s = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, total: 0, due: 0 } as Record<string, number>;
    for (const c of cards) {
      s[c.box] += 1;
      s.total += 1;
      if (c.nextReview <= now) s.due += 1;
    }
    return s as {
      1: number;
      2: number;
      3: number;
      4: number;
      5: number;
      total: number;
      due: number;
    };
  }, [cards]);
  const fileRef = useRef<HTMLInputElement>(null);
  const llpRef = useRef<HTMLInputElement>(null);
  const online = useOnline();
  const navigate = useNavigate();

  const handleImportLLP = async (file: File) => {
    const v = validateMediaFile(file, "llp");
    if (!v.ok) {
      toast.error(v.reason ?? "Invalid pack file.");
      return;
    }
    try {
      const result = await importLLP(file);
      toast.success(`Imported pack: ${result.title}`);
      await setAppState(
        result.mediaType === "audio" ? "lastAudioId" : "lastVideoId",
        result.videoId,
      );
      navigate(`/player/${result.videoId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not import pack.");
    }
  };

  const refresh = useCallback(async () => {
    const all = await getAllVideos();
    const videosOnly = all.filter((v) => (v.mediaType ?? "video") === "video");
    setVideos(videosOnly.sort((a, b) => b.createdAt - a.createdAt));
    const last = await getAppState<string>("lastVideoId");
    setLastVideoId(last);
    setLoading(false);
  }, []);

  const ptr = usePullToRefresh({
    onRefresh: async () => {
      await refresh();
      toast.success("Library refreshed.");
    },
  });

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleUpload = async (file: File) => {
    const v = validateMediaFile(file, "video");
    if (!v.ok) {
      toast.error(v.reason ?? "Invalid video file.");
      return;
    }
    const id = uuid();
    const blobUrl = URL.createObjectURL(file);
    const duration = await new Promise<number>((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = blobUrl;
      v.onloadedmetadata = () => resolve(v.duration || 0);
      v.onerror = () => resolve(0);
    });

    const thumbnailUrl = file.type.startsWith("video/")
      ? await captureVideoThumbnail(blobUrl, 0.5)
      : undefined;

    const video: Video = {
      id,
      title: file.name.replace(/\.[^.]+$/, ""),
      fileName: file.name,
      blobUrl,
      duration,
      lastPosition: 0,
      volume: 1,
      playbackSpeed: 1,
      createdAt: Date.now(),
      mediaType: "video",
      mimeType: file.type || "video/mp4",
      thumbnailUrl,
    };
    try {
      await saveVideoBlob(id, file);
    } catch (e) {
      console.error("Failed to persist video blob", e);
      toast.warning("Could not cache video file. You may need to re-attach after reload.");
    }
    await saveVideo(video);
    await setAppState("lastVideoId", id);
    toast.success("Video added — opening player.");
    navigate(`/player/${id}`);
  };

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteVideo(id);
      if (lastVideoId === id) {
        await setAppState("lastVideoId", null);
        setLastVideoId(null);
      }
      toast.success("Video deleted.");
      refresh();
    },
    [lastVideoId, refresh],
  );

  const lastVideo = useMemo(
    () => (lastVideoId ? (videos.find((v) => v.id === lastVideoId) ?? null) : null),
    [lastVideoId, videos],
  );

  const filteredVideos = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = term
      ? videos.filter(
          (v) => v.title.toLowerCase().includes(term) || v.fileName.toLowerCase().includes(term),
        )
      : videos;
    if (sortBy === "title") {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "duration") {
      list = [...list].sort((a, b) => (b.duration || 0) - (a.duration || 0));
    } else {
      list = [...list].sort((a, b) => b.createdAt - a.createdAt);
    }
    return list;
  }, [videos, search, sortBy]);

  const handleFiles = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (f.name.toLowerCase().endsWith(".llp")) {
      await handleImportLLP(f);
    } else {
      await handleUpload(f);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    void handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link to="/" aria-label="Back to home">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold flex items-center gap-2 min-w-0">
              <Film className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
              <span className="truncate">Videos</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {!online && (
              <span
                className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground"
                aria-label="Offline"
              >
                <WifiOff className="h-3.5 w-3.5" /> offline
              </span>
            )}
            <InstallButton />
            <AccountButton />
            <Link to="/settings">
              <Button variant="ghost" size="icon" aria-label="Settings">
                <SettingsIcon className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <PullToRefreshIndicator progress={ptr.progress} refreshing={ptr.refreshing} />

      <main
        className="relative max-w-[1400px] mx-auto px-6 py-8 space-y-6"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragActive && (
          <div className="absolute inset-0 z-50 m-4 rounded-xl border-2 border-dashed border-primary bg-primary/10 flex flex-col items-center justify-center text-primary">
            <Upload className="h-10 w-10 mb-2" />
            <p className="font-medium">Drop video or .llp file here</p>
          </div>
        )}

        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Your video library</h2>
            <p className="text-sm text-muted-foreground inline-flex items-center gap-2 flex-wrap">
              <span>Files stay on your device.</span>
              <SyncBadge />
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 sm:flex-none">
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search videos…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-full sm:w-40">
                <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most recent</SelectItem>
                <SelectItem value="title">Title (A–Z)</SelectItem>
                <SelectItem value="duration">Longest first</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = "";
            }}
            aria-label="Upload video file"
          />
          <input
            ref={llpRef}
            type="file"
            accept=".llp,application/zip,application/octet-stream"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportLLP(f);
              e.target.value = "";
            }}
            aria-label="Import .llp pack"
          />
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => llpRef.current?.click()}
              aria-label="Import .llp pack"
              title="Import .llp pack"
            >
              <Package className="h-4 w-4 mr-2" aria-hidden="true" />
              Import .llp
            </Button>
            <Button onClick={() => fileRef.current?.click()} aria-label="Upload video">
              <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
              Upload video
            </Button>
          </div>
        </section>

        {lastVideo && (
          <section>
            <Link
              to={`/player/${lastVideo.id}`}
              className="rounded-lg border border-primary/40 bg-primary/5 p-4 flex items-center gap-3 hover:border-primary transition-colors focus-visible:border-primary"
            >
              <div className="h-10 w-10 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Play className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Continue watching</p>
                <p className="font-semibold truncate">{lastVideo.title}</p>
                <p className="text-xs text-muted-foreground">
                  Resume from {formatDuration(lastVideo.lastPosition)} ·{" "}
                  {formatDuration(lastVideo.duration)} total
                </p>
                {lastVideo.duration > 0 && (
                  <div className="mt-1.5 h-1 w-full bg-primary/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{
                        width: `${Math.min(100, (lastVideo.lastPosition / lastVideo.duration) * 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            </Link>
          </section>
        )}

        <section className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/leitner"
            className="rounded-lg border border-border bg-card p-4 flex items-center gap-3 hover:border-primary/50 transition-colors focus-visible:border-primary"
          >
            <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <Brain className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Due for review</p>
              <p className="font-semibold truncate">
                {stats.due > 0
                  ? `You have ${stats.due} Leitner card${stats.due === 1 ? "" : "s"} due`
                  : "No cards due — you’re caught up"}
              </p>
            </div>
          </Link>
          <Link
            to="/leitner"
            className="rounded-lg border border-border bg-card p-4 flex items-center gap-3 hover:border-primary/50 transition-colors focus-visible:border-primary"
          >
            <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <Trophy className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Total words learned</p>
              <p className="font-semibold truncate">
                {stats[5]} mastered (box 5) · {stats.total} total
              </p>
            </div>
          </Link>
        </section>

        {loading ? (
          <VideoGridSkeleton />
        ) : videos.length === 0 ? (
          <EmptyState
            icon={<Film className="h-7 w-7" aria-hidden="true" />}
            title="No videos yet"
            description="Upload your first movie or clip to start learning. Your files stay on this device."
            action={
              <Button onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
                Upload video
              </Button>
            }
            secondaryAction={
              <Button variant="outline" onClick={() => llpRef.current?.click()}>
                <Package className="h-4 w-4 mr-2" aria-hidden="true" />
                Import .llp
              </Button>
            }
          />
        ) : filteredVideos.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No videos match your search.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredVideos.map((v) => (
              <VideoCard key={v.id} video={v} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Videos;
