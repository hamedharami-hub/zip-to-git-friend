import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Moon, Sun, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSettingsStore } from '@/store/settingsStore';
import { toast } from 'sonner';
import { pingGemini, GeminiError } from '@/lib/gemini';
import { pingGroq, GroqError } from '@/lib/groq';
import { InstallButton } from '@/components/pwa/InstallButton';
import { ServiceWorkerStatusCard } from '@/components/pwa/ServiceWorkerStatusCard';
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
} from '@/lib/aiModels';
import type { BookAIModelRef } from '@/types';
import { refreshAllModels } from '@/lib/refreshModels';
import { ModelVisibilityDialog } from '@/components/settings/ModelVisibilityDialog';

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
                {o.hint && (
                  <span className="text-xs text-muted-foreground">{o.hint}</span>
                )}
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
            type={show ? 'text' : 'password'}
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
            aria-label={show ? 'Hide' : 'Show'}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        {onTest && (
          <Button type="button" variant="outline" onClick={onTest} disabled={testing || !value}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
          </Button>
        )}
      </div>
    </div>
  );
}

const Settings = () => {
  const { settings, update } = useSettingsStore();
  const [gemini, setGemini] = useState(settings.geminiApiKey);
  const [groq, setGroq] = useState(settings.groqApiKey);
  const [geminiTts, setGeminiTts] = useState(settings.geminiTtsApiKey);
  const [elevenLabs, setElevenLabs] = useState(settings.elevenLabsApiKey ?? '');
  const [azureKey, setAzureKey] = useState(settings.azureTtsApiKey ?? '');
  const [azureRegion, setAzureRegion] = useState(settings.azureTtsRegion ?? 'westeurope');
  const [hfKey, setHfKey] = useState(settings.huggingFaceApiKey ?? '');
  const [playHtUser, setPlayHtUser] = useState(settings.playHtUserId ?? '');
  const [playHtKey, setPlayHtKey] = useState(settings.playHtApiKey ?? '');
  const [openTtsUrl, setOpenTtsUrl] = useState(settings.openTtsUrl ?? '');
  const [testingGemini, setTestingGemini] = useState(false);
  const [testingGroq, setTestingGroq] = useState(false);
  const [testingTts, setTestingTts] = useState(false);
  const [refreshingModels, setRefreshingModels] = useState(false);

  useEffect(() => {
    document.title = 'Settings — Language Learning Player';
  }, []);

  useEffect(() => {
    setGemini(settings.geminiApiKey);
    setGroq(settings.groqApiKey);
    setGeminiTts(settings.geminiTtsApiKey);
    setElevenLabs(settings.elevenLabsApiKey ?? '');
    setAzureKey(settings.azureTtsApiKey ?? '');
    setAzureRegion(settings.azureTtsRegion ?? 'westeurope');
    setHfKey(settings.huggingFaceApiKey ?? '');
    setPlayHtUser(settings.playHtUserId ?? '');
    setPlayHtKey(settings.playHtApiKey ?? '');
    setOpenTtsUrl(settings.openTtsUrl ?? '');
  }, [settings.geminiApiKey, settings.groqApiKey, settings.geminiTtsApiKey, settings.elevenLabsApiKey, settings.azureTtsApiKey, settings.azureTtsRegion, settings.huggingFaceApiKey, settings.playHtUserId, settings.playHtApiKey, settings.openTtsUrl]);

  const save = async () => {
    await update({
      geminiApiKey: gemini, groqApiKey: groq, geminiTtsApiKey: geminiTts, elevenLabsApiKey: elevenLabs,
      azureTtsApiKey: azureKey, azureTtsRegion: azureRegion,
      huggingFaceApiKey: hfKey,
      playHtUserId: playHtUser, playHtApiKey: playHtKey,
      openTtsUrl: openTtsUrl,
    });
    toast.success('Settings saved.');
  };

  const testGemini = async () => {
    setTestingGemini(true);
    try {
      await pingGemini(gemini, settings.geminiModel);
      toast.success('Gemini key works.');
    } catch (e) {
      const msg =
        e instanceof GeminiError
          ? e.code === 'auth'
            ? 'Gemini rejected the key.'
            : `Gemini test failed (${e.code}).`
          : 'Gemini test failed.';
      toast.error(msg);
    } finally {
      setTestingGemini(false);
    }
  };

  const testGroq = async () => {
    setTestingGroq(true);
    try {
      await pingGroq(groq);
      toast.success('Groq key works.');
    } catch (e) {
      const msg =
        e instanceof GroqError
          ? e.code === 'auth'
            ? 'Groq rejected the key.'
            : `Groq test failed (${e.code}).`
          : 'Groq test failed.';
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
        toast.error('Gemini rejected the TTS key.');
      } else if (!res.ok) {
        toast.error(`TTS key test failed (${res.status}).`);
      } else {
        toast.success('Gemini TTS key works.');
      }
    } catch {
      toast.error('TTS key test failed.');
    } finally {
      setTestingTts(false);
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
      if (parts.length) toast.success(`Refreshed — ${parts.join(' · ')}`);
      if (result.errors.length) toast.message(result.errors.join(' · '));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Refresh failed.');
    } finally {
      setRefreshingModels(false);
    }
  };

  const isDark = settings.theme === 'dark';

  return (
    <div className="min-h-screen bg-[hsl(var(--surface))] text-foreground">
      <header className="m3-top-app-bar sticky top-0 z-30 border-b border-outline-variant/40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <Link to="/">
            <Button variant="ghost" size="sm" className="rounded-full gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Home
            </Button>
          </Link>
          <h1 className="text-[15px] font-semibold">Settings</h1>
          <InstallButton />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-[hsl(var(--on-surface-variant))]">
            Preferences
          </p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">تنظیمات</h2>
        </div>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-[hsl(var(--on-surface-variant))] uppercase tracking-wider">Appearance</h2>
          <div className="flex items-center justify-between rounded-[20px] border border-outline-variant bg-[hsl(var(--surface-container-low))] p-5">
            <div>
              <p className="font-medium">Theme</p>
              <p className="text-sm text-muted-foreground">Switch between dark and light.</p>
            </div>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => update({ theme: isDark ? 'light' : 'dark' })}
            >
              {isDark ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
              {isDark ? 'Light' : 'Dark'}
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-[hsl(var(--on-surface-variant))] uppercase tracking-wider">برنامه و آفلاین</h2>
          <ServiceWorkerStatusCard />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Subtitles</h2>
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="font-medium">Auto-show analysis</p>
              <p className="text-sm text-muted-foreground">
                Automatically run AI analysis on the current subtitle (uses cached results when available).
              </p>
            </div>
            <Switch
              checked={settings.autoShowAnalysis}
              onCheckedChange={(v) => update({ autoShowAnalysis: !!v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="font-medium">Blind listen mode</p>
              <p className="text-sm text-muted-foreground">
                Hide the subtitle text and auto-pause at the end of every sentence.
                Tap “Reveal” to see it or “Next” to advance.
              </p>
            </div>
            <Switch
              checked={settings.blindListen}
              onCheckedChange={(v) => update({ blindListen: !!v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="font-medium">Auto-pause at end of every cue</p>
              <p className="text-sm text-muted-foreground">
                The video pauses after each subtitle line so you can think or repeat
                before pressing play to continue. Toggle quickly from the player too.
              </p>
            </div>
            <Switch
              checked={settings.autoPauseAtCueEnd}
              onCheckedChange={(v) => update({ autoPauseAtCueEnd: !!v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="font-medium">Auto-fullscreen on landscape</p>
              <p className="text-sm text-muted-foreground">
                وقتی گوشی را افقی می‌چرخانی، پخش‌کننده خودش وارد حالت تمام‌صفحه شود.
                به‌صورت پیش‌فرض خاموش است؛ اگر روشن کنی، چرخاندن گوشی به landscape
                باعث ورود خودکار به immersive می‌شود.
              </p>
            </div>
            <Switch
              checked={settings.autoImmersiveOnLandscape ?? false}
              onCheckedChange={(v) => update({ autoImmersiveOnLandscape: !!v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="font-medium">Show inline translation (dual subtitles)</p>
              <p className="text-sm text-muted-foreground">
                When no second subtitle track is loaded, show the cached AI translation
                under the source line. Run “Analyze” to populate translations.
              </p>
            </div>
            <Switch
              checked={settings.showInlineTranslation}
              onCheckedChange={(v) => update({ showInlineTranslation: !!v })}
            />
          </div>
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div>
              <p className="font-medium">ساده‌سازی متن انگلیسی (روزمره)</p>
              <p className="text-sm text-muted-foreground">
                وقتی روی تب «ساده روزمره» در یک خبر یا فصل کتاب می‌زنی، متن انگلیسی با
                همین سطح بازنویسی می‌شه — با کلمات و اصطلاحات پرکاربرد مکالمه‌ی روزمره،
                <strong className="font-semibold"> بدون حذف هیچ نکته‌ای</strong>.
              </p>
            </div>
            <div className="flex gap-2">
              {[
                { v: 'a2-b1', label: 'مبتدی-متوسط (A2–B1)', desc: 'ساده‌ترین حالت' },
                { v: 'b1-b2', label: 'متوسط (B1–B2)', desc: 'کمی پیشرفته‌تر' },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => update({ simplifyLevel: opt.v as 'a2-b1' | 'b1-b2' })}
                  className={
                    'flex-1 rounded-md border px-3 py-2 text-right transition-colors ' +
                    ((settings.simplifyLevel ?? 'a2-b1') === opt.v
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/60')
                  }
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-[11px] opacity-70">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </section>

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
                Used only for narrating book chapters with Google Gemini TTS.
                Get a key at <span className="font-mono">aistudio.google.com/apikey</span>.
              </p>
            </div>
            <div className="space-y-1.5">
              <ApiKeyInput
                label="ElevenLabs API key (premium TTS)"
                value={elevenLabs}
                onChange={setElevenLabs}
                placeholder="sk_... (optional — premium narration)"
              />
              <p className="text-xs text-muted-foreground">
                صدای حرفه‌ای برای روایت متن خبر و کتاب با ElevenLabs.
                کلید را از <span className="font-mono">elevenlabs.io</span> → Profile → API Keys بگیر.
              </p>
            </div>

            <div className="space-y-1.5">
              <ApiKeyInput
                label="Azure Speech key (TTS — بهترین فارسی)"
                value={azureKey}
                onChange={setAzureKey}
                placeholder="32-char key (اختیاری — صدای فارسی طبیعی)"
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground w-20">Region</label>
                <input
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={azureRegion}
                  onChange={(e) => setAzureRegion(e.target.value)}
                  placeholder="westeurope / eastus / ..."
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Microsoft Azure Cognitive Services — صدای fa-IR-DilaraNeural و FaridNeural.
                از <span className="font-mono">portal.azure.com</span> → Speech service.
              </p>
            </div>

            <div className="space-y-1.5">
              <ApiKeyInput
                label="Hugging Face Inference token"
                value={hfKey}
                onChange={setHfKey}
                placeholder="hf_... (اختیاری — MMS-TTS رایگان)"
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
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Play.ht — صدای چندزبانه‌ی PlayHT2.0 (فارسی + انگلیسی).
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">OpenTTS server URL</label>
              <input
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={openTtsUrl}
                onChange={(e) => setOpenTtsUrl(e.target.value)}
                placeholder="http://localhost:5500 (اختیاری — self-hosted رایگان)"
              />
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
                آخرین به‌روزرسانی:{' '}
                {new Date(settings.customModels.refreshedAt).toLocaleString()}
                {settings.customModels.gemini?.length
                  ? ` · Gemini ${settings.customModels.gemini.length}`
                  : ''}
                {settings.customModels.groqChat?.length
                  ? ` · Groq ${settings.customModels.groqChat.length}`
                  : ''}
              </p>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Models per task</h2>
          <p className="text-sm text-muted-foreground">
            Choose which model handles each AI task. Mix Gemini and Groq — Groq is faster, Gemini Pro is stronger on nuance.
          </p>
          <div className="space-y-4 rounded-lg border border-border p-4">
            <ModelPicker
              label="Subtitle analysis (vocabulary & idioms)"
              value={choiceToValue(settings.analyzeModel)}
              options={chatModelOptions(settings)}
              onChange={(v) => update({ analyzeModel: valueToChoice(v) })}
            />
            <ModelPicker
              label="Quick translation (word / sentence)"
              value={choiceToValue(settings.translateModel)}
              options={chatModelOptions(settings)}
              onChange={(v) => update({ translateModel: valueToChoice(v) })}
            />
            <ModelPicker
              label="Batch analyze"
              value={choiceToValue(settings.batchModel)}
              options={chatModelOptions(settings)}
              onChange={(v) => update({ batchModel: valueToChoice(v) })}
            />
            <ModelPicker
              label="Transcription (Groq Whisper)"
              value={settings.transcribeModel}
              options={getGroqWhisperModels(settings)}
              onChange={(v) => update({ transcribeModel: v as typeof settings.transcribeModel })}
            />
            <div className="space-y-1.5">
              <Label>Default Gemini model (legacy fallback)</Label>
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
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Books — AI models</h2>
          <p className="text-sm text-muted-foreground">
            Choose which AI handles book analysis & rewriting. The list shows
            <strong> Lovable AI</strong> by default, plus your own
            <strong> Gemini</strong> / <strong>Groq</strong> models when you
            enter their API keys above.
          </p>
          <div className="space-y-4 rounded-lg border border-border p-4">
            <BookModelPicker
              label="Single paragraph analysis"
              hint="Used when you tap ✨ Analyze under one paragraph."
              value={coerceBookModel(settings.bookSingleAnalysisModelRef ?? settings.bookSingleAnalysisModel)}
              onChange={(ref) =>
                update({
                  bookSingleAnalysisModelRef: ref,
                  // Keep the legacy gateway model in sync when the user picks
                  // a gateway model so older code paths keep working.
                  ...(ref.provider === 'gateway'
                    ? { bookSingleAnalysisModel: ref.model as typeof settings.bookSingleAnalysisModel }
                    : {}),
                })
              }
              options={getAvailableBookModels(settings)}
            />
            <BookModelPicker
              label="Whole-chapter batch analysis"
              hint="Used by the ✨ icon in the reader header (analyze every paragraph at once). Pick a faster/cheaper model here."
              value={coerceBookModel(settings.bookBatchAnalysisModelRef ?? settings.bookBatchAnalysisModel)}
              onChange={(ref) =>
                update({
                  bookBatchAnalysisModelRef: ref,
                  ...(ref.provider === 'gateway'
                    ? { bookBatchAnalysisModel: ref.model as typeof settings.bookBatchAnalysisModel }
                    : {}),
                })
              }
              options={getAvailableBookModels(settings)}
            />
            <BookModelPicker
              label="Chapter rewrite (summary, key points, simplified…)"
              hint="Used by the wand 🪄 button. Stronger reasoning models give better summaries."
              value={coerceBookModel(settings.bookRewriteModelRef ?? settings.bookRewriteModel)}
              onChange={(ref) =>
                update({
                  bookRewriteModelRef: ref,
                  ...(ref.provider === 'gateway'
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
            Choose which AI handles each app section. Lovable AI is always available;
            adding your Gemini/Groq keys above unlocks more options.
          </p>
          <div className="space-y-4 rounded-lg border border-border p-4">
            <BookModelPicker
              label="News rewrite (long & maximum article digest)"
              hint="Used by the AI digest button on the News page and the per-article rewrite tabs."
              value={coerceBookModel(settings.newsRewriteModelRef ?? settings.bookRewriteModelRef ?? 'google/gemini-3-flash-preview')}
              onChange={(ref) => update({ newsRewriteModelRef: ref })}
              options={getAvailableBookModels(settings)}
            />
            <BookModelPicker
              label="News topic search summaries"
              hint="Used when fetching headlines for a topic / site source."
              value={coerceBookModel(settings.newsSearchModelRef ?? 'google/gemini-3.1-flash-lite-preview')}
              onChange={(ref) => update({ newsSearchModelRef: ref })}
              options={getAvailableBookModels(settings)}
            />
            <BookModelPicker
              label="Sentence Lab (planner, roleplay, examples)"
              hint="Used by the planner and roleplay generators in Sentence Lab."
              value={coerceBookModel(settings.sentenceLabModelRef ?? 'google/gemini-3-flash-preview')}
              onChange={(ref) => update({ sentenceLabModelRef: ref })}
              options={getAvailableBookModels(settings)}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">حرکات لمسی روی پاراگراف‌ها</h2>
          <p className="text-sm text-muted-foreground">
            با فعال‌سازی این حالت، دکمه‌های زیر هر پاراگراف (ترجمه، پردازش، بلندگوها) حذف می‌شوند
            تا متن مثل یک کتاب عادی فشرده و خوانا شود. در عوض، با حرکات لمسی روی هر پاراگراف کار می‌کنی.
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
                    <span className="font-semibold text-foreground">Swipe به راست ←</span> نمایش / مخفی کردن
                    ترجمه فارسی.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Swipe به چپ →</span> نمایش ترجمه + پردازش
                    کامل (لغت‌ها، اصطلاحات، گرامر).
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">دوبار زدن (Double-tap):</span> اگر روی
                    متن انگلیسی بزنی، انگلیسی را با صدا می‌خواند؛ روی فارسی بزنی، فارسی را می‌خواند.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">نگه داشتن (Long-press):</span> متن
                    پاراگراف را کپی می‌کند و آن را ستاره‌دار می‌کند (دوباره نگه داری، ستاره برداشته می‌شود).
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
                value={settings.paragraphTextAlign ?? 'start'}
                onValueChange={(v) => update({ paragraphTextAlign: v as 'start' | 'justify' | 'center' })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="start">از ابتدا (پیش‌فرض)</SelectItem>
                  <SelectItem value="justify">هم‌تراز دوطرفه (Justify)</SelectItem>
                  <SelectItem value="center">وسط‌چین</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
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
                    {o.hint && (
                      <span className="text-xs text-muted-foreground">{o.hint}</span>
                    )}
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
