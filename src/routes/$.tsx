import { createFileRoute } from "@tanstack/react-router";

// Catch-all so every path matches and TanStack does not 404.
// react-router-dom (inside <App />) handles the actual rendering.
export const Route = createFileRoute("/$")({
  component: () => null,
});
