import { ReactNode } from "react";
import { Sparkles } from "lucide-react";

interface Props {
  /** Lucide icon (or any node) shown in the hero. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Primary action (button) shown beneath. */
  action?: ReactNode;
  /** Secondary action (e.g., import). */
  secondaryAction?: ReactNode;
  /** Tone variant. Default 'media'. */
  tone?: "media" | "audio";
}

/**
 * Friendly empty state with a soft gradient and a small celebratory accent —
 * used on Home / Audio when the user has nothing in their library yet.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  tone = "media",
}: Props) {
  return (
    <div
      className={
        "relative overflow-hidden rounded-2xl border border-dashed border-border p-10 sm:p-14 text-center " +
        (tone === "audio"
          ? "bg-gradient-to-br from-primary/10 via-card to-card"
          : "bg-gradient-to-br from-primary/5 via-card to-card")
      }
    >
      {/* Decorative blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 -right-10 h-40 w-40 rounded-full bg-primary/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-sm space-y-4">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shadow-sm">
          {icon ?? <Sparkles className="h-7 w-7" aria-hidden="true" />}
        </div>
        <div className="space-y-1">
          <p className="text-lg font-semibold">{title}</p>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {(action || secondaryAction) && (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {action}
            {secondaryAction}
          </div>
        )}
      </div>
    </div>
  );
}
