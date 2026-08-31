import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SHELL_WIDTH, type ShellWidth } from "./AppHeader";

export interface PageShellProps {
  header?: ReactNode;
  width?: ShellWidth;
  surface?: "background" | "surface";
  children: ReactNode;
  mainClassName?: string;
  className?: string;
}

export function PageShell({
  header,
  width = "wide",
  surface = "background",
  children,
  mainClassName,
  className,
}: PageShellProps) {
  return (
    <div
      className={cn(
        "min-h-[100dvh] flex flex-col text-foreground",
        surface === "surface" ? "bg-[hsl(var(--surface))]" : "bg-background",
        className,
      )}
    >
      {header}
      <main
        className={cn(
          SHELL_WIDTH[width],
          "flex-1 w-full mx-auto px-4 sm:px-6 py-6 sm:py-8",
          mainClassName,
        )}
      >
        {children}
      </main>
    </div>
  );
}

export { SHELL_WIDTH };
export type { ShellWidth };
