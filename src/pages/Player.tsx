import { usePageMeta } from "@/hooks/usePageMeta";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSettingsStore } from "@/store/settingsStore";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Brain,
  Settings as SettingsIcon,
  Upload,
  Trash2,
  Package,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVideo, saveVideo, getVideoBlob, saveVideoBlob, setAppState } from "@/lib/db";
import { exportLLP } from "@/lib/llpPack";
import { useVideoStore } from "@/store/videoStore";
import { useSubtitleStore } from "@/store/subtitleStore";
import { useLeitnerStore } from "@/store/leitnerStore";
import type { Video } from "@/types";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { SubtitleUpload } from "@/components/subtitles/SubtitleUpload";
import { SyncControls } from "@/components/subtitles/SyncControls";
import { BatchAnalyze } from "@/components/ai/BatchAnalyze";
import { AutoTranscribe } from "@/components/ai/AutoTranscribe";
import { ExportImport } from "@/components/ai/ExportImport";
import { PreStudy } from "@/components/ai/PreStudy";
import { ReviewMode } from "@/components/leitner/ReviewMode";
import { InstallButton } from "@/components/pwa/InstallButton";
import { CueListWithAnalysis } from "@/components/subtitles/CueListWithAnalysis";
import { SubtitleSettingsMenu } from "@/components/player/SubtitleSettingsMenu";
import { AccountButton } from "@/components/auth/AccountButton";
import { toast } from "sonner";

const Player = () => {
  usePageMeta({
    title: "Player — Language Learning Player",
    description: "پخش‌کننده‌ی ویدیو — شادویینگ، ترجمه، زیرنویس و تمرین گفتاری.",
  });
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setCurrent = useVideoStore((s) => s.setCurrent);
  const requestSeek = useVideoStore((s) => s.requestSeek);
  const loadSubs = useSubtitleStore((s) => s.loadForVideo);
  const resetSubs = useSubtitleStore((s) => s.reset);
  const primary = useSubtitleStore((s) => s.primary);
  const [needReattach, setNeedReattach] = useState(false);
  const [meta, setMeta] = useState<Video | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [activeCueId, setActiveCueId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const cards = useLeitnerStore((s) => s.cards);
  const removeCard = useLeitnerStore((s) => s.deleteCard);
  const dueCount = useMemo(() => {
    const now = Date.now();
    return cards.filter((c) => c.nextReview <= now).length;
  }, [cards]);
  const videoCards = useMemo(
    () =>
      videoId
        ? cards.filter((c) => c.sourceVideoId === videoId).sort((a, b) => b.createdAt - a.createdAt)
        : [],
    [cards, videoId],
  );
  const reattachRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    let createdObjectUrl: string | null = null;
    (async () => {
      const v = await getVideo(videoId);
      if (cancelled) return;
      if (!v) {
        navigate("/videos");
        return;
      }
      // Remember as last opened.
      setAppState("lastVideoId", videoId).catch(() => undefined);

      // 1) Try the existing in-memory blob URL (still alive in this tab).
      let usable = await verifyBlobUrl(v.blobUrl);

      // 2) If not usable (page reload / new tab), rebuild from the cached File blob.
      if (!usable) {
        const cached = await getVideoBlob(videoId);
        if (cached) {
          createdObjectUrl = URL.createObjectURL(cached);
          const next: Video = { ...v, blobUrl: createdObjectUrl };
          await saveVideo(next);
          setMeta(next);
          setCurrent(next);
          usable = true;
        } else if (!v.blobUrl || v.blobUrl.startsWith("blob:")) {
          setMeta(v);
          setNeedReattach(true);
          setCurrent(null);
        } else {
          // Third-party / remote URL — assume it's playable.
          setMeta(v);
          setCurrent(v);
        }
      } else {
        setMeta(v);
        setCurrent(v);
      }
      loadSubs(videoId);
      // Cinema mode: jump to ?t=<seconds> from a Leitner card.
      const t = Number(searchParams.get("t"));
      if (Number.isFinite(t) && t > 0) {
        setTimeout(() => requestSeek(t, true), 250);
      }
    })();
    return () => {
      cancelled = true;
      resetSubs();
      setCurrent(null);
      if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable store refs; dynamic deps handled internally
  }, [videoId]);

  // Auto-enter immersive on mobile landscape — ONLY when explicitly enabled
  // in settings (default OFF). Many users find auto-rotate-to-fullscreen
  // disruptive on Android, so this is now opt-in.
  const autoImmersiveOnLandscape = useSettingsStore(
    (s) => s.settings.autoImmersiveOnLandscape ?? false,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!autoImmersiveOnLandscape) return;
    const compute = () => {
      const isLandscape = window.matchMedia("(orientation: landscape)").matches;
      const isMobileSize = window.matchMedia("(max-width: 900px)").matches;
      if (isLandscape && isMobileSize) setImmersive(true);
      else setImmersive(false);
    };
    compute();
    const mql = window.matchMedia("(orientation: landscape)");
    const handler = () => compute();
    mql.addEventListener?.("change", handler);
    window.addEventListener("resize", handler);
    return () => {
      mql.removeEventListener?.("change", handler);
      window.removeEventListener("resize", handler);
    };
  }, [autoImmersiveOnLandscape]);

  // When immersive turns on: try to lock to landscape (fullscreen itself is
  // requested synchronously in the click handler below to preserve the user
  // activation needed by Android/iOS Safari).
  // When it turns off: exit fullscreen + unlock orientation.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const docAny = document as Document & {
      webkitExitFullscreen?: () => Promise<void>;
      webkitFullscreenElement?: Element | null;
    };
    if (immersive) {
      const orientation = (
        screen as Screen & {
          orientation?: ScreenOrientation & { lock?: (o: string) => Promise<void> };
        }
      ).orientation;
      window.setTimeout(() => {
        orientation?.lock?.("landscape").catch(() => undefined);
      }, 150);
    } else {
      const orientation = (
        screen as Screen & {
          orientation?: ScreenOrientation & { unlock?: () => void };
        }
      ).orientation;
      orientation?.unlock?.();
      if (document.fullscreenElement || docAny.webkitFullscreenElement) {
        const exit =
          document.exitFullscreen?.bind(document) || docAny.webkitExitFullscreen?.bind(docAny);
        Promise.resolve(exit?.()).catch(() => undefined);
      }
    }
  }, [immersive]);

  /** Enter immersive mode AND request fullscreen in the same user-gesture tick. */
  const enterImmersive = () => {
    if (typeof document !== "undefined") {
      const docEl = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
      };
      const docAny = document as Document & { webkitFullscreenElement?: Element | null };
      const isFs = !!(document.fullscreenElement || docAny.webkitFullscreenElement);
      if (!isFs) {
        const req =
          docEl.requestFullscreen?.bind(docEl) || docEl.webkitRequestFullscreen?.bind(docEl);
        try {
          Promise.resolve(req?.()).catch(() => undefined);
        } catch {
          /* no-op */
        }
      }
    }
    setImmersive(true);
  };

  // Sync state when user exits fullscreen via system gesture.
  useEffect(() => {
    const onChange = () => {
      const inFs = !!(
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement
      );
      if (!inFs && immersive) setImmersive(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange as EventListener);
    };
  }, [immersive]);

  // ESC exits immersive.
  useEffect(() => {
    if (!immersive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImmersive(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [immersive]);

  const handleReattach = async (file: File) => {
    if (!meta) return;
    if (file.name !== meta.fileName) {
      toast.warning(`Expected "${meta.fileName}". Loading anyway.`);
    }
    // Revoke the previous blob URL (if any) before creating a new one to
    // avoid leaking memory across re-attachments.
    if (meta.blobUrl && meta.blobUrl.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(meta.blobUrl);
      } catch {
        /* no-op */
      }
    }
    const blobUrl = URL.createObjectURL(file);
    const next: Video = { ...meta, blobUrl, fileName: file.name };
    await saveVideo(next);
    // Cache the file bytes so future reloads don't require this step.
    try {
      await saveVideoBlob(meta.id, file);
    } catch (e) {
      console.error("Failed to cache video blob", e);
    }
    setMeta(next);
    setCurrent(next);
    setNeedReattach(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Library
            </Button>
          </Link>
          <h1 className="text-base font-medium truncate flex-1 text-center">
            {meta?.title ?? "..."}
          </h1>
          <div className="flex items-center gap-1">
            {videoId && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Export as .llp pack"
                title="Export as .llp pack"
                disabled={exporting}
                onClick={async () => {
                  if (!videoId) return;
                  setExporting(true);
                  try {
                    const name = await exportLLP(videoId);
                    toast.success(`Exported ${name}`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Export failed.");
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                {exporting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Package className="h-5 w-5" />
                )}
              </Button>
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

      <main className="max-w-[1400px] mx-auto sm:px-6 sm:py-6 px-0 py-0 sm:space-y-6">
        {needReattach ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-3">
            <h2 className="text-lg font-medium">Re-attach video file</h2>
            <p className="text-sm text-muted-foreground">
              We couldn't find the cached video file. Pick the same file (
              <span className="font-mono">{meta?.fileName}</span>) — we'll cache it so you won't
              need to do this again.
            </p>
            <input
              ref={reattachRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleReattach(f);
                e.target.value = "";
              }}
            />
            <Button onClick={() => reattachRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Choose file
            </Button>
          </div>
        ) : (
          <div className={showReview ? "grid gap-6 lg:grid-cols-[1fr_320px]" : ""}>
            <div className="space-y-3 sm:space-y-6 min-w-0">
              <VideoPlayer
                videoId={videoId}
                immersive={immersive}
                onEnterImmersive={enterImmersive}
                onExitImmersive={() => setImmersive(false)}
                onActiveCueChange={setActiveCueId}
              />
              {videoId && (
                <section className="space-y-4 px-3 sm:px-0 pb-6 sm:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold mr-auto">Subtitles</h2>
                    <SubtitleSettingsMenu />
                    <Button
                      size="sm"
                      variant={showReview ? "default" : "outline"}
                      onClick={() => setShowReview((v) => !v)}
                      title="Toggle review sidebar"
                    >
                      <Brain className="h-3.5 w-3.5 mr-1.5" />
                      Review {dueCount > 0 && `(${dueCount})`}
                    </Button>
                    <BatchAnalyze videoId={videoId} />
                    <PreStudy videoId={videoId} />
                    <AutoTranscribe videoId={videoId} />
                    <ExportImport videoId={videoId} onImported={() => loadSubs(videoId)} />
                    <SubtitleUpload videoId={videoId} />
                  </div>
                  <SyncControls />
                  {primary && primary.cues.length > 0 && (
                    <details className="rounded-lg border border-border bg-card" open>
                      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium select-none">
                        Cue list ({primary.cues.length})
                      </summary>
                      <div className="p-3">
                        <CueListWithAnalysis
                          videoId={videoId!}
                          cues={primary.cues}
                          activeCueId={activeCueId ?? undefined}
                        />
                      </div>
                    </details>
                  )}

                  {/* All Leitner cards added from this video so far */}
                  <details className="rounded-lg border border-border bg-card" open>
                    <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium select-none">
                      Words & phrases from this video ({videoCards.length})
                    </summary>
                    <div className="p-3">
                      {videoCards.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No cards added yet. Click any word in a subtitle or use the Analyze panel
                          to add vocabulary and idioms here.
                        </p>
                      ) : (
                        <ul className="divide-y divide-border/60">
                          {videoCards.map((c) => {
                            const seekMs = parseSeekMsFromRef(c.sourceCueId);
                            const isSentence = seekMs !== null;
                            return (
                              <li key={c.id} className="flex items-start gap-3 py-2 text-sm">
                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
                                  B{c.box}
                                </span>
                                <button
                                  type="button"
                                  className={`flex-1 min-w-0 text-left ${
                                    isSentence
                                      ? "hover:text-primary transition-colors"
                                      : "cursor-default"
                                  }`}
                                  disabled={!isSentence}
                                  onClick={() => {
                                    if (seekMs !== null) {
                                      requestSeek(seekMs / 1000, true);
                                    }
                                  }}
                                  title={
                                    isSentence ? "Jump to this moment in the video" : undefined
                                  }
                                >
                                  <p className="font-medium truncate">{c.front}</p>
                                  <p dir="auto" className="text-muted-foreground truncate">
                                    {c.back}
                                  </p>
                                </button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 shrink-0"
                                  onClick={() => removeCard(c.id)}
                                  aria-label={`Remove ${c.front}`}
                                  title="Remove from Leitner"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </details>
                </section>
              )}
            </div>
            {showReview && (
              <aside className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
                    <Brain className="h-4 w-4 text-primary" />
                    Leitner Review
                  </h3>
                  <Link
                    to="/leitner"
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Open page →
                  </Link>
                </div>
                <ReviewMode compact />
              </aside>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

async function verifyBlobUrl(url: string): Promise<boolean> {
  if (!url) return false;
  // Remote URLs (http/https) are considered usable; we don't have a local cache
  // to fall back to, so re-attachment would be the wrong UX.
  if (!url.startsWith("blob:")) return true;
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok;
  } catch {
    return false;
  }
}

/** Decode the trailing `@<startMs>` from a sourceCueId, if present. */
function parseSeekMsFromRef(ref: string | undefined | null): number | null {
  if (!ref) return null;
  const at = ref.lastIndexOf("@");
  if (at < 0) return null;
  const n = Number(ref.slice(at + 1));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default Player;
