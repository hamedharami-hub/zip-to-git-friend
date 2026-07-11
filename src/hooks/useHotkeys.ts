import { useEffect } from "react";

interface PlayerHotkeyHandlers {
  togglePlay: () => void;
  seekBy: (deltaSec: number) => void;
  changeVolume: (delta: number) => void;
}

export function usePlayerHotkeys(handlers: PlayerHotkeyHandlers, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      switch (e.key) {
        case " ":
          e.preventDefault();
          handlers.togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handlers.seekBy(-10);
          break;
        case "ArrowRight":
          e.preventDefault();
          handlers.seekBy(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          handlers.changeVolume(0.05);
          break;
        case "ArrowDown":
          e.preventDefault();
          handlers.changeVolume(-0.05);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers, enabled]);
}
