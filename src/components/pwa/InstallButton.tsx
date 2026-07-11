import { useState } from "react";
import { Download, Share, Plus, MoreVertical, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { toast } from "sonner";

/**
 * Universal "Install app" button.
 *
 * - On Android/desktop Chrome/Edge when `beforeinstallprompt` has fired,
 *   triggers the native install prompt.
 * - Otherwise opens a dialog with platform-specific manual instructions
 *   (iOS Safari "Add to Home Screen", Android Chrome menu, etc.).
 *
 * The button is hidden only when the app is already running standalone.
 */
export function InstallButton() {
  const { canInstall, shouldShowInstallUI, isIOS, isIOSSafari, isAndroid, promptInstall } =
    useInstallPrompt();
  const [helpOpen, setHelpOpen] = useState(false);

  if (!shouldShowInstallUI) return null;

  const onClick = async () => {
    if (canInstall) {
      const outcome = await promptInstall();
      if (outcome === "accepted") {
        toast.success("برنامه نصب شد");
        return;
      }
      if (outcome === "unavailable") {
        setHelpOpen(true);
      }
      return;
    }
    setHelpOpen(true);
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={onClick}
        aria-label="نصب برنامه"
        className="gap-1.5"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">نصب برنامه</span>
      </Button>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>نصب برنامه روی دستگاه</DialogTitle>
            <DialogDescription>
              {isIOS
                ? "در iOS فقط مرورگر Safari می‌تواند برنامه را به صفحهٔ خانه اضافه کند."
                : isAndroid
                  ? "برای نصب روی اندروید، از منوی مرورگر گزینهٔ «Install app» را انتخاب کن."
                  : "برای نصب، از منوی مرورگر گزینهٔ نصب برنامه را انتخاب کن."}
            </DialogDescription>
          </DialogHeader>

          {isIOS ? (
            <ol className="space-y-3 text-sm">
              {!isIOSSafari && (
                <li className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  ابتدا این صفحه را در Safari باز کن (Chrome یا Firefox روی iOS از نصب پشتیبانی
                  نمی‌کنند).
                </li>
              )}
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium shrink-0">
                  ۱
                </span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  دکمهٔ اشتراک‌گذاری <Share className="h-4 w-4 inline" /> پایین Safari را بزن.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium shrink-0">
                  ۲
                </span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  گزینهٔ <Plus className="h-4 w-4 inline" /> «Add to Home Screen» را انتخاب کن.
                </span>
              </li>
            </ol>
          ) : (
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium shrink-0">
                  ۱
                </span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  منوی مرورگر <MoreVertical className="h-4 w-4 inline" /> (سه‌نقطه) بالای صفحه را
                  باز کن.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium shrink-0">
                  ۲
                </span>
                <span>
                  گزینهٔ <b>«Install app»</b> یا <b>«Add to Home screen»</b> را بزن.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium shrink-0">
                  ۳
                </span>
                <span>
                  روی <b>Install</b> در پنجرهٔ تأیید بزن.
                </span>
              </li>
              <li className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                اگر گزینهٔ نصب را نمی‌بینی، یعنی این صفحه روی پیش‌نمایش ویرایشگر باز شده. لینک
                منتشر‌شدهٔ برنامه (دامنهٔ <code>.lovable.app</code>) را در مرورگر باز کن تا قابلیت
                نصب فعال شود.
              </li>
            </ol>
          )}

          <DialogFooter>
            <Button onClick={() => setHelpOpen(false)}>متوجه شدم</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
