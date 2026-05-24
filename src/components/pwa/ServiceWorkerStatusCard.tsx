import { useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Download,
  WifiOff,
  Wifi,
  HardDrive,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  subscribePWA,
  checkForUpdate,
  applyUpdate,
  measureCacheBytes,
  type PWAStatus,
} from "@/lib/pwa";

function formatBytes(b: number | null): string {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatTime(ts: number | null): string {
  if (!ts) return "هیچ‌وقت";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "همین الان";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} دقیقه پیش`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} ساعت پیش`;
  return new Date(ts).toLocaleString();
}

export function ServiceWorkerStatusCard() {
  const [s, setS] = useState<PWAStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => subscribePWA(setS), []);
  useEffect(() => {
    measureCacheBytes();
  }, []);

  if (!s) return null;

  const onCheck = async () => {
    setChecking(true);
    try {
      await checkForUpdate();
      await measureCacheBytes();
    } finally {
      setChecking(false);
    }
  };

  const onApply = async () => {
    setApplying(true);
    try {
      await applyUpdate();
    } finally {
      setApplying(false);
    }
  };

  const statusBadge = !s.supported ? (
    <Badge variant="secondary">پشتیبانی نمی‌شود</Badge>
  ) : !s.enabled ? (
    <Badge variant="secondary">
      غیرفعال{" "}
      {s.disabledReason === "iframe"
        ? "(پیش‌نمایش)"
        : s.disabledReason === "preview-host"
        ? "(دامنه‌ی پیش‌نمایش)"
        : ""}
    </Badge>
  ) : s.updateAvailable ? (
    <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20">
      آپدیت موجود
    </Badge>
  ) : s.active ? (
    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20">
      فعال
    </Badge>
  ) : s.registered ? (
    <Badge variant="secondary">در حال آماده‌سازی…</Badge>
  ) : (
    <Badge variant="secondary">ثبت نشده</Badge>
  );

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">Service Worker</p>
          <p className="text-sm text-muted-foreground">
            مدیریت کش آفلاین و دریافت نسخه‌های جدید برنامه.
          </p>
        </div>
        {statusBadge}
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border border-border/60 p-3">
          <dt className="text-xs text-muted-foreground flex items-center gap-1.5">
            {s.active ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            وضعیت
          </dt>
          <dd className="font-medium mt-1">
            {s.active ? "فعال" : s.registered ? "ثبت‌شده" : "خاموش"}
          </dd>
        </div>

        <div className="rounded-md border border-border/60 p-3">
          <dt className="text-xs text-muted-foreground flex items-center gap-1.5">
            {s.online ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-amber-500" />
            )}
            شبکه
          </dt>
          <dd className="font-medium mt-1">{s.online ? "آنلاین" : "آفلاین"}</dd>
        </div>

        <div className="rounded-md border border-border/60 p-3">
          <dt className="text-xs text-muted-foreground flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            آخرین بررسی
          </dt>
          <dd className="font-medium mt-1">{formatTime(s.lastChecked)}</dd>
        </div>

        <div className="rounded-md border border-border/60 p-3">
          <dt className="text-xs text-muted-foreground flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5" />
            حجم کش
          </dt>
          <dd className="font-medium mt-1">{formatBytes(s.cacheBytes)}</dd>
        </div>
      </dl>

      {s.offlineReady && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          ✓ آماده‌ی استفاده‌ی آفلاین
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCheck}
          disabled={!s.enabled || checking}
        >
          {checking ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          بررسی آپدیت
        </Button>

        {s.updateAvailable && (
          <Button size="sm" onClick={onApply} disabled={applying}>
            {applying ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            نصب و راه‌اندازی مجدد
          </Button>
        )}
      </div>

      {!s.enabled && s.disabledReason && (
        <p className="text-xs text-muted-foreground">
          {s.disabledReason === "iframe" || s.disabledReason === "preview-host"
            ? "Service Worker فقط در نسخهٔ منتشرشدهٔ برنامه (خارج از ویرایشگر Lovable) فعال می‌شود."
            : "مرورگر شما از Service Worker پشتیبانی نمی‌کند."}
        </p>
      )}
    </div>
  );
}
