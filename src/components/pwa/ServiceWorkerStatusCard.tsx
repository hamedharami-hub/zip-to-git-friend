import { useEffect, useState } from "react";
import { RefreshCw, Download, HardDrive, Loader2 } from "lucide-react";
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

  return (
    <div className="space-y-4 rounded-[20px] border border-outline-variant bg-surface-container-low p-5 m3-elevation-1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">برنامه</p>
          <p className="text-sm text-muted-foreground">حجم کش و آپدیت‌ها.</p>
        </div>
        {s.updateAvailable ? (
          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20">
            آپدیت موجود
          </Badge>
        ) : null}
      </div>

      <div className="rounded-md border border-outline-variant/60 bg-surface p-3 text-sm">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <HardDrive className="h-3.5 w-3.5" />
          حجم کش
        </div>
        <div className="font-medium mt-1">{formatBytes(s.cacheBytes)}</div>
      </div>

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
    </div>
  );
}
