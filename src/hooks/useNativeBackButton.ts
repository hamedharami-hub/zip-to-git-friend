import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useBookStore } from "@/store/bookStore";
import { isLanguageBook } from "@/lib/languageBook";

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
      if (path.startsWith("/news/article/") || path.startsWith("/news/digest/")) return "/news";
      if (path.startsWith("/news")) return "/";
      if (path.startsWith("/books/")) {
        try {
          const bookId = path.split("/")[2];
          const book = useBookStore.getState().books.find((b) => b.id === bookId);
          if (book && isLanguageBook(book)) return "/language-books";
        } catch {
          /* ignore */
        }
        return "/books";
      }
      if (path.startsWith("/sentence-lab/")) return "/sentence-lab";
      if (path.startsWith("/leitner")) return "/";
      if (path.startsWith("/share")) return "/news";
      if (path.startsWith("/firebase-auth") || path.startsWith("/auth")) return "/";
      if (path.startsWith("/player/") || path.startsWith("/videos/")) return "/videos";
      if (path.startsWith("/audio/")) return "/audio";
      if (
        path === "/videos" ||
        path === "/audio" ||
        path === "/books" ||
        path === "/language-books" ||
        path === "/news" ||
        path === "/settings" ||
        path === "/stats" ||
        path === "/sentence-lab" ||
        path === "/leitner"
      )
        return "/";
      return null;
    };

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("backButton", ({ canGoBack }) => {
          const path = location.pathname;
          if (path === "/") {
            App.exitApp();
            return;
          }
          // For article/digest pages, always jump straight to the news list —
          // in-page navigations (tab switches, hash changes) inflate history and
          // make navigate(-1) land on the same article again.
          const forceParent = parentFor(path);
          if (
            forceParent &&
            (path.startsWith("/news/article/") || path.startsWith("/news/digest/"))
          ) {
            navigate(forceParent);
            return;
          }
          if (canGoBack || window.history.length > 1) {
            navigate(-1);
            return;
          }
          if (forceParent && forceParent !== path) {
            navigate(forceParent);
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
