import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Sync Learn Player" },
      { name: "application-name", content: "SyncLearn" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "SyncLearn" },
      { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#F7FBFB" },
      { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#0F1719" },
      { property: "og:title", content: "Sync Learn Player" },
      { name: "twitter:title", content: "Sync Learn Player" },
      { name: "description", content: "Project Replicate is a web application that replicates code from a zip file into a new project." },
      { property: "og:description", content: "Project Replicate is a web application that replicates code from a zip file into a new project." },
      { name: "twitter:description", content: "Project Replicate is a web application that replicates code from a zip file into a new project." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5443ecba-76c6-4e94-8366-3f3711fd18e2/id-preview-eabf2b0f--35e82add-0afb-4eb5-be53-15efd6682065.lovable.app-1779577332714.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5443ecba-76c6-4e94-8366-3f3711fd18e2/id-preview-eabf2b0f--35e82add-0afb-4eb5-be53-15efd6682065.lovable.app-1779577332714.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter+Tight:wght@400;500;600;700&family=Vazirmatn:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  // Mount the full source App (BrowserRouter + providers) only on the client.
  // SSR returns a minimal shell; client hydrates with the real app.
  const [App, setApp] = useState<ComponentType | null>(null);

  useEffect(() => {
    let mounted = true;
    import("../App").then((m) => {
      if (mounted) setApp(() => m.default);
    });
    import("../lib/pwa").then((m) => m.registerPWA()).catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  if (!App) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "hsl(40 22% 98%)",
          color: "hsl(220 10% 14%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Loading…
      </div>
    );
  }

  return <App />;
}
