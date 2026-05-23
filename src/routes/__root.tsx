import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Sync Learn Player" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
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
