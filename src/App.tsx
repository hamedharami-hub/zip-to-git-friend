import { Suspense, lazy, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useSettingsStore } from "./store/settingsStore";
import { useLeitnerStore } from "./store/leitnerStore";
import { useLeitnerFolderStore } from "./store/leitnerFolderStore";
import { useOnline } from "./hooks/useOnline";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { FirebaseAuthProvider } from "./contexts/FirebaseAuthContext";
import { startSync, stopSync } from "./lib/leitnerSync";
import { useNativeBackButton } from "./hooks/useNativeBackButton";
import { useEdgeSwipeBack } from "./hooks/useEdgeSwipeBack";
import { Haptic } from "./components/Haptic";

import { PlayerSkeleton } from "@/components/player/PlayerSkeleton";

const Home = lazy(() => import("./pages/Home"));
const Videos = lazy(() => import("./pages/Videos"));
const Player = lazy(() => import("./pages/Player"));
const Settings = lazy(() => import("./pages/Settings"));
const Leitner = lazy(() => import("./pages/Leitner"));
const Stats = lazy(() => import("./pages/Stats"));
const Auth = lazy(() => import("./pages/Auth"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Audio = lazy(() => import("./pages/Audio"));
const Books = lazy(() => import("./pages/Books"));
const LanguageBooks = lazy(() => import("./pages/LanguageBooks"));
const BookReader = lazy(() => import("./pages/BookReader"));
const SharePage = lazy(() => import("./pages/Share"));
const News = lazy(() => import("./pages/News"));
const SentenceLab = lazy(() => import("./pages/SentenceLab"));
const SentenceCategory = lazy(() => import("./pages/SentenceLab/Category"));
const SentenceDrill = lazy(() => import("./pages/SentenceLab/Drill"));
const SentencePath = lazy(() => import("./pages/SentenceLab/Path"));
const SentencePlanner = lazy(() => import("./pages/SentenceLab/Planner"));
const SentenceScenario = lazy(() => import("./pages/SentenceLab/Scenario"));
const SentenceLeitner = lazy(() => import("./pages/SentenceLab/Leitner"));
const SentenceGeneral = lazy(() => import("./pages/SentenceLab/General"));
const SentenceDomain = lazy(() => import("./pages/SentenceLab/Domain"));
const SentencePathDetail = lazy(() => import("./pages/SentenceLab/PathDetail"));
const SentenceAdmin = lazy(() => import("./pages/SentenceLab/Admin"));
const NewsArticle = lazy(() => import("./pages/NewsArticle"));
const NewsDigest = lazy(() => import("./pages/NewsDigest"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const FirebaseAuthPage = lazy(() => import("./pages/FirebaseAuth"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const NativeGestures = () => {
  useNativeBackButton();
  useEdgeSwipeBack();
  return null;
};

// Schedule a callback during idle time; falls back to setTimeout.
const onIdle = (cb: () => void, timeout = 2000) => {
  if (typeof window === "undefined") return;
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (w.requestIdleCallback) w.requestIdleCallback(cb, { timeout });
  else setTimeout(cb, 200);
};

const SyncBridge = () => {
  const { user } = useAuth();
  useEffect(() => {
    if (user) {
      // Defer the (potentially heavy) sync setup until the browser is idle so it
      // never competes with first paint or route hydration.
      onIdle(() => {
        startSync(user.id).catch((e) => console.error("startSync failed", e));
      });
    } else {
      stopSync().catch(() => undefined);
    }
  }, [user]);
  return null;
};

const SettingsBootstrap = ({ children }: { children: React.ReactNode }) => {
  const load = useSettingsStore((s) => s.load);
  const loadLeitner = useLeitnerStore((s) => s.load);
  const loadFolders = useLeitnerFolderStore((s) => s.load);
  useOnline();
  useEffect(() => {
    // Apply persisted theme synchronously to avoid a flash, then hydrate the
    // rest in the background — do NOT block first paint on IndexedDB reads.
    try {
      const t = localStorage.getItem("llvp-theme");
      if (t === "dark") document.documentElement.classList.add("dark");
      else if (t === "light") document.documentElement.classList.remove("dark");
      else document.documentElement.classList.add("dark");
    } catch {
      document.documentElement.classList.add("dark");
    }
    load();
    // Leitner stores are heavy (whole card set + folder sync). Defer them.
    onIdle(() => {
      loadLeitner();
      loadFolders();
    });
  }, [load, loadLeitner, loadFolders]);
  return <>{children}</>;
};

const RouteFallback = () => (
  <div
    role="status"
    aria-live="polite"
    className="min-h-[60vh] flex flex-col items-center justify-center gap-3 p-6"
  >
    <div className="relative">
      <div className="h-10 w-10 rounded-full border-2 border-primary/20" />
      <div className="absolute inset-0 h-10 w-10 rounded-full border-2 border-transparent border-t-primary animate-spin" />
    </div>
    <p className="text-xs text-muted-foreground font-serif italic tracking-wide">
      در حال بارگذاری…
    </p>
  </div>
);

const wrap = (name: string, node: React.ReactNode, fallback?: React.ReactNode) => (
  <ErrorBoundary routeName={name}>
    <Suspense fallback={fallback ?? <RouteFallback />}>{node}</Suspense>
  </ErrorBoundary>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <FirebaseAuthProvider>
          <SettingsBootstrap>
            <SyncBridge />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Haptic />
              <NativeGestures />
              <Routes>
                <Route path="/" element={wrap("Home", <Home />)} />
                <Route path="/videos" element={wrap("Videos", <Videos />)} />
                <Route path="/auth" element={wrap("Auth", <Auth />)} />
                <Route path="/auth/callback" element={wrap("AuthCallback", <AuthCallback />)} />
                <Route path="/firebase-auth" element={wrap("FirebaseAuth", <FirebaseAuthPage />)} />
                <Route
                  path="/player/:videoId"
                  element={wrap("Player", <Player />, <PlayerSkeleton />)}
                />
                <Route path="/leitner" element={wrap("Leitner", <Leitner />)} />
                <Route path="/stats" element={wrap("Stats", <Stats />)} />
                <Route path="/audio" element={wrap("Audio", <Audio />)} />
                <Route path="/books" element={wrap("Books", <Books />)} />
                <Route path="/language-books" element={wrap("LanguageBooks", <LanguageBooks />)} />
                <Route path="/books/:bookId" element={wrap("BookReader", <BookReader />)} />
                <Route path="/news" element={wrap("News", <News />)} />
                <Route path="/sentence-lab" element={wrap("SentenceLab", <SentenceLab />)} />
                <Route
                  path="/sentence-lab/general"
                  element={wrap("SentenceGeneral", <SentenceGeneral />)}
                />
                <Route
                  path="/sentence-lab/domain/:domain"
                  element={wrap("SentenceDomain", <SentenceDomain />)}
                />
                <Route
                  path="/sentence-lab/path/:pathId"
                  element={wrap("SentencePathDetail", <SentencePathDetail />)}
                />
                <Route
                  path="/sentence-lab/path/:pathId/drill"
                  element={wrap("SentenceDrill", <SentenceDrill />)}
                />
                <Route
                  path="/sentence-lab/planner"
                  element={wrap("SentencePlanner", <SentencePlanner />)}
                />
                <Route
                  path="/sentence-lab/leitner"
                  element={wrap("SentenceLeitner", <SentenceLeitner />)}
                />
                <Route
                  path="/sentence-lab/admin"
                  element={wrap("SentenceAdmin", <SentenceAdmin />)}
                />
                <Route
                  path="/sentence-lab/:categorySlug"
                  element={wrap("SentenceCategory", <SentenceCategory />)}
                />
                <Route
                  path="/sentence-lab/:categorySlug/:subSlug"
                  element={wrap("SentencePath", <SentencePath />)}
                />
                <Route
                  path="/sentence-lab/:categorySlug/:subSlug/scenario"
                  element={wrap("SentenceScenario", <SentenceScenario />)}
                />
                <Route
                  path="/sentence-lab/:categorySlug/:subSlug/:level"
                  element={wrap("SentenceDrill", <SentenceDrill />)}
                />
                <Route
                  path="/news/article/:articleId"
                  element={wrap("NewsArticle", <NewsArticle />)}
                />
                <Route path="/news/digest/:digestId" element={wrap("NewsDigest", <NewsDigest />)} />
                <Route path="/share" element={wrap("Share", <SharePage />)} />
                <Route path="/settings" element={wrap("Settings", <Settings />)} />
                <Route path="*" element={wrap("NotFound", <NotFound />)} />
              </Routes>
            </BrowserRouter>
          </SettingsBootstrap>
        </FirebaseAuthProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
