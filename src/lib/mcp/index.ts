import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listBooksTool from "./tools/list-books";
import listNewsTool from "./tools/list-news";
import whoamiTool from "./tools/whoami";

// OAuth issuer must be the direct Supabase host (not the .lovable.cloud proxy).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "sync-learn-mcp",
  title: "Sync Learn Player",
  version: "0.1.0",
  instructions:
    "Tools for the Sync Learn Player language-learning app. Use `whoami` to verify the connection, `list_books` to browse the user's imported books, and `list_recent_news` for their recent news articles.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listBooksTool, listNewsTool],
});
