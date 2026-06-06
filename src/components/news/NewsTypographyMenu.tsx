/**
 * Reader-style font controls for the News article page.
 *
 * Persists choice in localStorage and exposes the chosen Tailwind class names
 * via a callback so the parent can pass them to InteractiveBookText.
 */
import { useEffect, useState } from 'react';
import { Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const SIZE_KEY = 'news-font-size';
const FAMILY_KEY = 'news-font-family';

export type NewsFontSize = 'sm' | 'base' | 'lg' | 'xl' | '2xl';
export type NewsFontFamily = 'sans' | 'serif' | 'vazir' | 'mono';

const SIZE_CLASS: Record<NewsFontSize, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
};

const FAMILY_CLASS: Record<NewsFontFamily, string> = {
  sans: 'font-sans',
  serif: 'font-serif',
  vazir: '', // applied via inline style below
  mono: 'font-mono',
};

const FAMILY_STYLE: Partial<Record<NewsFontFamily, React.CSSProperties>> = {
  vazir: { fontFamily: '"Vazirmatn","IRANSans","Tahoma",sans-serif' },
};

interface Props {
  onChange: (cls: { sizeClass: string; familyClass: string; familyStyle?: React.CSSProperties }) => void;
}

export function NewsTypographyMenu({ onChange }: Props) {
  const [size, setSize] = useState<NewsFontSize>(() => {
    try { return (localStorage.getItem(SIZE_KEY) as NewsFontSize) || 'base'; }
    catch { return 'base'; }
  });
  const [family, setFamily] = useState<NewsFontFamily>(() => {
    try { return (localStorage.getItem(FAMILY_KEY) as NewsFontFamily) || 'sans'; }
    catch { return 'sans'; }
  });

  useEffect(() => {
    try { localStorage.setItem(SIZE_KEY, size); } catch { /* */ }
    try { localStorage.setItem(FAMILY_KEY, family); } catch { /* */ }
    onChange({
      sizeClass: SIZE_CLASS[size],
      familyClass: FAMILY_CLASS[family],
      familyStyle: FAMILY_STYLE[family],
    });
  }, [size, family, onChange]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="فونت و اندازه" title="فونت و اندازه">
          <Type className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-4">
        <div>
          <p className="text-xs font-medium mb-2 text-muted-foreground">اندازه فونت</p>
          <div className="grid grid-cols-5 gap-1">
            {(['sm', 'base', 'lg', 'xl', '2xl'] as NewsFontSize[]).map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={
                  'rounded-md border py-1.5 text-xs transition-colors ' +
                  (size === s
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground')
                }
              >
                A{s === 'sm' ? '' : s === 'base' ? '' : ''}
                <span className="text-[10px] ms-0.5 opacity-70">
                  {s === 'sm' ? 'sm' : s === 'base' ? 'md' : s}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium mb-2 text-muted-foreground">نوع فونت</p>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { id: 'sans' as const, label: 'Sans (پیش‌فرض)' },
              { id: 'serif' as const, label: 'Serif' },
              { id: 'vazir' as const, label: 'Vazir (فارسی)' },
              { id: 'mono' as const, label: 'Mono' },
            ]).map((f) => (
              <button
                key={f.id}
                onClick={() => setFamily(f.id)}
                className={
                  'rounded-md border px-2 py-1.5 text-xs transition-colors text-start ' +
                  (family === f.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground')
                }
                style={f.id === 'vazir' ? { fontFamily: '"Vazirmatn","IRANSans","Tahoma",sans-serif' } : undefined}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
