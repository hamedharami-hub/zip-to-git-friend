import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ShellWidth = "wide" | "default" | "narrow";

export const SHELL_WIDTH: Record<ShellWidth, string> = {
  wide: "max-w-[1400px]",
  default: "max-w-5xl",
  narrow: "max-w-3xl",
};

export type AppHeaderTone = "primary" | "secondary" | "tertiary";

export interface AppHeaderProps {
  /** English title (or a brand/dynamic node). */
  title: ReactNode;
  /** Persian subtitle, rendered under the title. */
  subtitle?: ReactNode;
  icon?: LucideIcon;
  tone?: AppHeaderTone; // default "primary"
  /** Route for the back button; omit both backTo and onBack for no back button. */
  backTo?: string;
  /** Takes precedence over backTo. */
  onBack?: () => void;
  /** Right-aligned action slot. */
  actions?: ReactNode;
  width?: ShellWidth; // default "wide"
  /** Adds the .scrolled glass state. */
  scrolled?: boolean;
  /** Extra row rendered below the title row, inside the header. */
  below?: ReactNode;
  className?: string;
}

const TONE: Record<AppHeaderTone, string> = {
  primary: "bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]",
  secondary: "bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]",
  tertiary: "bg-[hsl(var(--tertiary-container))] text-[hsl(var(--on-tertiary-container))]",
};

export function AppHeader({
  title,
  subtitle,
  icon: Icon,
  tone = "primary",
  backTo,
  onBack,
  actions,
  width = "wide",
  scrolled = false,
  below,
  className,
}: AppHeaderProps) {
  const backButton = (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full shrink-0 -ms-1"
      aria-label="Back"
      onClick={onBack}
    >
      <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
    </Button>
  );

  return (
    <header className={cn("m3-top-app-bar sticky top-0 z-30", scrolled && "scrolled", className)}>
      <div
        className={cn(
          SHELL_WIDTH[width],
          "mx-auto w-full px-3 sm:px-6 h-14 flex items-center gap-2",
        )}
      >
        {onBack ? onBack && backButton : backTo ? <Link to={backTo}>{backButton}</Link> : null}
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <span className={cn("h-9 w-9 rounded-2xl flex items-center justify-center shrink-0", TONE[tone])}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold leading-tight truncate">{title}</h1>
            {subtitle && (
              <p className="text-[11px] leading-tight text-muted-foreground truncate" dir="rtl">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="ms-auto flex items-center gap-1 shrink-0">{actions}</div>}
      </div>
      {below}
    </header>
  );
}
