import { useEffect, useState } from "react";
import { Download, Sparkles, X, Share, Plus } from "lucide-react";
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

const DISMISS_KEY = "pwa-install-banner-dismissed-v1";
const SHOW_DELAY_MS = 1500;

/**
 * One-time, dismissible banner that promotes installing the PWA.
 * - Auto-hides after the user installs or dismisses (persisted to localStorage).
 * - Skipped entirely if already running standalone or recently dismissed.
 */
export function PWAInstallBanner() {
  const { canInstall, isIOS, isStandalone, promptInstall } = useInstallPrompt();
  const [visible, setVisible] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);

  useEffect(() => {
    if (isStandalone) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* storage unavailable */
    }
    if (dismissed) return;
    if (!canInstall && !isIOS) return;

    const t = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [canInstall, isIOS, isStandalone]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const onInstall = async () => {
    if (isIOS && !canInstall) {
      setIosOpen(true);
      return;
    }
    const outcome = await promptInstall();
    if (outcome === "accepted") {
      toast.success("App installed.");
      dismiss();
    } else if (outcome === "unavailable") {
      setIosOpen(true);
    }
  };

  return (
    <>
      <aside
        role="region"
        aria-label="Install app banner"
        className="relative overflow-hidden rounded-xl border border-primary/40 bg-gradient-to-br from-primary/15 via-card to-card p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">Install for the best experience</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Open faster, learn offline, and receive shared files from other apps.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={onInstall} className="gap-1.5">
                <Download className="h-4 w-4" aria-hidden="true" />
                {isIOS && !canInstall ? "Add to Home Screen" : "Install app"}
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>
                Maybe later
              </Button>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 -mt-1 -mr-1"
            onClick={dismiss}
            aria-label="Dismiss install banner"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </aside>

      <Dialog open={iosOpen} onOpenChange={setIosOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Install on iOS</DialogTitle>
            <DialogDescription>
              Safari doesn't have a built-in install button. Add this app to your home screen in two
              steps:
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium shrink-0">
                1
              </span>
              <span className="flex items-center gap-1.5">
                Tap the <Share className="h-4 w-4 inline" /> Share button at the bottom of Safari.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium shrink-0">
                2
              </span>
              <span className="flex items-center gap-1.5">
                Choose <Plus className="h-4 w-4 inline" /> "Add to Home Screen".
              </span>
            </li>
          </ol>
          <DialogFooter>
            <Button onClick={() => setIosOpen(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
