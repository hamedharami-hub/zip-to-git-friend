import { usePageMeta } from "@/hooks/usePageMeta";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InstallButton } from "@/components/pwa/InstallButton";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { KeysSettings } from "@/components/settings/KeysSettings";
import { ModelsSettings } from "@/components/settings/ModelsSettings";
import { ReadingSettings } from "@/components/settings/ReadingSettings";

const Settings = () => {
  usePageMeta({
    title: "Settings — Language Learning Player",
    description: "تنظیمات برنامه — کلیدهای API، مدل‌های AI، ظاهر و خواندن.",
  });

  return (
    <div className="min-h-screen bg-[hsl(var(--surface))] text-foreground">
      <header className="m3-top-app-bar sticky top-0 z-30 border-b border-outline-variant/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <Link to="/">
            <Button variant="ghost" size="sm" className="rounded-full gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Home
            </Button>
          </Link>
          <h1 className="text-[15px] font-semibold">Settings</h1>
          <InstallButton />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-[hsl(var(--on-surface-variant))]">
            Preferences
          </p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">تنظیمات</h2>
        </div>

        <Tabs defaultValue="appearance" dir="rtl" className="space-y-6">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full h-auto gap-1 bg-[hsl(var(--surface-container-low))] p-1 rounded-2xl">
            <TabsTrigger value="appearance" className="rounded-xl">
              ظاهر و برنامه
            </TabsTrigger>
            <TabsTrigger value="keys" className="rounded-xl">
              کلیدهای API
            </TabsTrigger>
            <TabsTrigger value="models" className="rounded-xl">
              مدل‌های AI
            </TabsTrigger>
            <TabsTrigger value="reading" className="rounded-xl">
              خواندن
            </TabsTrigger>
          </TabsList>

          <TabsContent value="appearance" className="space-y-10 mt-6">
            <AppearanceSettings />
          </TabsContent>

          <TabsContent value="keys" className="space-y-10 mt-6">
            <KeysSettings />
          </TabsContent>

          <TabsContent value="models" className="space-y-10 mt-6">
            <ModelsSettings />
          </TabsContent>

          <TabsContent value="reading" className="space-y-10 mt-6">
            <ReadingSettings />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Settings;
