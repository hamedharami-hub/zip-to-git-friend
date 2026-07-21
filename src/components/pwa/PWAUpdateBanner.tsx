import { useEffect, useState } from "react";
import { RefreshCw, X, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyUpdate, checkForUpdate, subscribePWA, type PWAStatus } from "@/lib/pwa";

const DISMISS_UNTIL_KEY = "pwa-update-dismissed-until";
const DISMISS_MS = 60 * 60 * 1000; // 1 hour

function isDismissed(): boolean {
  try {
    const until = Number(localStorage.getItem(DISMISS_UNTIL_KEY) || "0");
    return until > Date.now();
  } catch {
    return false;
  }
}

function setDismissed() {
  try {
    localStorage.setItem(DISMISS_UNTIL_KEY, String(Date.now() + DISMISS_MS));
  } catch {
    /* ignore */
  }
}

export function PWAUpdateBanner() {
  const [status, setStatus] = useState<PWAStatus | null>(null);
  const [applying, setApplying] = useState(false);
  const [dismissed, setDismissedState] = useState(false);

  useEffect(() => subscribePWA(setStatus), []);

  if (!status || !status.enabled) return null;

  const updatePending = status.updateAvailable;
  const offline = !status.online;

  if (dismissed || isDismissed()) return null;

  if (updatePending) {
    return (
      <div
        role="status"
        className="sticky top-0 z-50 w-full border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-amber-900 dark:text-amber-100 backdrop-blur"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
            <span className="line-clamp-1">
              نسخه‌ی جدید برنامه آماده‌ست. برای دریافت تغییرات، به‌روزرسانی کنید.
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={applying}
              onClick={() => {
                setApplying(true);
                void applyUpdate();
              }}
            >
              {applying ? <RefreshCw className="mr-1.5 h-3 w-3 animate-spin" /> : null}
              به‌روزرسانی
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => {
                setDismissed();
                setDismissedState(true);
              }}
              aria-label="بستن"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (offline) {
    return (
      <div
        role="status"
        className="sticky top-0 z-50 w-full border-b border-border bg-slate-900/80 px-4 py-2 text-xs text-slate-200 backdrop-blur"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2">
          <WifiOff className="h-3.5 w-3.5" />
          <span>شما آفلاین هستید. محتوای ذخیره‌شده همچنان در دسترس است.</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs text-slate-300 underline"
            onClick={() => void checkForUpdate()}
          >
            بررسی دوباره
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
