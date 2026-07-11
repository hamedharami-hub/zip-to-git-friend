/**
 * Lightweight client-side validation for media uploads.
 * Belt-and-braces: limits file size and rejects obviously wrong mime/extension.
 *
 * NOTE: This is a UX safeguard, not a security boundary — files never leave
 * the device. Real protection comes from running everything in the browser
 * sandbox.
 */

const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024; // 4 GiB
const MAX_AUDIO_BYTES = 1 * 1024 * 1024 * 1024; // 1 GiB
const MAX_LLP_BYTES = 4 * 1024 * 1024 * 1024; // 4 GiB

const VIDEO_EXTS = [".mp4", ".mkv", ".webm", ".mov", ".m4v", ".avi"];
const AUDIO_EXTS = [".mp3", ".m4a", ".wav", ".ogg", ".flac", ".aac", ".opus"];

export type MediaKind = "video" | "audio" | "llp";

export interface ValidationResult {
  ok: boolean;
  /** Human-readable reason when ok=false. */
  reason?: string;
}

function getExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024).toFixed(0)} KiB`;
}

export function validateMediaFile(file: File, kind: MediaKind): ValidationResult {
  if (!file || !(file instanceof File)) {
    return { ok: false, reason: "No file selected." };
  }
  if (file.size === 0) {
    return { ok: false, reason: "File is empty." };
  }
  const ext = getExt(file.name);
  const mime = (file.type || "").toLowerCase();

  if (kind === "video") {
    if (file.size > MAX_VIDEO_BYTES) {
      return {
        ok: false,
        reason: `Video too large (${fmtSize(file.size)}). Max ${fmtSize(MAX_VIDEO_BYTES)}.`,
      };
    }
    const looksVideo = mime.startsWith("video/") || VIDEO_EXTS.includes(ext);
    if (!looksVideo) {
      return {
        ok: false,
        reason: `Not a recognized video format (${ext || mime || "unknown"}).`,
      };
    }
    return { ok: true };
  }

  if (kind === "audio") {
    if (file.size > MAX_AUDIO_BYTES) {
      return {
        ok: false,
        reason: `Audio too large (${fmtSize(file.size)}). Max ${fmtSize(MAX_AUDIO_BYTES)}.`,
      };
    }
    const looksAudio = mime.startsWith("audio/") || AUDIO_EXTS.includes(ext);
    if (!looksAudio) {
      return {
        ok: false,
        reason: `Not a recognized audio format (${ext || mime || "unknown"}).`,
      };
    }
    return { ok: true };
  }

  // llp
  if (file.size > MAX_LLP_BYTES) {
    return {
      ok: false,
      reason: `Pack too large (${fmtSize(file.size)}). Max ${fmtSize(MAX_LLP_BYTES)}.`,
    };
  }
  if (
    ext !== ".llp" &&
    ext !== ".zip" &&
    !mime.includes("zip") &&
    mime !== "application/octet-stream"
  ) {
    return {
      ok: false,
      reason: `Not a recognized .llp pack (got ${ext || mime || "unknown"}).`,
    };
  }
  return { ok: true };
}
