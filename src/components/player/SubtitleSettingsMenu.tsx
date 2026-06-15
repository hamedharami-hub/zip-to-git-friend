import { Subtitles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useSettingsStore } from '@/store/settingsStore';

export function SubtitleSettingsMenu() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  const Row = ({
    title,
    desc,
    checked,
    onChange,
  }: {
    title: string;
    desc: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {desc}
        </p>
      </div>
      <Switch checked={checked} onCheckedChange={(v) => onChange(!!v)} />
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" title="Subtitle settings">
          <Subtitles className="h-3.5 w-3.5 mr-1.5" />
          Settings
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(92vw,360px)] max-h-[70vh] overflow-y-auto space-y-2 p-3"
        align="end"
      >
        <Row
          title="Auto-show analysis"
          desc="Automatically run AI analysis on the current subtitle (uses cached results when available)."
          checked={settings.autoShowAnalysis}
          onChange={(v) => update({ autoShowAnalysis: v })}
        />
        <Row
          title="Blind listen mode"
          desc="Hide the subtitle text and auto-pause at the end of every sentence."
          checked={settings.blindListen}
          onChange={(v) => update({ blindListen: v })}
        />
        <Row
          title="Auto-pause at end of every cue"
          desc="The video pauses after each subtitle line so you can think or repeat."
          checked={settings.autoPauseAtCueEnd}
          onChange={(v) => update({ autoPauseAtCueEnd: v })}
        />
        <Row
          title="Auto-fullscreen on landscape"
          desc="چرخاندن گوشی به landscape باعث ورود خودکار به immersive می‌شود."
          checked={settings.autoImmersiveOnLandscape ?? false}
          onChange={(v) => update({ autoImmersiveOnLandscape: v })}
        />
        <Row
          title="Show inline translation (dual subtitles)"
          desc="نمایش ترجمه‌ی کش‌شده زیر متن اصلی وقتی زیرنویس دوم نیست."
          checked={settings.showInlineTranslation}
          onChange={(v) => update({ showInlineTranslation: v })}
        />
      </PopoverContent>
    </Popover>
  );
}
