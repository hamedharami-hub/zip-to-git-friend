import { useCallback, useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogDescription, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LightboxImage } from "@/lib/extractArticleImages";

interface Props {
  images: LightboxImage[];
  open: boolean;
  startIndex: number;
  onOpenChange: (open: boolean) => void;
}

export function ImageLightbox({ images, open, startIndex, onOpenChange }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (open) {
      setIndex(startIndex);
      setScale(1);
    }
  }, [open, startIndex]);

  const current = images[index];
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  const goPrev = useCallback(() => {
    setIndex((i) => {
      const next = Math.max(0, i - 1);
      setScale(1);
      return next;
    });
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => {
      const next = Math.min(images.length - 1, i + 1);
      setScale(1);
      return next;
    });
  }, [images.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        onOpenChange(false);
      } else if (e.key === "ArrowLeft") {
        goPrev();
      } else if (e.key === "ArrowRight") {
        goNext();
      } else if (e.key === "+" || e.key === "=") {
        setScale((s) => Math.min(3, s + 0.5));
      } else if (e.key === "-" || e.key === "_") {
        setScale((s) => Math.max(1, s - 0.5));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, goPrev, goNext, onOpenChange]);

  const zoomIn = () => setScale((s) => Math.min(3, s + 0.5));
  const zoomOut = () => setScale((s) => Math.max(1, s - 0.5));
  const toggleZoom = () => setScale((s) => (s >= 2.5 ? 1 : Math.round((s + 0.5) * 10) / 10));

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogOverlay className="bg-black/95" onClick={() => onOpenChange(false)} />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "max-w-[95vw] max-h-[95vh] w-full h-full",
            "flex flex-col items-center justify-center",
            "bg-transparent border-0 shadow-none outline-none overflow-visible",
          )}
          onClick={() => onOpenChange(false)}
        >
          <DialogTitle className="sr-only">Image viewer</DialogTitle>
          <DialogDescription className="sr-only">
            View article images in full screen and zoom.
          </DialogDescription>

          <div
            className="absolute top-3 left-3 right-3 flex items-center justify-between text-white/80 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-xs tabular-nums">
              {index + 1} / {images.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/10"
                onClick={(e) => {
                  e.stopPropagation();
                  zoomOut();
                }}
                aria-label="Zoom out"
                title="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/10"
                onClick={(e) => {
                  e.stopPropagation();
                  zoomIn();
                }}
                aria-label="Zoom in"
                title="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenChange(false);
                }}
                aria-label="Close"
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {hasPrev && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 h-9 w-9 text-white hover:bg-white/10"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              aria-label="Previous image"
              title="Previous"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}

          <img
            src={current.src}
            alt={current.alt ?? ""}
            loading="eager"
            className={cn(
              "max-h-[85vh] max-w-[90vw] object-contain transition-transform duration-200",
              scale > 1 && "cursor-zoom-out",
            )}
            style={{ transform: `scale(${scale})` }}
            onClick={(e) => {
              e.stopPropagation();
              toggleZoom();
            }}
          />

          {hasNext && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 h-9 w-9 text-white hover:bg-white/10"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              aria-label="Next image"
              title="Next"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          )}

          {current.caption && (
            <p
              className="text-white/70 text-sm text-center px-6 py-3 max-w-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              {current.caption}
            </p>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
