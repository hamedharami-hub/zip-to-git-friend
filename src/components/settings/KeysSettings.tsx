import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { pingGemini, GeminiError } from "@/lib/gemini";
import { pingGroq, GroqError } from "@/lib/groq";
import { refreshAllModels } from "@/lib/refreshModels";
import { useSettingsStore } from "@/store/settingsStore";
import { ApiKeyInput } from "./ApiKeyInput";
import { ModelVisibilityDialog } from "./ModelVisibilityDialog";

export function KeysSettings() {
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
      openTtsUrl,
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

  return (
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
            ⚠️ Region باید دقیقاً همان منطقه‌ای باشد که Speech resource شما در آن ساخته شده؛ در غیر
            این صورت کلید ۴۰۱/۴۰۳ می‌گیرد.
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
            آخرین به‌روزرسانی: {new Date(settings.customModels.refreshedAt).toLocaleString()}
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
  );
}
