/**
 * Floating toolbar that follows the user's text selection inside the reader.
 *
 * Implementation notes:
 *  - Listens to `selectionchange` on `document` and only fires while the
 *    selection is inside the supplied container ref.
 *  - Position is anchored above the selection rect, clamped to the viewport.
 *  - All actions receive the trimmed selected text.
 *  - `selectionchange` fires very often, so we render inside a portal-less
 *    fixed div and update its style imperatively to avoid React thrash.
 */
import { useEffect, useRef, useState } from "react";
import { Highlighter, StickyNote, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HIGHLIGHT_SWATCHES, type HighlightColor } from "@/hooks/useBookAnnotations";

interface Props {
  /** The scrollable container we live inside (used to detect inside-selection). */
  containerRef: React.RefObject<HTMLElement>;
  onHighlight: (text: string, color: HighlightColor) => void;
  onAddNote: (text: string) => void;
}

const COLORS: HighlightColor[] = ["yellow", "green", "pink"];

export function ReaderSelectionToolbar({ containerRef, onHighlight, onAddNote }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [text, setText] = useState("");
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onSelect = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPos(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const root = containerRef.current;
      if (!root || !node) return setPos(null);
      // Ignore clicks inside our own toolbar (would clear selection on click).
      if (toolbarRef.current && toolbarRef.current.contains(node as Node)) return;
      if (!root.contains(node.nodeType === 1 ? (node as Element) : node.parentElement)) {
        setPos(null);
        return;
      }
      const txt = sel.toString().replace(/\s+/g, " ").trim();
      if (txt.length < 2 || txt.length > 600) {
        setPos(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setPos(null);
        return;
      }
      const vw = window.innerWidth;
      const top = Math.max(8, rect.top - 52); // 52px above
      const left = Math.max(8, Math.min(vw - 280, rect.left + rect.width / 2 - 140));
      setPos({ top, left });
      setText(txt);
    };
    document.addEventListener("selectionchange", onSelect);
    return () => document.removeEventListener("selectionchange", onSelect);
  }, [containerRef]);

  const dismiss = () => {
    window.getSelection()?.removeAllRanges();
    setPos(null);
  };

  if (!pos) return null;

  return (
    <div
      ref={toolbarRef}
      className={cn(
        "fixed z-50 flex items-center gap-1 rounded-full border border-border",
        "bg-popover shadow-lg px-1.5 py-1 backdrop-blur-md animate-in fade-in zoom-in-95",
      )}
      style={{ top: pos.top, left: pos.left }}
      role="toolbar"
      aria-label="Selection actions"
      // Prevent the toolbar's own mousedown from clearing the user's selection.
      onMouseDown={(e) => e.preventDefault()}
    >
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => {
            onHighlight(text, c);
            dismiss();
          }}
          className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center transition hover:scale-110",
            HIGHLIGHT_SWATCHES[c],
          )}
          aria-label={`Highlight in ${c}`}
          title={`Highlight in ${c}`}
        >
          <Highlighter className="h-3.5 w-3.5 text-white drop-shadow" />
        </button>
      ))}

      <span className="w-px h-5 bg-border mx-0.5" />

      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        onClick={() => {
          onAddNote(text);
          dismiss();
        }}
      >
        <StickyNote className="h-3.5 w-3.5 mr-1" />
        Note
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => {
          void navigator.clipboard.writeText(text).catch(() => undefined);
          dismiss();
        }}
        aria-label="Copy"
        title="Copy"
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
