/**
 * Eye-comfort layer. Applies a preset by setting a CSS filter on <body>
 * (more reliable than <html> filter, which can be overridden by other
 * page-level styles), plus a global overlay for blue-light warmth.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useReadingMode } from "@/hooks/useReadingMode";

const CLASSES = ["rm-comfort", "rm-sepia", "rm-night", "rm-contrast"] as const;

export function EyeComfortLayer() {
  const { eyeComfortPreset, blueLightFilter, extraLineHeight } = useReadingMode();

  useEffect(() => {
    const html = document.documentElement;
    CLASSES.forEach((c) => html.classList.remove(c));
    if (eyeComfortPreset !== "off")
      html.classList.add(`rm-${eyeComfortPreset}` as (typeof CLASSES)[number]);
    html.style.setProperty("--rm-extra-line-height", String(extraLineHeight));
    return () => {
      CLASSES.forEach((c) => html.classList.remove(c));
    };
  }, [eyeComfortPreset, extraLineHeight]);

  if (typeof document === "undefined") return null;
  if (blueLightFilter <= 0) return null;

  // Simple warm tint overlay — reliable across browsers (no mix-blend which
  // can be broken by fixed-position stacking contexts).
  return createPortal(
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        background: "#ff9a3c",
        opacity: Math.min(0.4, blueLightFilter),
        zIndex: 2147483000,
      }}
    />,
    document.body,
  );
}
