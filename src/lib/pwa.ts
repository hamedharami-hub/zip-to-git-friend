/**
 * PWA service-worker registration + small reactive status store.
 *
 * Guards:
 *  - never registers inside an iframe (Lovable editor preview runs in iframe)
 *  - never registers on Lovable preview hostnames
 *  - on update, shows a toast asking the user to refresh
 */
import { toast } from "sonner";

export interface PWAStatus {
  /** Browser supports service workers at all. */
  supported: boolean;
  /** We attempted registration (i.e. we're NOT in preview/iframe). */
  enabled: boolean;
  /** Reason registration was skipped (only when !enabled). */
  disabledReason: "iframe" | "preview-host" | "unsupported" | null;
  /** SW is registered with the browser. */
  registered: boolean;
  /** Active SW controls this page. */
  active: boolean;
  /** A new SW is waiting to take over. */
  updateAvailable: boolean;
  /** App is ready for offline use. */
  offlineReady: boolean;
  /** Timestamp of last update check (ms). */
  lastChecked: number | null;
  /** Cache storage usage in bytes (best-effort). */
  cacheBytes: number | null;
  /** Online state. */
  online: boolean;
}

type Listener = (s: PWAStatus) => void;

const isBrowser = typeof window !== "undefined";

let status: PWAStatus = {
  supported: isBrowser && "serviceWorker" in navigator,
  enabled: false,
  disabledReason: null,
  registered: false,
  active: false,
  updateAvailable: false,
  offlineReady: false,
  lastChecked: null,
  cacheBytes: null,
  online: isBrowser ? navigator.onLine : true,
};

const listeners = new Set<Listener>();
let updateSWFn: ((reload?: boolean) => Promise<void>) | null = null;
let registered = false;

function set(patch: Partial<PWAStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l(status));
}

export function getPWAStatus(): PWAStatus {
  return status;
}

export function subscribePWA(l: Listener): () => void {
  listeners.add(l);
  l(status);
  return () => listeners.delete(l);
}

/** Manually trigger an update check (reads the registration's update endpoint). */
export async function checkForUpdate(): Promise<void> {
  if (!isBrowser || !("serviceWorker" in navigator)) return;
  if (updateSWFn) {
    try {
      await updateSWFn(false);
    } catch {
      /* swallow */
    }
  } else {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.update().catch(() => {})));
  }
  set({ lastChecked: Date.now() });
  await refreshRegistrationState();
}

/** Apply a waiting update (reloads the page). */
export async function applyUpdate(): Promise<void> {
  if (updateSWFn) {
    await updateSWFn(true);
    return;
  }
  // Fallback: tell waiting worker to skip, then reload.
  const reg = await navigator.serviceWorker?.getRegistration();
  reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
  window.location.reload();
}

/** Compute total bytes used by Cache Storage (best-effort). */
export async function measureCacheBytes(): Promise<number | null> {
  try {
    if (navigator.storage && "estimate" in navigator.storage) {
      const est = await navigator.storage.estimate();
      const used = est.usage ?? null;
      set({ cacheBytes: used });
      return used;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function refreshRegistrationState() {
  if (!isBrowser || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  set({
    registered: !!reg,
    active: !!reg?.active && !!navigator.serviceWorker.controller,
    updateAvailable: !!reg?.waiting,
  });
}

export function registerPWA() {
  if (registered) return;
  registered = true;

  if (!isBrowser || !("serviceWorker" in navigator)) {
    set({ supported: false, disabledReason: "unsupported" });
    return;
  }

  const inIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const host = window.location.hostname;
  const isPreviewHost =
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    (host.includes("lovable.app") && host.includes("-dev."));

  if (inIframe || isPreviewHost) {
    set({
      enabled: false,
      disabledReason: inIframe ? "iframe" : "preview-host",
    });
    // Clean up any leftover SW so preview is never served stale assets.
    navigator.serviceWorker
      .getRegistrations()
      .then((rs) => rs.forEach((r) => r.unregister()));
    return;
  }

  set({ enabled: true });

  window.addEventListener("online", () => set({ online: true }));
  window.addEventListener("offline", () => set({ online: false }));

  // Lazy-load the virtual module so it never executes in preview.
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      const updateSW = registerSW({
        immediate: true,
        onRegisteredSW(_url, reg) {
          set({ registered: !!reg, lastChecked: Date.now() });
          refreshRegistrationState();
          measureCacheBytes();
        },
        onNeedRefresh() {
          set({ updateAvailable: true });
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
          set({ offlineReady: true });
          toast.success("برنامه آماده‌ی استفاده‌ی آفلاینه");
        },
      });
      updateSWFn = updateSW;

      // Poll for updates every 60 min while app is open.
      setInterval(() => {
        updateSW().catch(() => {});
        set({ lastChecked: Date.now() });
      }, 60 * 60 * 1000);
    })
    .catch(() => {
      /* SW not built (dev) */
    });
}
