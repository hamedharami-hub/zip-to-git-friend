/**
 * Action menu opened by long-pressing a paragraph card.
 * Provides: read this · read from here · stop · copy · star · translate.
 *
 * Rendered as a small floating popover anchored to the paragraph. It uses
 * `paragraphSpeechRequestBus` to delegate playback to `ChapterTTSPlayer`
 * (which owns engine selection + caching). For instant "read this only" with
 * no setup, we ALSO fire `window.speechSynthesis` so the user hears something
 * even if the chapter player isn't open yet.
 */
import { useEffect } from 'react';
import { Volume2, PlayCircle, StopCircle, Copy, Star, Languages, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { emitParagraphSpeechRequest } from '@/lib/paragraphSpeechRequestBus';

interface Props {
  open: boolean;
  onClose: () => void;
  text: string;
  faText?: string;
  bookId: string;
  chapterIndex: number;
  starred: boolean;
  onToggleStar: () => void;
  onTranslate: () => void;
}

function speakOnce(text: string, lang: 'en' | 'fa'): void {
  try {
    if (!('speechSynthesis' in window)) {
      toast.error('مرورگر شما TTS داخلی ندارد.');
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'fa' ? 'fa-IR' : 'en-US';
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((v) => v.lang.toLowerCase().startsWith(u.lang.slice(0, 2)));
    if (match) u.voice = match;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

export function ParagraphActionsMenu({
  open, onClose, text, faText, bookId, chapterIndex,
  starred, onToggleStar, onTranslate,
}: Props) {
  // Close on outside tap.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('[data-para-menu]')) return;
      onClose();
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('touchstart', handler, { passive: true });
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, [open, onClose]);

  if (!open) return null;

  const playOne = (lang: 'en' | 'fa') => {
    const payload = lang === 'fa' && faText ? faText : text;
    // Instant playback for "just this paragraph".
    speakOnce(payload, lang);
    emitParagraphSpeechRequest(bookId, chapterIndex, { action: 'play-one', text: payload, lang });
    onClose();
  };
  const playFrom = (lang: 'en' | 'fa') => {
    emitParagraphSpeechRequest(bookId, chapterIndex, { action: 'play-from', text, lang });
    onClose();
  };
  const stop = () => {
    try { window.speechSynthesis.cancel(); } catch { /* */ }
    emitParagraphSpeechRequest(bookId, chapterIndex, { action: 'stop', text: '' });
    onClose();
  };
  const copy = async () => {
    try {
      const out = faText ? `${text}\n\n${faText}` : text;
      await navigator.clipboard.writeText(out);
      toast.success('متن کپی شد');
    } catch { toast.error('کپی نشد'); }
    onClose();
  };

  return (
    <div
      data-para-menu
      className="absolute z-30 top-2 left-1/2 -translate-x-1/2 rounded-xl border border-border bg-popover/95 backdrop-blur shadow-xl p-2 flex flex-wrap gap-1 max-w-[min(90vw,380px)]"
      role="menu"
    >
      <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 text-[11px]" onClick={() => playOne('en')}>
        <Volume2 className="h-3.5 w-3.5" /> این پاراگراف (EN)
      </Button>
      {faText && (
        <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 text-[11px]" onClick={() => playOne('fa')}>
          <Volume2 className="h-3.5 w-3.5" /> این پاراگراف (FA)
        </Button>
      )}
      <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 text-[11px]" onClick={() => playFrom('en')}>
        <PlayCircle className="h-3.5 w-3.5" /> از اینجا تا توقف (EN)
      </Button>
      {faText && (
        <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 text-[11px]" onClick={() => playFrom('fa')}>
          <PlayCircle className="h-3.5 w-3.5" /> از اینجا تا توقف (FA)
        </Button>
      )}
      <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 text-[11px] text-destructive" onClick={stop}>
        <StopCircle className="h-3.5 w-3.5" /> توقف
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 text-[11px]" onClick={copy}>
        <Copy className="h-3.5 w-3.5" /> کپی
      </Button>
      <Button
        type="button" size="sm" variant="ghost"
        className={'h-8 gap-1.5 text-[11px] ' + (starred ? 'text-amber-500' : '')}
        onClick={() => { onToggleStar(); onClose(); }}
      >
        <Star className={'h-3.5 w-3.5 ' + (starred ? 'fill-amber-400' : '')} /> {starred ? 'برداشتن ستاره' : 'ستاره'}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 text-[11px]" onClick={() => { onTranslate(); onClose(); }}>
        <Languages className="h-3.5 w-3.5" /> ترجمه/پردازش
      </Button>
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 ml-auto" onClick={onClose} aria-label="بستن">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
