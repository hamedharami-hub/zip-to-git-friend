import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBookStore } from '@/store/bookStore';
import { isLanguageBook } from '@/lib/languageBook';

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

    // Map a deep route to a sensible parent so pressing back on a cold-loaded
     // article/book/etc. returns to its list instead of exiting the app.
    const parentFor = (path: string): string | null => {
      if (path.startsWith('/news/article/') || path.startsWith('/news/digest/')) return '/news';
      if (path.startsWith('/books/')) {
        // Try to detect a language book so we return to /language-books.
        try {
          // Lazy import to avoid a hard dependency cycle.
          const bookId = path.split('/')[2];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const store = (window as any).__llvp_bookStore__;
          const book = store?.getState?.().books?.find?.((b: { id: string }) => b.id === bookId);
          if (book && (book.kind === 'language' || book.isLanguageBook)) return '/language-books';
        } catch { /* ignore */ }
        return '/books';
      }
      if (path.startsWith('/sentence-lab/')) return '/sentence-lab';
      if (path.startsWith('/leitner')) return '/';
      if (path === '/videos' || path === '/audio' || path === '/books' ||
          path === '/language-books' || path === '/news' || path === '/settings' ||
          path === '/stats' || path === '/sentence-lab' || path === '/leitner') return '/';
      return null;
    };

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('backButton', ({ canGoBack }) => {
          const path = location.pathname;
          if (path === '/') {
            App.exitApp();
            return;
          }
          if (canGoBack || window.history.length > 1) {
            navigate(-1);
            return;
          }
          const parent = parentFor(path);
          if (parent && parent !== path) {
            navigate(parent);
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
