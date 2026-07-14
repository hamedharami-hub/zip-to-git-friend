import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ServiceWorkerStatusCard } from "@/components/pwa/ServiceWorkerStatusCard";
import { useSettingsStore } from "@/store/settingsStore";
import { Moon, Sun } from "lucide-react";

export function AppearanceSettings() {
  const { settings, update } = useSettingsStore();
  const isDark = settings.theme === "dark";

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-[hsl(var(--on-surface-variant))] uppercase tracking-wider">
          Appearance
        </h2>
        <div className="flex items-center justify-between rounded-[20px] border border-outline-variant bg-[hsl(var(--surface-container-low))] p-5">
          <div>
            <p className="font-medium">Theme</p>
            <p className="text-sm text-muted-foreground">Switch between dark and light.</p>
          </div>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => update({ theme: isDark ? "light" : "dark" })}
          >
            {isDark ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
            {isDark ? "Light" : "Dark"}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-[hsl(var(--on-surface-variant))] uppercase tracking-wider">
          برنامه و آفلاین
        </h2>
        <ServiceWorkerStatusCard />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">ساده‌سازی متن</h2>
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div>
            <p className="font-medium">ساده‌سازی متن انگلیسی (روزمره)</p>
            <p className="text-sm text-muted-foreground">
              وقتی روی تب «ساده روزمره» در یک خبر یا فصل کتاب می‌زنی، متن انگلیسی با همین سطح
              بازنویسی می‌شه — با کلمات و اصطلاحات پرکاربرد مکالمه‌ی روزمره،
              <strong className="font-semibold"> بدون حذف هیچ نکته‌ای</strong>.
            </p>
          </div>
          <div className="flex gap-2">
            {[
              { v: "a2-b1", label: "مبتدی-متوسط (A2–B1)", desc: "ساده‌ترین حالت" },
              { v: "b1-b2", label: "متوسط (B1–B2)", desc: "کمی پیشرفته‌تر" },
            ].map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => update({ simplifyLevel: opt.v as "a2-b1" | "b1-b2" })}
                className={
                  "flex-1 rounded-md border px-3 py-2 text-right transition-colors " +
                  ((settings.simplifyLevel ?? "a2-b1") === opt.v
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60")
                }
              >
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="text-[11px] opacity-70">{opt.desc}</div>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/70 bg-muted/20 p-3">
            <div className="pr-3">
              <p className="text-sm font-medium">ساده‌سازی خودکار خبرها از ابتدا</p>
              <p className="text-xs text-muted-foreground">
                وقتی روشن باشد، هر خبر (سایت یا یوتیوب) از همان لحظه‌ی باز شدن به‌صورت ساده‌ی روزمره
                ساخته می‌شود — بدون اینکه چیزی از متن اصلی حذف شود.
              </p>
            </div>
            <Switch
              checked={settings.defaultSimplifyArticles ?? false}
              onCheckedChange={(v) => update({ defaultSimplifyArticles: !!v })}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
