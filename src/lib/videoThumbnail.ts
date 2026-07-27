/**
 * Capture a single JPEG thumbnail from a video blob URL.
 * Returns a base64 data URL or undefined if the video cannot be decoded.
 */
export function captureVideoThumbnail(blobUrl: string, atSec = 0.5): Promise<string | undefined> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    v.src = blobUrl;

    const cleanup = () => {
      v.pause();
      v.removeAttribute("src");
      v.load();
    };

    const onCanPlay = () => {
      if (v.duration && Number.isFinite(v.duration) && atSec > v.duration) {
        atSec = Math.max(0, v.duration / 2);
      }
      v.currentTime = atSec;
    };

    const onSeeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = Math.round((canvas.width * v.videoHeight) / v.videoWidth) || 180;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          resolve(undefined);
          return;
        }
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
        cleanup();
        resolve(dataUrl);
      } catch {
        cleanup();
        resolve(undefined);
      }
    };

    v.addEventListener("canplay", onCanPlay, { once: true });
    v.addEventListener("seeked", onSeeked, { once: true });
    v.addEventListener(
      "error",
      () => {
        cleanup();
        resolve(undefined);
      },
      { once: true },
    );
    void v.play().catch(() => undefined);
  });
}
