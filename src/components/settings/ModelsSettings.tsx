import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  chatModelOptions,
  choiceToValue,
  valueToChoice,
  getAvailableBookModels,
  coerceBookModel,
  getGeminiModels,
  getGroqWhisperModels,
} from "@/lib/aiModels";
import { useSettingsStore } from "@/store/settingsStore";
import { BookModelPicker } from "./BookModelPicker";
import { ModelPicker } from "./ModelPicker";

export function ModelsSettings() {
  const { settings, update } = useSettingsStore();

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Models per task</h2>
        <p className="text-sm text-muted-foreground">
          Choose which model handles each AI task. Mix Gemini and Groq — Groq is faster, Gemini Pro
          is stronger on nuance.
        </p>
        <div className="space-y-4 rounded-lg border border-border p-4">
          <ModelPicker
            label="Subtitle analysis (vocabulary & idioms)"
            value={choiceToValue(settings.analyzeModel)}
            options={chatModelOptions(settings)}
            onChange={(v) => update({ analyzeModel: valueToChoice(v) })}
          />
          <p className="text-[11px] text-muted-foreground -mt-2">تحلیل جمله‌ی فعلی زیرنویس فیلم.</p>
          <ModelPicker
            label="Quick translation (word / sentence)"
            value={choiceToValue(settings.translateModel)}
            options={chatModelOptions(settings)}
            onChange={(v) => update({ translateModel: valueToChoice(v) })}
          />
          <p className="text-[11px] text-muted-foreground -mt-2">
            ترجمه‌ی سریع جمله/کلمه — فقط در زیرنویس فیلم استفاده می‌شود (کتاب و خبر مدل جداگانه
            دارند).
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
            onChange={(v) => update({ transcribeModel: v as typeof settings.transcribeModel })}
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
          <strong> Gemini</strong> / <strong>Groq</strong> models when you enter their API keys
          above.
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
                ...(ref.provider === "gateway"
                  ? {
                      bookSingleAnalysisModel: ref.model as typeof settings.bookSingleAnalysisModel,
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
                      bookBatchAnalysisModel: ref.model as typeof settings.bookBatchAnalysisModel,
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
          Choose which AI handles each app section. Lovable AI is always available; adding your
          Gemini/Groq keys above unlocks more options.
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
            value={coerceBookModel(settings.sentenceLabModelRef ?? "google/gemini-3-flash-preview")}
            onChange={(ref) => update({ sentenceLabModelRef: ref })}
            options={getAvailableBookModels(settings)}
          />
        </div>
      </section>
    </div>
  );
}
