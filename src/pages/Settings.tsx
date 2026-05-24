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
  }, [settings.geminiApiKey, settings.groqApiKey, settings.geminiTtsApiKey, settings.elevenLabsApiKey]);

  const save = async () => {
    await update({ geminiApiKey: gemini, groqApiKey: groq, geminiTtsApiKey: geminiTts, elevenLabsApiKey: elevenLabs });
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Library
            </Button>
          </Link>
          <h1 className="text-base font-medium">Settings</h1>
          <InstallButton />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Appearance</h2>
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="font-medium">Theme</p>
              <p className="text-sm text-muted-foreground">Switch between dark and light.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => update({ theme: isDark ? 'light' : 'dark' })}
            >
              {isDark ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
              {isDark ? 'Light' : 'Dark'}
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">برنامه و آفلاین</h2>
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
