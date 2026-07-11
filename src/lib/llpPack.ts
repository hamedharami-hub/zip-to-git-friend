import type JSZipType from "jszip";

// Dynamically load JSZip on first use to keep it out of the initial bundle.
let _jszip: typeof JSZipType | null = null;
async function loadJSZip(): Promise<typeof JSZipType> {
  if (_jszip) return _jszip;
  const mod = await import("jszip");
  _jszip = mod.default ?? (mod as unknown as typeof JSZipType);
  return _jszip;
}
import type { LeitnerCard, SegmentAnalysis, SubtitleTrack, Video } from "@/types";
import {
  getAllAnalysisForVideo,
  getTracks,
  getVideo,
  getVideoBlob,
  saveAnalysis,
  saveLeitnerCard,
  saveTrack,
  saveVideo,
  saveVideoBlob,
  getAllLeitnerCards,
} from "@/lib/db";
import { downloadFile } from "@/lib/srtExporter";

/**
 * .llp = "Language Learning Pack"
 *
 * A self-contained portable bundle (ZIP with .llp extension) for one piece of
 * media. Contains the raw audio/video, both subtitle tracks, all AI analyses,
 * and (optionally) the Leitner cards that were created from this media.
 *
 * Layout:
 *   manifest.json
 *   media.<ext>           -- raw media bytes (mp4 / mp3 / etc.)
 *   tracks/<id>.json      -- subtitle tracks (full structure inc. word-timestamps)
 *   analysis.json         -- per-cue AI analyses
 *   leitner.json          -- (optional) cards sourced from this video
 */

export interface LLPManifest {
  schema: "llvp.pack.v1";
  exportedAt: number;
  app: "language-learning-player";
  appVersion: string;
  video: Omit<Video, "blobUrl">;
  mediaFile: string; // relative path inside the zip
  trackIds: string[];
  hasAnalysis: boolean;
  leitnerCount: number;
}

const APP_VERSION = "1.0.0";

function extensionFor(mimeType: string | undefined, fileName: string | undefined): string {
  if (fileName && /\.[a-z0-9]{2,5}$/i.test(fileName)) {
    return fileName.slice(fileName.lastIndexOf("."));
  }
  if (!mimeType) return ".bin";
  if (mimeType.startsWith("audio/mpeg")) return ".mp3";
  if (mimeType.startsWith("audio/mp4")) return ".m4a";
  if (mimeType.startsWith("audio/wav") || mimeType === "audio/x-wav") return ".wav";
  if (mimeType.startsWith("audio/")) return ".audio";
  if (mimeType.startsWith("video/mp4")) return ".mp4";
  if (mimeType.startsWith("video/webm")) return ".webm";
  if (mimeType.startsWith("video/quicktime")) return ".mov";
  if (mimeType.startsWith("video/")) return ".video";
  return ".bin";
}

function safeName(s: string, max = 60) {
  return (
    (s || "pack")
      .replace(/[^\w\-. ]+/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, max) || "pack"
  );
}

/**
 * Build a .llp Blob for the given video. Includes media bytes when available.
 */
export async function buildLLPBlob(
  videoId: string,
  options: { includeLeitner?: boolean } = {},
): Promise<{ blob: Blob; filename: string }> {
  const video = await getVideo(videoId);
  if (!video) throw new Error("Video not found.");

  const tracks = await getTracks(videoId);
  const analyses = await getAllAnalysisForVideo(videoId);
  const mediaBlob = await getVideoBlob(videoId);

  const ext = extensionFor(video.mimeType, video.fileName);
  const mediaFile = `media${ext}`;

  const includeLeitner = options.includeLeitner ?? true;
  let cards: LeitnerCard[] = [];
  if (includeLeitner) {
    const all = await getAllLeitnerCards();
    cards = all.filter((c) => c.sourceVideoId === videoId);
  }

  const { blobUrl: _omit, ...videoMeta } = video;
  const manifest: LLPManifest = {
    schema: "llvp.pack.v1",
    exportedAt: Date.now(),
    app: "language-learning-player",
    appVersion: APP_VERSION,
    video: videoMeta,
    mediaFile,
    trackIds: tracks.map((t) => t.id),
    hasAnalysis: analyses.length > 0,
    leitnerCount: cards.length,
  };

  const JSZipCtor = await loadJSZip();
  const zip = new JSZipCtor();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  if (mediaBlob) {
    zip.file(mediaFile, mediaBlob);
  }

  const tracksDir = zip.folder("tracks");
  for (const t of tracks) {
    tracksDir!.file(`${t.id}.json`, JSON.stringify(t, null, 2));
  }

  if (analyses.length > 0) {
    zip.file("analysis.json", JSON.stringify(analyses, null, 2));
  }

  if (cards.length > 0) {
    zip.file("leitner.json", JSON.stringify(cards, null, 2));
  }

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/octet-stream",
  });

  const filename = `${safeName(video.title)}.llp`;
  return { blob, filename };
}

/**
 * Trigger a download of the given video as a .llp pack.
 */
export async function exportLLP(
  videoId: string,
  options: { includeLeitner?: boolean } = {},
): Promise<string> {
  const { blob, filename } = await buildLLPBlob(videoId, options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

export interface ImportResult {
  videoId: string;
  title: string;
  mediaType: "video" | "audio";
  tracks: number;
  analyses: number;
  leitnerCards: number;
  hasMedia: boolean;
}

/**
 * Import a .llp file (or a Blob with the same structure). Restores the media
 * blob, subtitle tracks, analyses, and (optionally) Leitner cards.
 *
 * Returns metadata so the caller can navigate to the player.
 */
export async function importLLP(file: File | Blob): Promise<ImportResult> {
  const JSZipCtor = await loadJSZip();
  const zip = await JSZipCtor.loadAsync(file);
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) {
    throw new Error("Not a valid .llp file (missing manifest.json).");
  }
  const manifestText = await manifestEntry.async("string");
  const manifest = JSON.parse(manifestText) as LLPManifest;
  if (manifest.schema !== "llvp.pack.v1") {
    throw new Error(`Unsupported pack schema: ${manifest.schema}`);
  }

  // Generate a fresh id so importing the same pack twice does not overwrite.
  const newId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `llp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const mediaType: "video" | "audio" = manifest.video.mediaType ?? "video";

  let blobUrl = "";
  let hasMedia = false;
  const mediaEntry = zip.file(manifest.mediaFile);
  if (mediaEntry) {
    const mediaBlob = await mediaEntry.async("blob");
    const typedBlob = new Blob([mediaBlob], {
      type: manifest.video.mimeType || (mediaType === "audio" ? "audio/mpeg" : "video/mp4"),
    });
    blobUrl = URL.createObjectURL(typedBlob);
    await saveVideoBlob(newId, typedBlob);
    hasMedia = true;
  }

  const restoredVideo: Video = {
    ...manifest.video,
    id: newId,
    blobUrl,
    lastPosition: 0,
    createdAt: Date.now(),
  };
  await saveVideo(restoredVideo);

  // Tracks
  let trackCount = 0;
  const trackEntries = Object.keys(zip.files).filter(
    (p) => p.startsWith("tracks/") && p.endsWith(".json"),
  );
  for (const path of trackEntries) {
    const entry = zip.file(path);
    if (!entry) continue;
    const text = await entry.async("string");
    const track = JSON.parse(text) as SubtitleTrack;
    track.videoId = newId;
    // Re-namespace the track id to avoid collisions across imports.
    track.id = `${newId}::${track.role}`;
    await saveTrack(track);
    trackCount += 1;
  }

  // Analyses
  let analysisCount = 0;
  const analysisEntry = zip.file("analysis.json");
  if (analysisEntry) {
    const text = await analysisEntry.async("string");
    const list = JSON.parse(text) as Array<{ cueId: string; analysis: SegmentAnalysis }>;
    for (const item of list) {
      await saveAnalysis(newId, item.cueId, item.analysis);
      analysisCount += 1;
    }
  }

  // Leitner cards (optional)
  let cardCount = 0;
  const leitnerEntry = zip.file("leitner.json");
  if (leitnerEntry) {
    const text = await leitnerEntry.async("string");
    const cards = JSON.parse(text) as LeitnerCard[];
    for (const c of cards) {
      const fresh: LeitnerCard = {
        ...c,
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `card_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        sourceVideoId: newId,
      };
      await saveLeitnerCard(fresh);
      cardCount += 1;
    }
  }

  return {
    videoId: newId,
    title: manifest.video.title,
    mediaType,
    tracks: trackCount,
    analyses: analysisCount,
    leitnerCards: cardCount,
    hasMedia,
  };
}

// Re-export downloadFile so callers don't need a second import.
export { downloadFile };
