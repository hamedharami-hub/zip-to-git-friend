import { memo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportUrlDialog } from "./ImportUrlDialog";
import { AddSourceDialog } from "./AddSourceDialog";
import { InstallButton } from "../pwa/InstallButton";
import { AccountButton } from "../auth/AccountButton";
import type { User } from "@supabase/supabase-js";
import type { NewsSource } from "@/lib/news";

interface Props {
  user: User | null;
  sharedUrl: string | null;
  /** Clear the ?import_url query param after the import dialog closes. */
  onClearSharedUrl: () => void;
  /** Called when a channel source is added via the import dialog. */
  onChannelAdded: (s: NewsSource) => void;
  addSourceOpen: boolean;
  onAddSourceOpenChange: (open: boolean) => void;
  /** Called when a source is added via the add-source dialog. */
  onSourceAdded: (s: NewsSource) => void;
  /** Quick-summary callback used by the add-source dialog for public topics. */
  onInstantDigest: (topicText: string, feedUrl: string, label: string) => void;
}

export const NewsHeader = memo(function NewsHeader({
  user,
  sharedUrl,
  onClearSharedUrl,
  onChannelAdded,
  addSourceOpen,
  onAddSourceOpenChange,
  onSourceAdded,
  onInstantDigest,
}: Props) {
  return (
    <header className="m3-top-app-bar sticky top-0 z-30 border-b border-outline-variant/40">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 h-16 flex items-center gap-2">
        <Link to="/">
          <Button variant="ghost" size="icon" aria-label="Back to home" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-[15px] font-semibold flex items-center gap-2 min-w-0">
          <span className="h-9 w-9 rounded-2xl bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))] flex items-center justify-center shrink-0">
            <Newspaper className="h-4 w-4" />
          </span>
          <span className="truncate">News</span>
        </h1>
        <div className="ms-auto flex items-center gap-2">
          {user && (
            <>
              <ImportUrlDialog
                initialUrl={sharedUrl ?? undefined}
                autoOpen={!!sharedUrl}
                onClose={onClearSharedUrl}
                onChannelAdded={onChannelAdded}
              />
              <AddSourceDialog
                open={addSourceOpen}
                onOpenChange={onAddSourceOpenChange}
                onAdded={onSourceAdded}
                onInstantDigest={onInstantDigest}
              />
            </>
          )}
          <InstallButton />
          <AccountButton />
        </div>
      </div>
    </header>
  );
});
