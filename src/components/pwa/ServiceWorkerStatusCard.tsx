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
  FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

const OFFLINE_ROUTES: Array<{ path: string; label: string }> = [
  { path: "/", label: "خانه" },
  { path: "/leitner", label: "Leitner" },
  { path: "/sentence-lab", label: "Sentence Lab" },
  { path: "/books", label: "کتاب‌ها" },
  { path: "/news", label: "اخبار" },
  { path: "/stats", label: "آمار" },
  { path: "/settings", label: "تنظیمات" },
];

function OfflineTestDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FlaskConical className="h-4 w-4 mr-2" />
          راهنمای تست آفلاین
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>تست حالت آفلاین</DialogTitle>
          <DialogDescription>
            بررسی کن که صفحه‌ها از کش Service Worker درست لود می‌شوند.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3 text-sm leading-relaxed">
          <li className="flex gap-2">
            <span className="font-semibold text-primary">۱.</span>
            <span>
              مطمئن شو وضعیت بالا <Badge variant="secondary" className="mx-1">فعال</Badge> است
              (روی دامنهٔ منتشرشده، نه پیش‌نمایش).
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-primary">۲.</span>
            <span>
              در کروم/اج، <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">F12</kbd> →
              تب <b>Network</b> → چک‌باکس <b>Offline</b> را فعال کن.
              <br />
              در موبایل: حالت پرواز (Airplane Mode) را روشن کن.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-primary">۳.</span>
            <div className="space-y-2 flex-1">
              <span>یکی‌یکی این مسیرها را باز کن و ببین لود می‌شوند یا نه:</span>
              <ul className="grid grid-cols-2 gap-1.5">
                {OFFLINE_ROUTES.map((r) => (
                  <li key={r.path}>
                    <a
                      href={r.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-md border border-border bg-muted/50 px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                    >
                      <span className="font-medium">{r.label}</span>
                      <span className="block text-[10px] text-muted-foreground font-mono truncate">
                        {r.path}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-primary">۴.</span>
            <span>
              بعد از تست، Offline را خاموش کن. اگر صفحه‌ای لود نشد، یک‌بار آنلاین
              بازش کن تا کش شود، سپس دوباره تست کن.
            </span>
          </li>
        </ol>

        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <b>نکته:</b> داده‌های API (لیست لایتنر، اخبار جدید) آنلاین لازم دارند.
          آفلاین فقط ساختار صفحه و داده‌های کش‌شدهٔ قبلی نمایش داده می‌شود.
        </div>
      </DialogContent>
    </Dialog>
  );
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
    <div className="space-y-4 rounded-[20px] border border-outline-variant bg-surface-container-low p-5 m3-elevation-1">
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
        <div className="rounded-md border border-outline-variant/60 bg-surface p-3">
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

        <div className="rounded-md border border-outline-variant/60 bg-surface p-3">
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

        <div className="rounded-md border border-outline-variant/60 bg-surface p-3">
          <dt className="text-xs text-muted-foreground flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            آخرین بررسی
          </dt>
          <dd className="font-medium mt-1">{formatTime(s.lastChecked)}</dd>
        </div>

        <div className="rounded-md border border-outline-variant/60 bg-surface p-3">
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

        <OfflineTestDialog />
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
