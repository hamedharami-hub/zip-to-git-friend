import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useShallow } from "zustand/shallow";
import { useSettingsStore } from "@/store/settingsStore";

export function ReadingSettings() {
  const { paragraphGestures, paragraphTextAlign, update } = useSettingsStore(
    useShallow((s) => ({
      paragraphGestures: s.settings.paragraphGestures,
      paragraphTextAlign: s.settings.paragraphTextAlign,
      update: s.update,
    })),
  );

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">حرکات لمسی روی پاراگراف‌ها</h2>
      <p className="text-sm text-muted-foreground">
        با فعال‌سازی این حالت، دکمه‌های زیر هر پاراگراف (ترجمه، پردازش، بلندگوها) حذف می‌شوند تا متن
        مثل یک کتاب عادی فشرده و خوانا شود. در عوض، با حرکات لمسی روی هر پاراگراف کار می‌کنی.
      </p>
      <div className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <Label>فعال‌سازی حرکات لمسی</Label>
          <Switch
            checked={!!paragraphGestures}
            onCheckedChange={(v) => update({ paragraphGestures: v })}
          />
        </div>

        {paragraphGestures && (
          <div className="rounded-md border border-primary/30 bg-primary/[0.04] p-3 space-y-2 text-sm">
            <div className="font-medium text-foreground">راهنمای حرکات</div>
            <ul className="space-y-1.5 text-muted-foreground leading-6">
              <li>
                <span className="font-semibold text-foreground">Swipe به راست ←</span> نمایش / مخفی
                کردن ترجمه فارسی.
              </li>
              <li>
                <span className="font-semibold text-foreground">Swipe به چپ →</span> نمایش ترجمه +
                پردازش کامل (لغت‌ها، اصطلاحات، گرامر).
              </li>
              <li>
                <span className="font-semibold text-foreground">دوبار زدن (Double-tap):</span> اگر
                روی متن انگلیسی بزنی، انگلیسی را با صدا می‌خواند؛ روی فارسی بزنی، فارسی را می‌خواند.
              </li>
              <li>
                <span className="font-semibold text-foreground">نگه داشتن (Long-press):</span> متن
                پاراگراف را کپی می‌کند و آن را ستاره‌دار می‌کند (دوباره نگه داری، ستاره برداشته
                می‌شود).
              </li>
            </ul>
            <p className="text-xs text-muted-foreground pt-1">
              نکته: پاراگراف‌های ستاره‌دار با حاشیه طلایی نمایش داده می‌شوند.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>چینش متن</Label>
          <Select
            value={paragraphTextAlign ?? "start"}
            onValueChange={(v) =>
              update({ paragraphTextAlign: v as "start" | "justify" | "center" })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="start">از ابتدا (پیش‌فرض)</SelectItem>
              <SelectItem value="justify">هم‌تراز دوطرفه (Justify)</SelectItem>
              <SelectItem value="center">وسط‌چین</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}
