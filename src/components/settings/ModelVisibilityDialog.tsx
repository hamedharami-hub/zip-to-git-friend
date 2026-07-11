import { useMemo, useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getAllGeminiModels,
  getAllGroqChatModels,
  getAllGroqWhisperModels,
  getAllGatewayModels,
} from "@/lib/aiModels";
import { useSettingsStore } from "@/store/settingsStore";
import { toast } from "sonner";

type Provider = "gemini" | "groqChat" | "groqWhisper" | "gateway";

const TABS: { key: Provider; label: string }[] = [
  { key: "gateway", label: "Lovable AI" },
  { key: "gemini", label: "Gemini" },
  { key: "groqChat", label: "Groq Chat" },
  { key: "groqWhisper", label: "Whisper" },
];

export function ModelVisibilityDialog() {
  const { settings, update } = useSettingsStore();
  const [open, setOpen] = useState(false);

  const all = useMemo(
    () => ({
      gemini: getAllGeminiModels(settings),
      groqChat: getAllGroqChatModels(settings),
      groqWhisper: getAllGroqWhisperModels(settings),
      gateway: getAllGatewayModels(settings),
    }),
    [settings.customModels],
  );

  // Local mirror of the hidden lists so toggles feel instant.
  const [hidden, setHidden] = useState<Record<Provider, Set<string>>>(() => ({
    gemini: new Set(settings.customModels?.hidden?.gemini ?? []),
    groqChat: new Set(settings.customModels?.hidden?.groqChat ?? []),
    groqWhisper: new Set(settings.customModels?.hidden?.groqWhisper ?? []),
    gateway: new Set(settings.customModels?.hidden?.gateway ?? []),
  }));

  const toggle = (p: Provider, value: string) => {
    setHidden((prev) => {
      const next = { ...prev, [p]: new Set(prev[p]) };
      if (next[p].has(value)) next[p].delete(value);
      else next[p].add(value);
      return next;
    });
  };

  const save = async () => {
    await update({
      customModels: {
        ...(settings.customModels ?? {}),
        hidden: {
          gemini: Array.from(hidden.gemini),
          groqChat: Array.from(hidden.groqChat),
          groqWhisper: Array.from(hidden.groqWhisper),
          gateway: Array.from(hidden.gateway),
        },
      },
    });
    toast.success("فهرست مدل‌ها به‌روز شد.");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-1.5">
          <SettingsIcon className="h-4 w-4" />
          مدل‌های قابل نمایش
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>مدل‌های قابل نمایش</DialogTitle>
          <DialogDescription>
            تیک هر مدلی که می‌خواهی در منوهای انتخاب ببینی، روشن باشد. مدل‌های بدون تیک از همه‌ی
            dropdown ها مخفی می‌شوند.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="gateway" className="mt-2">
          <TabsList className="grid grid-cols-4 w-full">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="text-xs">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((t) => {
            const list = all[t.key];
            return (
              <TabsContent key={t.key} value={t.key} className="mt-3">
                {list.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    هیچ مدلی یافت نشد. ابتدا API key وارد و «به‌روزرسانی لیست مدل‌ها» را بزن.
                  </p>
                ) : (
                  <div className="max-h-72 overflow-y-auto space-y-1 rounded border border-border p-2">
                    {list.map((m) => {
                      const checked = !hidden[t.key].has(m.value);
                      return (
                        <Label
                          key={m.value}
                          className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggle(t.key, m.value)}
                          />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm truncate">{m.label}</span>
                            <span
                              className="block text-[10px] text-muted-foreground truncate"
                              dir="ltr"
                            >
                              {m.value}
                            </span>
                          </span>
                        </Label>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setHidden((p) => ({ ...p, [t.key]: new Set() }))}
                  >
                    انتخاب همه
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setHidden((p) => ({
                        ...p,
                        [t.key]: new Set(list.map((m) => m.value)),
                      }))
                    }
                  >
                    حذف همه
                  </Button>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            انصراف
          </Button>
          <Button onClick={save}>ذخیره</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
