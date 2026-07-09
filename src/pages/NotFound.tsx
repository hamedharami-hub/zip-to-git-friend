import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Home, ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    document.title = 'صفحه پیدا نشد — ۴۰۴';
    console.warn("[404]", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg rounded-3xl border border-border/60 bg-card/70 p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Compass className="h-8 w-8" />
        </div>
        <h1 className="mb-2 bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-6xl font-black tracking-tight text-transparent">
          404
        </h1>
        <p className="mb-2 text-lg font-semibold">صفحه پیدا نشد</p>
        <p className="mb-6 text-sm text-muted-foreground break-all">
          <code className="rounded bg-muted px-2 py-0.5 text-xs">{location.pathname}</code>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link to="/">
              <Home className="mr-2 h-4 w-4" />
              خانه
            </Link>
          </Button>
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            بازگشت
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
