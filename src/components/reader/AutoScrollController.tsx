/**
 * Auto-scroll controller + centered ruler. The ruler is portalled to
 * document.body so ancestor transforms don't break `position: fixed`.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useReadingMode } from "@/hooks/useReadingMode";

function findScrollParent(el: HTMLElement | null): HTMLElement | Window {
  let node: HTMLElement | null = el;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return window;
}

interface Props {
  containerSelector: string;
}

export function AutoScrollController({ containerSelector }: Props) {
  const { autoScrollEnabled, autoScrollWpm, rulerEnabled } = useReadingMode();

  useEffect(() => {
    if (!autoScrollEnabled) return;
    const el = document.querySelector<HTMLElement>(containerSelector);
    if (!el) return;
    const parent = findScrollParent(el);
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 26;
    const pxPerSec = (autoScrollWpm / 60) * (lh / 10);

    let raf = 0;
    let last = performance.now();
    let paused = false;

    const step = (t: number) => {
      const dt = t - last;
      last = t;
      if (!paused) {
        const delta = pxPerSec * (dt / 1000);
        if (parent === window) window.scrollBy({ top: delta, behavior: "auto" });
        else (parent as HTMLElement).scrollTop += delta;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const toggle = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest("button,a,input,select,textarea")) return;
      paused = !paused;
    };
    el.addEventListener("click", toggle);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("click", toggle);
    };
  }, [autoScrollEnabled, autoScrollWpm, containerSelector]);

  if (!rulerEnabled || typeof document === "undefined") return null;
  return createPortal(
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        top: "50vh",
        transform: "translateY(-50%)",
        pointerEvents: "none",
        zIndex: 40,
      }}
    >
      <div
        style={{
          margin: "0 auto",
          maxWidth: "56rem",
          height: "3px",
          background: "hsl(var(--primary) / 0.45)",
          borderRadius: "999px",
          boxShadow: "0 0 12px hsl(var(--primary) / 0.6)",
        }}
      />
    </div>,
    document.body,
  );
}
