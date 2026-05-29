import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Captures the beforeinstallprompt event so the app can surface a custom
 * "Install" button. Also detects iOS and whether the app is already installed.
 *
 * Note: `beforeinstallprompt` only fires in production on a real domain
 * (HTTPS) and never inside the Lovable editor iframe / preview hosts.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(false);

  const isBrowser = typeof window !== 'undefined';

  const isStandalone =
    isBrowser &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari
      // @ts-expect-error - non-standard
      window.navigator.standalone === true);

  const ua = isBrowser ? navigator.userAgent : '';
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  // On iOS, only Safari can add to Home Screen (Chrome/Firefox/Edge on iOS cannot).
  const isIOSSafari = isIOS && !/CriOS|FxiOS|EdgiOS/.test(ua);

  useEffect(() => {
    if (!isBrowser) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [isBrowser]);

  const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferred) return 'unavailable';
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      return choice.outcome;
    } catch {
      return 'unavailable';
    }
  };

  return {
    /** Native install prompt is ready (Android Chrome / desktop Chrome/Edge). */
    canInstall: !!deferred && !isStandalone && !installed,
    /** Show install UI even without prompt — fall back to manual instructions. */
    shouldShowInstallUI: isBrowser && !isStandalone && !installed,
    isIOS,
    isIOSSafari,
    isAndroid,
    isStandalone,
    promptInstall,
  };
}
