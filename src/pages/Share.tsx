import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Share2, AlertCircle, ArrowLeft, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveVideo, saveVideoBlob, setAppState } from "@/lib/db";
import type { Video } from "@/types";
import { importLLP } from "@/lib/llpPack";
import { toast } from "sonner";
import { usePageMeta } from "@/hooks/usePageMeta";

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function isLLP(name: string, mime: string) {
  return name.toLowerCase().endsWith(".llp") || mime === "application/x-llp";
}

function isAudio(name: string, mime: string) {
  if (mime.startsWith("audio/")) return true;
  return /\.(mp3|m4a|wav|ogg|aac|opus|flac)$/i.test(name);
}

function isVideo(name: string, mime: string) {
  if (mime.startsWith("video/")) return true;
  return /\.(mp4|mkv|webm|mov|avi|m4v)$/i.test(name);
}

async function durationOf(file: Blob, mediaType: "video" | "audio"): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(mediaType);
    el.preload = "metadata";
    el.src = url;
    el.onloadedmetadata = () => {
      const d = el.duration || 0;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
  });
}

const SharePage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  usePageMeta({
    title: "ورود اشتراک — Lingua",
    description: "دریافت لینک یا فایل به‌اشتراک‌گذاشته‌شده و افزودن به کتابخانه/اخبار.",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "fallback">("idle");
  const [message, setMessage] = useState<string>("");
  const [stage, setStage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    document.title = "Importing… — Language Learning Player";

    const ids = params.get("ids");
    const errorParam = params.get("error");
    const empty = params.get("empty");

    // GET fallback: some browsers (or our own manifest path) deliver shared
    // links as ?url=… / ?text=… without a SW POST. If we see one, forward
    // straight to the News importer.
    const sharedUrlParam = params.get("url") ?? "";
    const sharedTextParam = params.get("text") ?? "";
    const directUrl = sharedUrlParam || sharedTextParam.match(/https?:\/\/\S+/i)?.[0] || "";
    if (!ids && directUrl) {
      navigate(`/news?import_url=${encodeURIComponent(directUrl)}`, { replace: true });
      return;
    }

    if (errorParam) {
      setStatus("error");
      setMessage(`Share failed: ${decodeURIComponent(errorParam)}`);
      return;
    }
    if (empty) {
      setStatus("error");
      setMessage("No files were shared.");
      return;
    }

    if (!ids) {
      // No SW redirect — show a manual fallback so this page is still useful.
      setStatus("fallback");
      return;
    }

    void processSharedIds(ids.split(",").filter(Boolean));
  }, [params, navigate]);

  const processSharedIds = async (ids: string[]) => {
    setStatus("loading");
    try {
      const cache = await caches.open("incoming-shares-v1");
      const files: File[] = [];
      for (const id of ids) {
        const res = await cache.match(`/__shared__/${id}`);
        if (!res) continue;
        const blob = await res.blob();
        const filename = decodeURIComponent(res.headers.get("X-Shared-Filename") || `shared-${id}`);
        const file = new File([blob], filename, { type: blob.type });
        files.push(file);
        await cache.delete(`/__shared__/${id}`);
      }
      if (files.length === 0) {
        throw new Error("Shared files were not retrievable from cache.");
      }
      await processFiles(files);
    } catch (err) {
      console.error("Share intake failed", err);
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unknown error during import.");
    }
  };

  const processFiles = async (files: File[]) => {
    // Process the first usable file. For multiple files in a single share,
    // we pick the first media file and treat any extra .llp similarly.
    const first = files[0];
    if (!first) {
      setStatus("error");
      setMessage("No file received.");
      return;
    }

    if (isLLP(first.name, first.type)) {
      setStage(`Importing pack “${first.name}”…`);
      const result = await importLLP(first);
      toast.success(
        `Imported ${result.title}${result.tracks ? ` · ${result.tracks} subtitle track(s)` : ""}`,
      );
      await setAppState(
        result.mediaType === "audio" ? "lastAudioId" : "lastVideoId",
        result.videoId,
      );
      navigate(`/player/${result.videoId}`, { replace: true });
      return;
    }

    if (isAudio(first.name, first.type) || isVideo(first.name, first.type)) {
      const mediaType: "video" | "audio" = isAudio(first.name, first.type) ? "audio" : "video";
      setStage(`Adding ${mediaType} “${first.name}”…`);
      const id = uuid();
      const blobUrl = URL.createObjectURL(first);
      const duration = await durationOf(first, mediaType);
      const video: Video = {
        id,
        title: first.name.replace(/\.[^.]+$/, ""),
        fileName: first.name,
        blobUrl,
        duration,
        lastPosition: 0,
        volume: 1,
        playbackSpeed: 1,
        createdAt: Date.now(),
        mediaType,
        mimeType: first.type || (mediaType === "audio" ? "audio/mpeg" : "video/mp4"),
      };
      try {
        await saveVideoBlob(id, first);
      } catch (e) {
        console.error("blob persist failed", e);
      }
      await saveVideo(video);
      await setAppState(mediaType === "audio" ? "lastAudioId" : "lastVideoId", id);
      toast.success(`Added shared ${mediaType}: ${video.title}`);
      navigate(`/player/${id}`, { replace: true });
      return;
    }

    setStatus("error");
    setMessage(`Unsupported file type: ${first.type || first.name}`);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const arr = Array.from(list);
    e.target.value = "";
    setStatus("loading");
    void processFiles(arr).catch((err) => {
      console.error(err);
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Import failed.");
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" aria-label="Back to library" />
          </Link>
          <Share2 className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-lg font-semibold">Incoming share</h1>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center space-y-4">
          {status === "loading" && (
            <>
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{stage || "Processing shared file…"}</p>
            </>
          )}

          {status === "error" && (
            <>
              <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
              <p className="font-medium">Could not import</p>
              <p className="text-sm text-muted-foreground break-words">{message}</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => navigate("/")}>
                  Back to library
                </Button>
                <Button onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" /> Pick a file
                </Button>
              </div>
            </>
          )}

          {(status === "idle" || status === "fallback") && (
            <>
              <Share2 className="h-8 w-8 mx-auto text-primary" />
              <p className="font-medium">Open a shared file</p>
              <p className="text-sm text-muted-foreground">
                Pick a video, audio file, or <code>.llp</code> learning pack. On Android you can
                also share directly into this app from another app.
              </p>
              <Button onClick={() => fileInputRef.current?.click()} className="w-full">
                <Upload className="h-4 w-4 mr-2" />
                Choose file
              </Button>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*,.llp"
            className="hidden"
            onChange={onPick}
          />
        </div>
      </main>
    </div>
  );
};

export default SharePage;
