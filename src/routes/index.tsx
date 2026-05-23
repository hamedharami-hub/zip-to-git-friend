import { createFileRoute } from "@tanstack/react-router";

// Routing is handled by react-router-dom inside <App /> (rendered by __root).
// This route just matches "/" so TanStack does not 404.
export const Route = createFileRoute("/")({
  component: () => null,
});
