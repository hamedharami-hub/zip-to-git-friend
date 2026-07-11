import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface BidiTextProps {
  children: ReactNode;
  className?: string;
  as?: "p" | "span" | "div";
  align?: "start" | "inherit";
}

/**
 * Renders mixed-direction text so that LTR and RTL runs each get the correct
 * base direction. Use this for user-facing messages that may contain English
 * and Persian/Arabic words together.
 */
export function BidiText({ children, className, as: Tag = "p", align = "start" }: BidiTextProps) {
  return (
    <Tag
      dir="auto"
      style={{ unicodeBidi: "plaintext", textAlign: align }}
      className={cn(className)}
    >
      {children}
    </Tag>
  );
}
