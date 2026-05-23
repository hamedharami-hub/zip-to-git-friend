import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Wires the Android hardware back button (via Capacitor) and the browser
 * back gesture so they behave like a native app:
 *  - If we can go back in history, pop one entry.
 *  - If we're on the home route, exit the app (Capacitor) / no-op (web).
 *
 * Safe no-op on web — the @capacitor/app import is dynamic so it doesn't
 * break the bundle when running in a regular browser.
 */
export function useNativeBackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let mounted = true;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('backButton', ({ canGoBack }) => {
          if (location.pathname !== '/' && (canGoBack || window.history.length > 1)) {
            navigate(-1);
          } else {
            App.exitApp();
          }
        });
        if (!mounted) {
          handle.remove();
          return;
        }
        cleanup = () => handle.remove();
      } catch {
        // Not running inside Capacitor — ignore.
      }
    })();

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [navigate, location.pathname]);
}
