import { useEffect, useRef } from "react";

export interface PlayerHotkeyHandlers {
  togglePlay?: () => void;
  seekBy?: (seconds: number) => void;
  changeVolume?: (delta: number) => void;
  toggleMute?: () => void;
  cycleSpeed?: () => void;
  toggleFullscreen?: () => void;
  togglePiP?: () => void;
}

const SEEK_SECONDS = 10;

/**
 * Global keyboard shortcuts for the media player.
 *
 * Only a single listener is attached to `window`, and the latest handler
 * object is stored in a ref so callers can pass a fresh object each render
 * without re-binding the listener.
 */
export function usePlayerHotkeys(handlers: PlayerHotkeyHandlers, enabled = true) {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs / textareas / contenteditable.
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          handlersRef.current.togglePlay?.();
          break;
        case "ArrowLeft":
          if (e.shiftKey) {
            e.preventDefault();
            handlersRef.current.seekBy?.(-SEEK_SECONDS);
          } else if (handlersRef.current.seekBy) {
            e.preventDefault();
            handlersRef.current.seekBy?.(-5);
          }
          break;
        case "ArrowRight":
          if (e.shiftKey) {
            e.preventDefault();
            handlersRef.current.seekBy?.(SEEK_SECONDS);
          } else if (handlersRef.current.seekBy) {
            e.preventDefault();
            handlersRef.current.seekBy?.(5);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          handlersRef.current.changeVolume?.(0.05);
          break;
        case "ArrowDown":
          e.preventDefault();
          handlersRef.current.changeVolume?.(-0.05);
          break;
        case "KeyM":
          e.preventDefault();
          handlersRef.current.toggleMute?.();
          break;
        case "KeyS":
          if (e.shiftKey) {
            e.preventDefault();
            handlersRef.current.cycleSpeed?.();
          }
          break;
        case "KeyF":
          e.preventDefault();
          handlersRef.current.toggleFullscreen?.();
          break;
        case "KeyP":
          e.preventDefault();
          handlersRef.current.togglePiP?.();
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
