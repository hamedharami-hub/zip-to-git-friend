import { memo } from "react";
import { Newspaper } from "lucide-react";
import { ImportUrlDialog } from "./ImportUrlDialog";
import { AddSourceDialog } from "./AddSourceDialog";
import { InstallButton } from "../pwa/InstallButton";
import { AccountButton } from "../auth/AccountButton";
import type { User } from "@supabase/supabase-js";
import type { NewsSource } from "@/lib/news";
import { AppHeader } from "@/components/layout/AppHeader";

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
    <AppHeader
      icon={Newspaper}
      accent="news"
      title="News"
      subtitle="اخبار"
      backTo="/"
      actions={
        <>
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
        </>
      }
    />
  );
});
