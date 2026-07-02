/**
 * Fullscreen RSVP / Chunk player. Flashes one word (or N-word chunk) at a
 * time with an ORP highlight, at a user-controlled WPM. Space toggles
 * play/pause; ← / → skip 10 tokens; Esc closes.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Play, Pause, RotateCcw, SkipBack, SkipForward, X,
} from 'lucide-react';
import { useReadingMode } from '@/hooks/useReadingMode';
import {
  tokenizeWords, chunkTokens, orpIndex, pausePenaltyForToken,
} from '@/lib/readingText';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  text: string;
}

export function RsvpPlayer({ open, onOpenChange, text }: Props) {
  const { wpm, chunkSize, set } = useReadingMode();
  const tokens = useMemo(() => tokenizeWords(text), [text]);
  const chunks = useMemo(() => chunkTokens(tokens, chunkSize), [tokens, chunkSize]);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const accumRef = useRef<number>(0);

  useEffect(() => {
    if (!open) {
      setPlaying(false);
      setIdx(0);
    }
  }, [open]);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const baseMs = () => 60000 / Math.max(60, wpm) * chunkSize;
    const step = (t: number) => {
      if (!lastTickRef.current) lastTickRef.current = t;
      const dt = t - lastTickRef.current;
      lastTickRef.current = t;
      accumRef.current += dt;
      const cur = chunks[idx];
      const penalty = cur ? pausePenaltyForToken(cur[cur.length - 1]) : 1;
      const target = baseMs() * penalty;
      if (accumRef.current >= target) {
        accumRef.current = 0;
        setIdx((i) => {
          if (i >= chunks.length - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        });
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = 0;
      accumRef.current = 0;
    };
  }, [playing, wpm, chunkSize, chunks, idx]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === 'ArrowRight') setIdx((i) => Math.min(chunks.length - 1, i + 10));
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 10));
      else if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, chunks.length, onOpenChange]);

  const current = chunks[idx] ?? [];
  const isFa = /[\u0600-\u06FF]/.test(current.join(' '));
  const progress = chunks.length ? ((idx + 1) / chunks.length) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-full w-screen h-[100dvh] p-0 gap-0 bg-black text-white border-0 rounded-none flex flex-col"
        dir="ltr"
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="text-xs opacity-60 tabular-nums">
            {idx + 1} / {chunks.length}
          </span>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="text-white hover:bg-white/10">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div
          className="flex-1 flex items-center justify-center px-6 select-none"
          onClick={() => setPlaying((p) => !p)}
          dir={isFa ? 'rtl' : 'ltr'}
        >
          <div className="flex items-baseline justify-center gap-2 font-mono text-4xl sm:text-6xl">
            {current.length === 0 ? (
              <span className="opacity-40">آماده</span>
            ) : chunkSize === 1 ? (
              <RsvpWord token={current[0]} />
            ) : (
              <span className="text-3xl sm:text-5xl leading-tight text-center">
                {current.join(' ')}
              </span>
            )}
          </div>
        </div>

        <div className="h-1 bg-white/10">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>

        <div className="px-4 py-4 space-y-3 bg-black/80" dir="rtl">
          <div className="flex items-center justify-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setIdx(0)} className="text-white hover:bg-white/10">
              <RotateCcw className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIdx((i) => Math.max(0, i - 10))} className="text-white hover:bg-white/10">
              <SkipBack className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              onClick={() => setPlaying((p) => !p)}
              className="h-12 w-12 rounded-full"
            >
              {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIdx((i) => Math.min(chunks.length - 1, i + 10))} className="text-white hover:bg-white/10">
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs opacity-70">
              <span>سرعت</span>
              <span className="tabular-nums">{wpm} WPM</span>
            </div>
            <Slider
              min={120} max={800} step={20}
              value={[wpm]}
              onValueChange={([v]) => set({ wpm: v })}
            />
          </div>

          <div className="flex items-center justify-center gap-1 text-xs">
            <span className="opacity-70 me-2">تعداد کلمات هر فلش:</span>
            {([1, 3, 5] as const).map((n) => (
              <button
                key={n}
                onClick={() => set({ chunkSize: n })}
                className={
                  'px-3 py-1 rounded-md ' +
                  (chunkSize === n ? 'bg-primary text-primary-foreground' : 'bg-white/10 hover:bg-white/20')
                }
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RsvpWord({ token }: { token: string }) {
  const orp = orpIndex(token);
  const left = token.slice(0, orp);
  const mid = token.slice(orp, orp + 1);
  const right = token.slice(orp + 1);
  return (
    <span className="inline-flex items-baseline">
      <span className="opacity-90">{left}</span>
      <span className="text-red-400 font-bold">{mid}</span>
      <span className="opacity-90">{right}</span>
    </span>
  );
}
