import { useEffect } from "react";
import { haptic } from "@/lib/haptic";

/**
 * Global haptic feedback listener.
 *
 * Mount this once inside the app shell. It fires a short "tap" haptic on
 * pointer-down for interactive controls (buttons, links, toggles, selects, etc.)
 * without requiring every component to import `useHaptic`.
 *
 * Add `data-haptic="false"` to a parent to disable haptics for its children, or
 * `data-haptic` on any element to enable haptics for it.
 */
export function Haptic() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SELECTOR = [
      'button:not([disabled]):not([data-haptic="false"])',
      'a[href]:not([data-haptic="false"])',
      '[role="button"]:not([disabled]):not([data-haptic="false"])',
      'input[type="button"]:not([disabled])',
      'input[type="submit"]:not([disabled])',
      'input[type="reset"]:not([disabled])',
      'input[type="checkbox"]:not([disabled])',
      'input[type="radio"]:not([disabled])',
      "select:not([disabled])",
      'summary:not([data-haptic="false"])',
      '[data-haptic]:not([data-haptic="false"])',
    ].join(",");

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-haptic="false"]')) return;
      if (target.closest(SELECTOR)) {
        haptic("tap");
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-haptic="false"]')) return;
      const tag = target.tagName;
      const role = target.getAttribute("role");
      if (
        target.closest(SELECTOR) ||
        tag === "BUTTON" ||
        tag === "A" ||
        tag === "SUMMARY" ||
        role === "button" ||
        role === "link" ||
        target.hasAttribute("data-haptic")
      ) {
        haptic("tap");
      }
    };

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return null;
}
