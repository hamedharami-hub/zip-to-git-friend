import { usePageMeta } from "@/hooks/usePageMeta";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Moon, Sun, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSettingsStore } from "@/store/settingsStore";
import { toast } from "sonner";
import { pingGemini, GeminiError } from "@/lib/gemini";
import { pingGroq, GroqError } from "@/lib/groq";
import { InstallButton } from "@/components/pwa/InstallButton";
import { ServiceWorkerStatusCard } from "@/components/pwa/ServiceWorkerStatusCard";
import {
  chatModelOptions,
  choiceToValue,
  valueToChoice,
  getAvailableBookModels,
  bookRefToValue,
  bookValueToRef,
  coerceBookModel,
  getGeminiModels,
  getGroqWhisperModels,
  type BookModelOption,
} from "@/lib/aiModels";
import type { BookAIModelRef } from "@/types";
import { refreshAllModels } from "@/lib/refreshModels";
import { ModelVisibilityDialog } from "@/components/settings/ModelVisibilityDialog";

interface ModelPickerProps {
  label: string;
  value: string;
  options: { value: string; label: string; hint?: string }[];
  onChange: (v: string) => void;
}

function ModelPicker({ label, value, options, onChange }: ModelPickerProps) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <span className="flex flex-col">
                <span>{o.label}</span>
                {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ApiKeyInput({
  label,
  value,
  onChange,
  placeholder,
  onTest,
  testing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onTest?: () => void;
  testing?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide" : "Show"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        {onTest && (
          <Button type="button" variant="outline" onClick={onTest} disabled={testing || !value}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
          </Button>
        )}
      </div>
    </div>
  );
}

const Settings = () => {
  usePageMeta({
    title: "Settings — Language Learning Player",
    description: "تنظیمات برنامه — کلیدهای API، مدل‌های AI، ظاهر و خواندن.",
  });
  const { settings, update } = useSettingsStore();
  const [gemini, setGemini] = useState(settings.geminiApiKey);
  const [groq, setGroq] = useState(settings.groqApiKey);
  const [geminiTts, setGeminiTts] = useState(settings.geminiTtsApiKey);
  const [elevenLabs, setElevenLabs] = useState(settings.elevenLabsApiKey ?? "");
  const [azureKey, setAzureKey] = useState(settings.azureTtsApiKey ?? "");
  const [azureRegion, setAzureRegion] = useState(settings.azureTtsRegion ?? "westeurope");
  const [hfKey, setHfKey] = useState(settings.huggingFaceApiKey ?? "");
  const [playHtUser, setPlayHtUser] = useState(settings.playHtUserId ?? "");
  const [playHtKey, setPlayHtKey] = useState(settings.playHtApiKey ?? "");
  const [openTtsUrl, setOpenTtsUrl] = useState(settings.openTtsUrl ?? "");
  const [testingGemini, setTestingGemini] = useState(false);
  const [testingGroq, setTestingGroq] = useState(false);
  const [testingTts, setTestingTts] = useState(false);
  const [testingEleven, setTestingEleven] = useState(false);
  const [testingAzure, setTestingAzure] = useState(false);
  const [testingHf, setTestingHf] = useState(false);
  const [testingPlayHt, setTestingPlayHt] = useState(false);
  const [testingOpenTts, setTestingOpenTts] = useState(false);
  const [refreshingModels, setRefreshingModels] = useState(false);

  useEffect(() => {}, []);

  useEffect(() => {
    setGemini(settings.geminiApiKey);
    setGroq(settings.groqApiKey);
    setGeminiTts(settings.geminiTtsApiKey);
    setElevenLabs(settings.elevenLabsApiKey ?? "");
    setAzureKey(settings.azureTtsApiKey ?? "");
    setAzureRegion(settings.azureTtsRegion ?? "westeurope");
    setHfKey(settings.huggingFaceApiKey ?? "");
    setPlayHtUser(settings.playHtUserId ?? "");
    setPlayHtKey(settings.playHtApiKey ?? "");
    setOpenTtsUrl(settings.openTtsUrl ?? "");
  }, [
    settings.geminiApiKey,
    settings.groqApiKey,
    settings.geminiTtsApiKey,
    settings.elevenLabsApiKey,
    settings.azureTtsApiKey,
    settings.azureTtsRegion,
    settings.huggingFaceApiKey,
    settings.playHtUserId,
    settings.playHtApiKey,
    settings.openTtsUrl,
  ]);

  const save = async () => {
    await update({
      geminiApiKey: gemini,
      groqApiKey: groq,
      geminiTtsApiKey: geminiTts,
      elevenLabsApiKey: elevenLabs,
      azureTtsApiKey: azureKey,
      azureTtsRegion: azureRegion,
      huggingFaceApiKey: hfKey,
      playHtUserId: playHtUser,
      playHtApiKey: playHtKey,
      openTtsUrl: openTtsUrl,
    });
    toast.success("Settings saved.");
  };

  const testGemini = async () => {
    setTestingGemini(true);
    try {
      await pingGemini(gemini, settings.geminiModel);
      toast.success("Gemini key works.");
    } catch (e) {
      const msg =
        e instanceof GeminiError
          ? e.code === "auth"
            ? "Gemini rejected the key."
            : `Gemini test failed (${e.code}).`
          : "Gemini test failed.";
      toast.error(msg);
    } finally {
      setTestingGemini(false);
    }
  };

  const testGroq = async () => {
    setTestingGroq(true);
    try {
      await pingGroq(groq);
      toast.success("Groq key works.");
    } catch (e) {
      const msg =
        e instanceof GroqError
          ? e.code === "auth"
            ? "Groq rejected the key."
            : `Groq test failed (${e.code}).`
          : "Groq test failed.";
      toast.error(msg);
    } finally {
      setTestingGroq(false);
    }
  };

  const testTts = async () => {
    setTestingTts(true);
    try {
      // A lightweight check: list models with the TTS key.
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiTts)}`,
      );
      if (res.status === 401 || res.status === 403) {
        toast.error("Gemini rejected the TTS key.");
      } else if (!res.ok) {
        toast.error(`TTS key test failed (${res.status}).`);
      } else {
        toast.success("Gemini TTS key works.");
      }
    } catch {
      toast.error("TTS key test failed.");
    } finally {
      setTestingTts(false);
    }
  };

  const testEleven = async () => {
    setTestingEleven(true);
    try {
      if (!elevenLabs.trim()) {
        toast.error("ابتدا کلید ElevenLabs را وارد کنید.");
        return;
      }
      const res = await fetch("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": elevenLabs.trim() },
      });
      let detail = "";
      try {
        const j = await res.clone().json();
        detail = j?.detail?.message || j?.detail?.status || j?.detail || j?.message || "";
        if (typeof detail !== "string") detail = JSON.stringify(detail);
      } catch {
        /* not json */
      }
      if (res.ok) {
        toast.success("ElevenLabs key works.");
      } else if (res.status === 401 || res.status === 403) {
        // Common cases: invalid_api_key, detected_unusual_activity (free tier + VPN/proxy),
        // missing_permissions (key has no text_to_speech scope).
        toast.error(
          `ElevenLabs ${res.status}: ${detail || "کلید رد شد"} — اگر detected_unusual_activity است، VPN را خاموش کن یا حساب را به Starter ارتقا بده. اگر missing_permissions است، یک کلید جدید با دسترسی text_to_speech بساز.`,
          { duration: 9000 },
        );
      } else if (res.status === 429) {
        toast.error("ElevenLabs: سقف اعتبار/درخواست پر شده (۴۲۹).");
      } else {
        toast.error(`ElevenLabs ${res.status}: ${detail || "خطا"}`);
      }
    } catch (e) {
      toast.error(`ElevenLabs test failed: ${e instanceof Error ? e.message : "network"}`);
    } finally {
      setTestingEleven(false);
    }
  };

  const testAzure = async () => {
    setTestingAzure(true);
    try {
      const region = (azureRegion || "westeurope").trim();
      const res = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`, {
        method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": azureKey },
      });
      if (res.status === 401 || res.status === 403) toast.error("Azure rejected the key.");
      else if (!res.ok) toast.error(`Azure test failed (${res.status}).`);
      else toast.success("Azure Speech key works.");
    } catch {
      toast.error("Azure test failed (network/region).");
    } finally {
      setTestingAzure(false);
    }
  };

  const testHf = async () => {
    setTestingHf(true);
    try {
      const res = await fetch("https://huggingface.co/api/whoami-v2", {
        headers: { Authorization: `Bearer ${hfKey}` },
      });
      if (res.status === 401 || res.status === 403) toast.error("Hugging Face rejected the token.");
      else if (!res.ok) toast.error(`Hugging Face test failed (${res.status}).`);
      else toast.success("Hugging Face token works.");
    } catch {
      toast.error("Hugging Face test failed.");
    } finally {
      setTestingHf(false);
    }
  };

  const testPlayHt = async () => {
    setTestingPlayHt(true);
    try {
      const res = await fetch("https://api.play.ht/api/v2/voices", {
        headers: {
          Authorization: `Bearer ${playHtKey}`,
          "X-User-ID": playHtUser,
        },
      });
      if (res.status === 401 || res.status === 403)
        toast.error("Play.ht rejected the credentials.");
      else if (!res.ok) toast.error(`Play.ht test failed (${res.status}).`);
      else toast.success("Play.ht credentials work.");
    } catch {
      toast.error("Play.ht test failed.");
    } finally {
      setTestingPlayHt(false);
    }
  };

  const testOpenTts = async () => {
    setTestingOpenTts(true);
    try {
      const url = openTtsUrl.replace(/\/+$/, "");
      const res = await fetch(`${url}/api/voices`);
      if (!res.ok) toast.error(`OpenTTS test failed (${res.status}).`);
      else toast.success("OpenTTS server reachable.");
    } catch {
      toast.error("OpenTTS unreachable.");
    } finally {
      setTestingOpenTts(false);
    }
  };

  const refreshModels = async () => {
    if (gemini !== settings.geminiApiKey || groq !== settings.groqApiKey) {
      await update({ geminiApiKey: gemini, groqApiKey: groq });
    }
    setRefreshingModels(true);
    try {
      const { patch, result } = await refreshAllModels({
        geminiApiKey: gemini,
        groqApiKey: groq,
        customModels: settings.customModels,
      });
      await update(patch);
      const parts: string[] = [];
      if (result.geminiCount) parts.push(`Gemini: ${result.geminiCount}`);
      if (result.groqChatCount) parts.push(`Groq chat: ${result.groqChatCount}`);
      if (result.groqWhisperCount) parts.push(`Whisper: ${result.groqWhisperCount}`);
      if (parts.length) toast.success(`Refreshed — ${parts.join(" · ")}`);
      if (result.errors.length) toast.message(result.errors.join(" · "));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setRefreshingModels(false);
    }
  };

  const isDark = settings.theme === "dark";

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
                      وقتی روشن باشد، هر خبر (سایت یا یوتیوب) از همان لحظه‌ی باز شدن به‌صورت ساده‌ی
                      روزمره ساخته می‌شود — بدون اینکه چیزی از متن اصلی حذف شود.
                    </p>
                  </div>
                  <Switch
                    checked={settings.defaultSimplifyArticles ?? false}
                    onCheckedChange={(v) => update({ defaultSimplifyArticles: !!v })}
                  />
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="keys" className="space-y-10 mt-6">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">AI</h2>
              <div className="space-y-4 rounded-lg border border-border p-4">
                <ApiKeyInput
                  label="Gemini API key"
                  value={gemini}
                  onChange={setGemini}
                  placeholder="AIza..."
                  onTest={testGemini}
                  testing={testingGemini}
                />
                <ApiKeyInput
                  label="Groq API key"
                  value={groq}
                  onChange={setGroq}
                  placeholder="gsk_..."
                  onTest={testGroq}
                  testing={testingGroq}
                />
                <div className="space-y-1.5">
                  <ApiKeyInput
                    label="Gemini TTS API key (text-to-speech)"
                    value={geminiTts}
                    onChange={setGeminiTts}
                    placeholder="AIza... (leave empty to reuse main Gemini key)"
                    onTest={testTts}
                    testing={testingTts}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used only for narrating book chapters with Google Gemini TTS. Get a key at{" "}
                    <span className="font-mono">aistudio.google.com/apikey</span>.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <ApiKeyInput
                    label="ElevenLabs API key (premium TTS)"
                    value={elevenLabs}
                    onChange={setElevenLabs}
                    placeholder="sk_... (optional — premium narration)"
                    onTest={testEleven}
                    testing={testingEleven}
                  />
                  <p className="text-xs text-muted-foreground">
                    صدای حرفه‌ای برای روایت متن خبر و کتاب با ElevenLabs. کلید را از{" "}
                    <span className="font-mono">elevenlabs.io</span> → Profile → API Keys بگیر.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <ApiKeyInput
                    label="Azure Speech key (TTS — بهترین فارسی)"
                    value={azureKey}
                    onChange={setAzureKey}
                    placeholder="32-char key (اختیاری — صدای فارسی طبیعی)"
                    onTest={testAzure}
                    testing={testingAzure}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-xs text-muted-foreground w-20">Region</label>
                    <select
                      className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-sm flex-1 min-w-[180px]"
                      value={
                        [
                          "australiaeast",
                          "australiasoutheast",
                          "southeastasia",
                          "eastasia",
                          "japaneast",
                          "japanwest",
                          "koreacentral",
                          "centralindia",
                          "uaenorth",
                          "westeurope",
                          "northeurope",
                          "uksouth",
                          "francecentral",
                          "germanywestcentral",
                          "switzerlandnorth",
                          "eastus",
                          "eastus2",
                          "westus",
                          "westus2",
                          "westus3",
                          "centralus",
                          "southcentralus",
                          "canadacentral",
                          "brazilsouth",
                          "southafricanorth",
                        ].includes(azureRegion)
                          ? azureRegion
                          : "__custom"
                      }
                      onChange={(e) => {
                        if (e.target.value !== "__custom") setAzureRegion(e.target.value);
                      }}
                    >
                      <optgroup label="Asia / Pacific">
                        <option value="australiaeast">Australia East — سیدنی (توصیه‌شده)</option>
                        <option value="australiasoutheast">Australia Southeast — ملبورن</option>
                        <option value="southeastasia">Southeast Asia — سنگاپور</option>
                        <option value="eastasia">East Asia — هنگ‌کنگ</option>
                        <option value="japaneast">Japan East — توکیو</option>
                        <option value="japanwest">Japan West — اوزاکا</option>
                        <option value="koreacentral">Korea Central — سئول</option>
                        <option value="centralindia">Central India — پونه</option>
                        <option value="uaenorth">UAE North — دبی</option>
                      </optgroup>
                      <optgroup label="Europe">
                        <option value="westeurope">West Europe — آمستردام</option>
                        <option value="northeurope">North Europe — دوبلین</option>
                        <option value="uksouth">UK South — لندن</option>
                        <option value="francecentral">France Central — پاریس</option>
                        <option value="germanywestcentral">Germany West Central</option>
                        <option value="switzerlandnorth">Switzerland North</option>
                      </optgroup>
                      <optgroup label="Americas">
                        <option value="eastus">East US</option>
                        <option value="eastus2">East US 2</option>
                        <option value="westus">West US</option>
                        <option value="westus2">West US 2</option>
                        <option value="westus3">West US 3</option>
                        <option value="centralus">Central US</option>
                        <option value="southcentralus">South Central US</option>
                        <option value="canadacentral">Canada Central</option>
                        <option value="brazilsouth">Brazil South</option>
                      </optgroup>
                      <optgroup label="Africa">
                        <option value="southafricanorth">South Africa North</option>
                      </optgroup>
                      <option value="__custom">سفارشی…</option>
                    </select>
                    <input
                      className="flex h-9 w-36 rounded-md border border-input bg-background px-2 py-1 text-xs font-mono"
                      value={azureRegion}
                      onChange={(e) => setAzureRegion(e.target.value)}
                      placeholder="region id"
                      title="شناسهٔ دقیق region (مثلاً australiaeast). باید با منطقه‌ای که Speech resource را در آن ساخته‌اید یکی باشد."
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    ⚠️ Region باید دقیقاً همان منطقه‌ای باشد که Speech resource شما در آن ساخته شده؛
                    در غیر این صورت کلید ۴۰۱/۴۰۳ می‌گیرد.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Microsoft Azure Cognitive Services — صدای fa-IR-DilaraNeural و FaridNeural. از{" "}
                    <span className="font-mono">portal.azure.com</span> → Speech service.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <ApiKeyInput
                    label="Hugging Face Inference token"
                    value={hfKey}
                    onChange={setHfKey}
                    placeholder="hf_... (اختیاری — MMS-TTS رایگان)"
                    onTest={testHf}
                    testing={testingHf}
                  />
                  <p className="text-xs text-muted-foreground">
                    مدل‌های facebook/mms-tts-fas و mms-tts-eng. توکن از
                    <span className="font-mono"> huggingface.co/settings/tokens</span>.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <ApiKeyInput
                      label="Play.ht User ID"
                      value={playHtUser}
                      onChange={setPlayHtUser}
                      placeholder="User ID"
                    />
                    <ApiKeyInput
                      label="Play.ht Secret Key"
                      value={playHtKey}
                      onChange={setPlayHtKey}
                      placeholder="Secret key"
                      onTest={testPlayHt}
                      testing={testingPlayHt}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Play.ht — صدای چندزبانه‌ی PlayHT2.0 (فارسی + انگلیسی).
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">OpenTTS server URL</label>
                  <div className="flex gap-2">
                    <input
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                      value={openTtsUrl}
                      onChange={(e) => setOpenTtsUrl(e.target.value)}
                      placeholder="http://localhost:5500 (اختیاری — self-hosted رایگان)"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={testOpenTts}
                      disabled={testingOpenTts || !openTtsUrl}
                    >
                      {testingOpenTts ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    OpenTTS رایگان و self-hosted — راه‌اندازی با docker از
                    <span className="font-mono"> github.com/synesthesiam/opentts</span>.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={save}>Save API keys</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={refreshModels}
                    disabled={refreshingModels || (!gemini && !groq)}
                  >
                    {refreshingModels ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    به‌روزرسانی لیست مدل‌ها
                  </Button>
                  <ModelVisibilityDialog />
                </div>
                {settings.customModels?.refreshedAt && (
                  <p className="text-[11px] text-muted-foreground">
                    آخرین به‌روزرسانی:{" "}
                    {new Date(settings.customModels.refreshedAt).toLocaleString()}
                    {settings.customModels.gemini?.length
                      ? ` · Gemini ${settings.customModels.gemini.length}`
                      : ""}
                    {settings.customModels.groqChat?.length
                      ? ` · Groq ${settings.customModels.groqChat.length}`
                      : ""}
                  </p>
                )}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="models" className="space-y-10 mt-6">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Models per task</h2>
              <p className="text-sm text-muted-foreground">
                Choose which model handles each AI task. Mix Gemini and Groq — Groq is faster,
                Gemini Pro is stronger on nuance.
              </p>
              <div className="space-y-4 rounded-lg border border-border p-4">
                <ModelPicker
                  label="Subtitle analysis (vocabulary & idioms)"
                  value={choiceToValue(settings.analyzeModel)}
                  options={chatModelOptions(settings)}
                  onChange={(v) => update({ analyzeModel: valueToChoice(v) })}
                />
                <p className="text-[11px] text-muted-foreground -mt-2">
                  تحلیل جمله‌ی فعلی زیرنویس فیلم.
                </p>
                <ModelPicker
                  label="Quick translation (word / sentence)"
                  value={choiceToValue(settings.translateModel)}
                  options={chatModelOptions(settings)}
                  onChange={(v) => update({ translateModel: valueToChoice(v) })}
                />
                <p className="text-[11px] text-muted-foreground -mt-2">
                  ترجمه‌ی سریع جمله/کلمه — فقط در زیرنویس فیلم استفاده می‌شود (کتاب و خبر مدل
                  جداگانه دارند).
                </p>
                <ModelPicker
                  label="Batch analyze"
                  value={choiceToValue(settings.batchModel)}
                  options={chatModelOptions(settings)}
                  onChange={(v) => update({ batchModel: valueToChoice(v) })}
                />
                <p className="text-[11px] text-muted-foreground -mt-2">
                  تحلیل گروهی همه‌ی جمله‌های یک زیرنویس فیلم.
                </p>
                <ModelPicker
                  label="Transcription (Groq Whisper)"
                  value={settings.transcribeModel}
                  options={getGroqWhisperModels(settings)}
                  onChange={(v) =>
                    update({ transcribeModel: v as typeof settings.transcribeModel })
                  }
                />
                <div className="space-y-1.5">
                  <Label>مدل تست Gemini (فقط برای تست کلید)</Label>
                  <Select
                    value={settings.geminiModel}
                    onValueChange={(v) => update({ geminiModel: v as typeof settings.geminiModel })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getGeminiModels(settings).map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    این مدل فقط برای دکمه‌ی «تست کلید Gemini» در همین صفحه استفاده می‌شود. هر بخش
                    (زیرنویس، کتاب، خبر) مدل اختصاصی خودش را در پایین دارد.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Books — AI models</h2>
              <p className="text-sm text-muted-foreground">
                Choose which AI handles book analysis & rewriting. The list shows
                <strong> Lovable AI</strong> by default, plus your own
                <strong> Gemini</strong> / <strong>Groq</strong> models when you enter their API
                keys above.
              </p>
              <div className="space-y-4 rounded-lg border border-border p-4">
                <BookModelPicker
                  label="Single paragraph analysis"
                  hint="تحلیل یک پاراگراف کتاب — وقتی روی ✨ زیر یک پاراگراف بزنی."
                  value={coerceBookModel(
                    settings.bookSingleAnalysisModelRef ?? settings.bookSingleAnalysisModel,
                  )}
                  onChange={(ref) =>
                    update({
                      bookSingleAnalysisModelRef: ref,
                      // Keep the legacy gateway model in sync when the user picks
                      // a gateway model so older code paths keep working.
                      ...(ref.provider === "gateway"
                        ? {
                            bookSingleAnalysisModel:
                              ref.model as typeof settings.bookSingleAnalysisModel,
                          }
                        : {}),
                    })
                  }
                  options={getAvailableBookModels(settings)}
                />
                <BookModelPicker
                  label="Whole-chapter batch analysis"
                  hint="تحلیل گروهی همه‌ی پاراگراف‌های یک فصل کتاب (دکمه ✨ بالای فصل). مدل سریع‌تر/ارزان‌تر بهتر است."
                  value={coerceBookModel(
                    settings.bookBatchAnalysisModelRef ?? settings.bookBatchAnalysisModel,
                  )}
                  onChange={(ref) =>
                    update({
                      bookBatchAnalysisModelRef: ref,
                      ...(ref.provider === "gateway"
                        ? {
                            bookBatchAnalysisModel:
                              ref.model as typeof settings.bookBatchAnalysisModel,
                          }
                        : {}),
                    })
                  }
                  options={getAvailableBookModels(settings)}
                />
                <BookModelPicker
                  label="Chapter rewrite (summary, key points, simplified…)"
                  hint="بازنویسی فصل کتاب به سبک‌های مختلف (خلاصه، نکات کلیدی، ساده‌سازی…). مدل قوی‌تر، خلاصه‌ی بهتر."
                  value={coerceBookModel(settings.bookRewriteModelRef ?? settings.bookRewriteModel)}
                  onChange={(ref) =>
                    update({
                      bookRewriteModelRef: ref,
                      ...(ref.provider === "gateway"
                        ? { bookRewriteModel: ref.model as typeof settings.bookRewriteModel }
                        : {}),
                    })
                  }
                  options={getAvailableBookModels(settings)}
                />
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold">News & Sentence Lab — AI models</h2>
              <p className="text-sm text-muted-foreground">
                Choose which AI handles each app section. Lovable AI is always available; adding
                your Gemini/Groq keys above unlocks more options.
              </p>
              <div className="space-y-4 rounded-lg border border-border p-4">
                <BookModelPicker
                  label="News rewrite (long & maximum article digest)"
                  hint="بازنویسی خبر (خلاصه، ساده، طولانی، حداکثری). همین مدل را داخل خود صفحه‌ی خبر هم می‌توانی عوض کنی."
                  value={coerceBookModel(
                    settings.newsRewriteModelRef ??
                      settings.bookRewriteModelRef ??
                      "google/gemini-3-flash-preview",
                  )}
                  onChange={(ref) => update({ newsRewriteModelRef: ref })}
                  options={getAvailableBookModels(settings)}
                />
                <BookModelPicker
                  label="News paragraph batch analysis"
                  hint="تحلیل گروهی پاراگراف‌های یک خبر (دکمه ✨ بالای خبر). مدل سریع‌تر/ارزان‌تر کافی است."
                  value={coerceBookModel(
                    settings.newsBatchAnalysisModelRef ??
                      settings.paragraphBatchModelRef ??
                      settings.bookBatchAnalysisModelRef ??
                      "google/gemini-3.1-flash-lite-preview",
                  )}
                  onChange={(ref) => update({ newsBatchAnalysisModelRef: ref })}
                  options={getAvailableBookModels(settings)}
                />
                <BookModelPicker
                  label="News topic search summaries"
                  hint="خلاصه‌ی تیترها هنگام جست‌وجو یا مرور یک موضوع/سایت."
                  value={coerceBookModel(
                    settings.newsSearchModelRef ?? "google/gemini-3.1-flash-lite-preview",
                  )}
                  onChange={(ref) => update({ newsSearchModelRef: ref })}
                  options={getAvailableBookModels(settings)}
                />
                <BookModelPicker
                  label="Smart HTML filename"
                  hint="پیشنهاد نام فارسی کوتاه برای فایل HTML خروجی خبر/متن. مدل سبک و سریع کافی است."
                  value={coerceBookModel(
                    settings.htmlFilenameModelRef ?? "google/gemini-3.1-flash-lite-preview",
                  )}
                  onChange={(ref) => update({ htmlFilenameModelRef: ref })}
                  options={getAvailableBookModels(settings)}
                />
                <BookModelPicker
                  label="Sentence Lab (planner, roleplay, examples)"
                  hint="برنامه‌ریز و نقش‌بازی و مثال‌سازی در Sentence Lab."
                  value={coerceBookModel(
                    settings.sentenceLabModelRef ?? "google/gemini-3-flash-preview",
                  )}
                  onChange={(ref) => update({ sentenceLabModelRef: ref })}
                  options={getAvailableBookModels(settings)}
                />
              </div>
            </section>
          </TabsContent>

          <TabsContent value="reading" className="space-y-10 mt-6">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">حرکات لمسی روی پاراگراف‌ها</h2>
              <p className="text-sm text-muted-foreground">
                با فعال‌سازی این حالت، دکمه‌های زیر هر پاراگراف (ترجمه، پردازش، بلندگوها) حذف
                می‌شوند تا متن مثل یک کتاب عادی فشرده و خوانا شود. در عوض، با حرکات لمسی روی هر
                پاراگراف کار می‌کنی.
              </p>
              <div className="space-y-4 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <Label>فعال‌سازی حرکات لمسی</Label>
                  <Switch
                    checked={!!settings.paragraphGestures}
                    onCheckedChange={(v) => update({ paragraphGestures: v })}
                  />
                </div>

                {settings.paragraphGestures && (
                  <div className="rounded-md border border-primary/30 bg-primary/[0.04] p-3 space-y-2 text-sm">
                    <div className="font-medium text-foreground">راهنمای حرکات</div>
                    <ul className="space-y-1.5 text-muted-foreground leading-6">
                      <li>
                        <span className="font-semibold text-foreground">Swipe به راست ←</span> نمایش
                        / مخفی کردن ترجمه فارسی.
                      </li>
                      <li>
                        <span className="font-semibold text-foreground">Swipe به چپ →</span> نمایش
                        ترجمه + پردازش کامل (لغت‌ها، اصطلاحات، گرامر).
                      </li>
                      <li>
                        <span className="font-semibold text-foreground">
                          دوبار زدن (Double-tap):
                        </span>{" "}
                        اگر روی متن انگلیسی بزنی، انگلیسی را با صدا می‌خواند؛ روی فارسی بزنی، فارسی
                        را می‌خواند.
                      </li>
                      <li>
                        <span className="font-semibold text-foreground">
                          نگه داشتن (Long-press):
                        </span>{" "}
                        متن پاراگراف را کپی می‌کند و آن را ستاره‌دار می‌کند (دوباره نگه داری، ستاره
                        برداشته می‌شود).
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
                    value={settings.paragraphTextAlign ?? "start"}
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
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

// ─── Book model picker (provider-aware, grouped) ──────────────────
interface BookModelPickerProps {
  label: string;
  hint?: string;
  value: BookAIModelRef;
  onChange: (ref: BookAIModelRef) => void;
  options: BookModelOption[];
}

function BookModelPicker({ label, hint, value, onChange, options }: BookModelPickerProps) {
  const currentValue = bookRefToValue(value);
  // Group options by provider for nicer rendering.
  const groups = options.reduce<Record<string, BookModelOption[]>>((acc, o) => {
    (acc[o.group] ??= []).push(o);
    return acc;
  }, {});
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={currentValue} onValueChange={(v) => onChange(bookValueToRef(v))}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </div>
              {items.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  <span className="flex flex-col">
                    <span>{o.label}</span>
                    {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
                  </span>
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default Settings;
