/**
 * Bottom-sheet control panel for all Reading Mode features. Four tabs:
 * Flash (RSVP/Chunk), Bionic, Focus (auto-scroll+ruler+focus), Comfort.
 */
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Zap, Bold, Focus as FocusIcon, Palette, Play } from 'lucide-react';
import { useReadingMode, type EyeComfortPreset } from '@/hooks/useReadingMode';
import { RsvpPlayer } from './RsvpPlayer';
import { cn } from '@/lib/utils';

interface Props {
  getText: () => string;
}

export function ReadingModeSheet({ getText }: Props) {
  const st = useReadingMode();
  const [rsvpOpen, setRsvpOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="حالت مطالعه" title="حالت مطالعه سریع">
            <Zap className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-right">حالت مطالعه</SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="flash" className="mt-4">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="flash"><Zap className="h-4 w-4 me-1" />فلش</TabsTrigger>
              <TabsTrigger value="bionic"><Bold className="h-4 w-4 me-1" />بایونیک</TabsTrigger>
              <TabsTrigger value="focus"><FocusIcon className="h-4 w-4 me-1" />تمرکز</TabsTrigger>
              <TabsTrigger value="comfort"><Palette className="h-4 w-4 me-1" />چشم</TabsTrigger>
            </TabsList>

            {/* FLASH — RSVP */}
            <TabsContent value="flash" className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                خواندن با فلش کلمات (RSVP): چشمت ثابت وسط صفحه می‌مانَد و
                کلمات با سرعت انتخابی جلوی چشمت رد می‌شوند. سریع‌تر از خواندن عادی، بدون خستگی چشم.
              </p>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>سرعت</span>
                  <span className="tabular-nums text-muted-foreground">{st.wpm} کلمه/دقیقه</span>
                </div>
                <Slider min={120} max={800} step={20} value={[st.wpm]}
                  onValueChange={([v]) => st.set({ wpm: v })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">تعداد کلمات هر فلش</Label>
                <div className="flex gap-1">
                  {([1, 3, 5] as const).map((n) => (
                    <button key={n} onClick={() => st.set({ chunkSize: n })}
                      className={cn('flex-1 py-2 rounded-md text-sm border',
                        st.chunkSize === n ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/40 border-border')}>
                      {n === 1 ? 'یک کلمه' : `${n} کلمه‌ای`}
                    </button>
                  ))}
                </div>
              </div>
              <Button className="w-full" size="lg" onClick={() => { setSheetOpen(false); setRsvpOpen(true); }}>
                <Play className="h-4 w-4 me-2" /> شروع خواندن با فلش
              </Button>
            </TabsContent>

            {/* BIONIC */}
            <TabsContent value="bionic" className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                ابتدای هر کلمه پررنگ می‌شود تا مغزت سریع‌تر آن را بشناسد. خواندن عادی سریع‌تر می‌شود.
              </p>
              <div className="flex items-center justify-between">
                <Label>فعال</Label>
                <Switch checked={st.bionicEnabled} onCheckedChange={(v) => st.set({ bionicEnabled: v })} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>شدت بولد</span>
                  <span className="tabular-nums text-muted-foreground">{Math.round(st.bionicIntensity * 100)}٪</span>
                </div>
                <Slider min={0.3} max={0.7} step={0.05} value={[st.bionicIntensity]}
                  onValueChange={([v]) => st.set({ bionicIntensity: v })} />
              </div>
              <div className="rounded-md border border-border p-3 text-sm leading-loose">
                <span className="rm-bionic-word"><b className="rm-bionic">نمو</b>نه</span>{' '}
                <span className="rm-bionic-word"><b className="rm-bionic">خوا</b>ندن</span>{' '}
                <span className="rm-bionic-word"><b className="rm-bionic">با</b></span>{' '}
                <span className="rm-bionic-word"><b className="rm-bionic">حال</b>ت</span>{' '}
                <span className="rm-bionic-word"><b className="rm-bionic">بایو</b>نیک</span>.
              </div>
            </TabsContent>

            {/* FOCUS: auto-scroll, ruler, blur, highlight */}
            <TabsContent value="focus" className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                کمک به تمرکز چشم روی خط یا پاراگراف فعلی و اسکرول خودکار متن.
              </p>

              <div className="rounded-md border border-border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label>اسکرول خودکار</Label>
                  <Switch checked={st.autoScrollEnabled} onCheckedChange={(v) => st.set({ autoScrollEnabled: v })} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>سرعت اسکرول</span>
                    <span className="tabular-nums text-muted-foreground">{st.autoScrollWpm} WPM</span>
                  </div>
                  <Slider min={100} max={600} step={20} value={[st.autoScrollWpm]}
                    onValueChange={([v]) => st.set({ autoScrollWpm: v })} disabled={!st.autoScrollEnabled} />
                </div>
                <p className="text-[10px] text-muted-foreground">لمس متن = مکث/ادامه.</p>
              </div>

              <div className="flex items-center justify-between">
                <Label>خط راهنما وسط صفحه</Label>
                <Switch checked={st.rulerEnabled} onCheckedChange={(v) => st.set({ rulerEnabled: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>پاراگراف فعال روشن، بقیه کم‌رنگ</Label>
                <Switch checked={st.focusHighlightEnabled} onCheckedChange={(v) => st.set({ focusHighlightEnabled: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>بلور روی پاراگراف‌های غیرفعال</Label>
                <Switch checked={st.focusBlurEnabled} onCheckedChange={(v) => st.set({ focusBlurEnabled: v })} />
              </div>
            </TabsContent>

            {/* COMFORT */}
            <TabsContent value="comfort" className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                تنظیمات چشم‌نواز برای کاهش خستگی در طولانی‌مدت.
              </p>

              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'off', label: 'بدون تغییر' },
                    { id: 'comfort', label: '☀ راحت (روز)' },
                    { id: 'sepia', label: '📜 سپیا' },
                    { id: 'night', label: '🌙 شب' },
                    { id: 'contrast', label: '⬛ کنتراست' },
                  ] as { id: EyeComfortPreset; label: string }[]
                ).map((p) => (
                  <button key={p.id} onClick={() => st.set({ eyeComfortPreset: p.id })}
                    className={cn('py-2 px-3 rounded-md border text-sm',
                      st.eyeComfortPreset === p.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/40 border-border')}>
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>فیلتر نور آبی</span>
                  <span className="tabular-nums text-muted-foreground">{Math.round(st.blueLightFilter * 100)}٪</span>
                </div>
                <Slider min={0} max={0.4} step={0.05} value={[st.blueLightFilter]}
                  onValueChange={([v]) => st.set({ blueLightFilter: v })} />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>فاصله خطوط اضافه</span>
                  <span className="tabular-nums text-muted-foreground">+{st.extraLineHeight.toFixed(2)}</span>
                </div>
                <Slider min={0} max={0.6} step={0.05} value={[st.extraLineHeight]}
                  onValueChange={([v]) => st.set({ extraLineHeight: v })} />
              </div>

              <Button variant="outline" className="w-full" onClick={() => st.reset()}>بازنشانی همه</Button>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <RsvpPlayer open={rsvpOpen} onOpenChange={setRsvpOpen} text={getText()} />
    </>
  );
}
