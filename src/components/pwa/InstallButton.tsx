import { useState } from 'react';
import { Download, Share, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { toast } from 'sonner';

export function InstallButton() {
  const { canInstall, isIOS, promptInstall } = useInstallPrompt();
  const [iosOpen, setIosOpen] = useState(false);

  // Nothing to show: not installable and not iOS, or already installed.
  if (!canInstall && !isIOS) return null;

  const onClick = async () => {
    if (isIOS && !canInstall) {
      setIosOpen(true);
      return;
    }
    const outcome = await promptInstall();
    if (outcome === 'accepted') toast.success('App installed.');
    else if (outcome === 'unavailable') setIosOpen(true);
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={onClick}
        aria-label="Install app"
        className="gap-1.5"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Install app</span>
      </Button>

      <Dialog open={iosOpen} onOpenChange={setIosOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Install on iOS</DialogTitle>
            <DialogDescription>
              Safari doesn't have a built-in install button. Add this app to your home screen
              in two steps:
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium shrink-0">
                1
              </span>
              <span className="flex items-center gap-1.5">
                Tap the <Share className="h-4 w-4 inline" /> Share button at the bottom of
                Safari.
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
