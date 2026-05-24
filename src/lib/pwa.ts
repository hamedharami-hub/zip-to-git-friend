/**
 * PWA service-worker registration.
 *
 * Guards:
 *  - never registers inside an iframe (Lovable editor preview runs in iframe)
 *  - never registers on Lovable preview hostnames
 *  - on update, shows a toast asking the user to refresh
 */
import { toast } from "sonner";

export function registerPWA() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const inIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();

  const host = window.location.hostname;
  const isPreviewHost =
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host.includes("lovable.app") && host.includes("-dev.");

  if (inIframe || isPreviewHost) {
    // Clean up any leftover SW so preview is never served stale assets.
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    return;
  }

  // Lazy-load the virtual module so it never executes in preview.
  import("virtual:pwa-register").then(({ registerSW }) => {
    const updateSW = registerSW({
      onNeedRefresh() {
        toast("نسخه‌ی جدید برنامه آماده‌ست", {
          description: "برای استفاده از تغییرات تازه، برنامه را به‌روزرسانی کن.",
          duration: Infinity,
          action: {
            label: "به‌روزرسانی",
            onClick: () => updateSW(true),
          },
        });
      },
      onOfflineReady() {
        toast.success("برنامه آماده‌ی استفاده‌ی آفلاینه");
      },
    });

    // Optional: poll for updates every 60 min while app is open.
    setInterval(() => updateSW(), 60 * 60 * 1000);
  }).catch(() => {/* SW not built (dev) */});
}
