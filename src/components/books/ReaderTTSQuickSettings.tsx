/**
 * Compact gear-icon popover shown at the top of reading pages
 * (NewsArticle, BookReader). Lets the user pick the TTS engine and
 * narration language without opening the full bottom player.
 *
 * The choices are stored in the same localStorage keys consumed by
 * `ChapterTTSPlayer` so the bottom player picks them up automatically.
 */
import { useEffect, useState } from 'react';
import { Settings2, Mic, Sparkles, Volume2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { isBrowserTtsSupported } from '@/lib/browserTts';

type Engine = 'browser' | 'gemini' | 'elevenlabs' | 'edgetts';
type Lang = 'en' | 'fa';

const ENGINE_KEY = 'llvp-tts-engine';
const TTS_LANG_KEY = 'llvp-tts-lang';

function readEngine(): Engine {
  try {
    const v = localStorage.getItem(ENGINE_KEY);
    if (v === 'gemini' || v === 'browser' || v === 'elevenlabs' || v === 'edgetts') return v;
  } catch { /* noop */ }
  return isBrowserTtsSupported() ? 'browser' : 'edgetts';
}

function readLang(): Lang {
  try { return localStorage.getItem(TTS_LANG_KEY) === 'fa' ? 'fa' : 'en'; }
  catch { return 'en'; }
}

interface Props {
  /** When false, the Persian option is disabled (e.g. no FA translation yet). */
  faAvailable?: boolean;
}

export function ReaderTTSQuickSettings({ faAvailable = true }: Props) {
  const [engine, setEngine] = useState<Engine>(readEngine);
  const [lang, setLang] = useState<Lang>(readLang);

  useEffect(() => {
    try { localStorage.setItem(ENGINE_KEY, engine); } catch { /* noop */ }
    window.dispatchEvent(new StorageEvent('storage', { key: ENGINE_KEY, newValue: engine }));
  }, [engine]);

  useEffect(() => {
    try { localStorage.setItem(TTS_LANG_KEY, lang); } catch { /* noop */ }
    window.dispatchEvent(new StorageEvent('storage', { key: TTS_LANG_KEY, newValue: lang }));
  }, [lang]);

  const browserSupported = isBrowserTtsSupported();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="تنظیمات پخش صوتی"
          title="تنظیمات پخش صوتی"
        >
          <Settings2 className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">موتور پخش</Label>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
            <EngineBtn
              active={engine === 'browser'}
              disabled={!browserSupported}
              onClick={() => setEngine('browser')}
              icon={<Mic className="h-3 w-3" />}
              label="آفلاین"
            />
            <EngineBtn
              active={engine === 'gemini'}
              onClick={() => setEngine('gemini')}
              icon={<Sparkles className="h-3 w-3" />}
              label="Gemini"
            />
            <EngineBtn
              active={engine === 'elevenlabs'}
              onClick={() => setEngine('elevenlabs')}
              icon={<Volume2 className="h-3 w-3" />}
              label="11Labs"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">زبان روایت</Label>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
            <EngineBtn
              active={lang === 'en'}
              onClick={() => setLang('en')}
              label="English"
            />
            <EngineBtn
              active={lang === 'fa'}
              disabled={!faAvailable}
              onClick={() => setLang('fa')}
              label="فارسی"
            />
          </div>
          {!faAvailable && (
            <p className="text-[10px] text-muted-foreground">
              برای فارسی ابتدا «ترجمه همه» را بزن.
            </p>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground leading-relaxed">
          این تنظیمات روی دکمه‌ی پخش این صفحه (و سایر صفحات) اعمال می‌شود.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function EngineBtn({
  active, disabled, onClick, icon, label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'px-2 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center justify-center gap-1',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
