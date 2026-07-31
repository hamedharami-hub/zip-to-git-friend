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
import { useShallow } from "zustand/shallow";
import { useSettingsStore } from "@/store/settingsStore";
import { BookModelPicker } from "./BookModelPicker";
import { ModelPicker } from "./ModelPicker";
import { ModelVisibilityDialog } from "./ModelVisibilityDialog";

export function ModelsSettings() {
  const settings = useSettingsStore(useShallow((s) => s.settings));
  const update = useSettingsStore((s) => s.update);

  const geminiTestModelOptions = getGeminiModels(settings);
  const whisperOptions = getGroqWhisperModels(settings);

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Video & subtitles</h2>
        <p className="text-sm text-muted-foreground">
          These models run when you tap a subtitle cue, translate a phrase, batch-analyze a subtitle
          file, or transcribe audio.
        </p>
        <div className="space-y-4 rounded-lg border border-border p-4">
          <ModelPicker
            label="Subtitle analysis (vocabulary & idioms)"
            value={choiceToValue(settings.analyzeModel)}
            options={chatModelOptions(settings)}
            onChange={(v) => update({ analyzeModel: valueToChoice(v) })}
            hint="تحلیل جمله‌ی فعلی زیرنویس فیلم — هنگام باز کردن کارت تحلیل."
          />
          <ModelPicker
            label="Quick translation (word / sentence)"
            value={choiceToValue(settings.translateModel)}
            options={chatModelOptions(settings)}
            onChange={(v) => update({ translateModel: valueToChoice(v) })}
            hint="ترجمه‌ی سریع کلمه/جمله در زیرنویس فیلم."
          />
          <ModelPicker
            label="Batch analyze"
            value={choiceToValue(settings.batchModel)}
            options={chatModelOptions(settings)}
            onChange={(v) => update({ batchModel: valueToChoice(v) })}
            hint="تحلیل گروهی همه‌ی جمله‌های یک زیرنویس فیلم."
          />
          <ModelPicker
            label="Transcription (Groq Whisper)"
            value={settings.transcribeModel}
            options={whisperOptions}
            onChange={(v) => update({ transcribeModel: v as typeof settings.transcribeModel })}
            hint="مدل تبدیل صوت/ویدیو به متن. فقط با کلید Groq کار می‌کند."
          />
          <div className="space-y-1.5">
            <Label>مدل تست Gemini</Label>
            <Select
              value={settings.geminiModel}
              onValueChange={(v) => update({ geminiModel: v as typeof settings.geminiModel })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {geminiTestModelOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value} disabled={m.disabled}>
                    <span className="flex flex-col">
                      <span>{m.label}</span>
                      {(m.hint || m.disabledReason) && (
                        <span
                          className={`text-xs ${m.disabled ? "text-destructive/70" : "text-muted-foreground"}`}
                        >
                          {m.disabled ? m.disabledReason : m.hint}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              این مدل فقط برای دکمه‌ی «تست کلید Gemini» در همین صفحه استفاده می‌شود.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Books</h2>
        <p className="text-sm text-muted-foreground">
          Models used inside the EPUB/reader screens: single paragraph analysis, whole-chapter batch
          analysis, and chapter rewrites.
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
            hint="بازنویسی فصل کتاب به سبک‌های مختلف. مدل قوی‌تر، خلاصه‌ی بهتر."
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
        <h2 className="text-lg font-semibold">News</h2>
        <p className="text-sm text-muted-foreground">
          Models used in the news reader: article rewrites, batch paragraph analysis, topic
          headlines, and HTML export filenames.
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
            hint="تحلیل گروهی پاراگراف‌های یک خبر (دکمه ✨ بالای خبر)."
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
              settings.newsSearchModelRef ??
                settings.newsSummaryModelRef ??
                "google/gemini-3.1-flash-lite-preview",
            )}
            onChange={(ref) => update({ newsSearchModelRef: ref })}
            options={getAvailableBookModels(settings)}
          />
          <BookModelPicker
            label="News summary model"
            hint="خلاصه‌سازی تیترها و سرفصل‌های اخبار (در صورت استفاده از newsSummaryModelRef)."
            value={coerceBookModel(
              settings.newsSummaryModelRef ??
                settings.newsSearchModelRef ??
                "google/gemini-3.1-flash-lite-preview",
            )}
            onChange={(ref) => update({ newsSummaryModelRef: ref })}
            options={getAvailableBookModels(settings)}
          />
          <BookModelPicker
            label="Smart HTML filename"
            hint="پیشنهاد نام فارسی کوتاه برای فایل HTML خروجی خبر/متن."
            value={coerceBookModel(
              settings.htmlFilenameModelRef ?? "google/gemini-3.1-flash-lite-preview",
            )}
            onChange={(ref) => update({ htmlFilenameModelRef: ref })}
            options={getAvailableBookModels(settings)}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sentence Lab, podcast & shared</h2>
        <p className="text-sm text-muted-foreground">
          Shared models used across Sentence Lab exercises, the podcast generator, word meanings and
          generic paragraph analysis.
        </p>
        <div className="space-y-4 rounded-lg border border-border p-4">
          <BookModelPicker
            label="Sentence Lab (planner, roleplay, examples)"
            hint="برنامه‌ریز، نقش‌بازی و مثال‌سازی در Sentence Lab."
            value={coerceBookModel(settings.sentenceLabModelRef ?? "google/gemini-3-flash-preview")}
            onChange={(ref) => update({ sentenceLabModelRef: ref })}
            options={getAvailableBookModels(settings)}
          />
          <BookModelPicker
            label="Podcast / audio"
            hint="مدل تولید یا تحلیل محتوای پادکست/صوتی."
            value={coerceBookModel(settings.podcastModelRef ?? "google/gemini-3-flash-preview")}
            onChange={(ref) => update({ podcastModelRef: ref })}
            options={getAvailableBookModels(settings)}
          />
          <ModelPicker
            label="Word meaning"
            value={choiceToValue(
              settings.wordMeaningModel ?? {
                provider: "gemini",
                model: "gemini-3.1-flash-lite-preview",
              },
            )}
            options={chatModelOptions(settings)}
            onChange={(v) => update({ wordMeaningModel: valueToChoice(v) })}
            hint="معنی یک کلمه در هر جای برنامه که روی یک کلمه تپ می‌کنی."
          />
          <BookModelPicker
            label="Single paragraph analysis (shared fallback)"
            hint="تحلیل یک پاراگراف در خبر/کتاب وقتی مدل خاصی انتخاب نشده باشد."
            value={coerceBookModel(
              settings.paragraphAnalysisModelRef ?? "google/gemini-3-flash-preview",
            )}
            onChange={(ref) => update({ paragraphAnalysisModelRef: ref })}
            options={getAvailableBookModels(settings)}
          />
          <BookModelPicker
            label="Batch paragraph analysis (shared fallback)"
            hint="تحلیل گروهی پاراگراف‌ها در خبر/کتاب وقتی مدل خاصی انتخاب نشده باشد."
            value={coerceBookModel(
              settings.paragraphBatchModelRef ?? "google/gemini-3.1-flash-lite-preview",
            )}
            onChange={(ref) => update({ paragraphBatchModelRef: ref })}
            options={getAvailableBookModels(settings)}
          />
          <BookModelPicker
            label="Shared rewrite / article rewrite fallback"
            hint="بازنویسی مقاله‌ای/متنی در بخش‌های مختلف برنامه."
            value={coerceBookModel(settings.rewriteModelRef ?? "google/gemini-3-flash-preview")}
            onChange={(ref) => update({ rewriteModelRef: ref })}
            options={getAvailableBookModels(settings)}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">مدل‌های قابل نمایش</h2>
        <p className="text-sm text-muted-foreground">
          از اینجا مشخص کن در هر منوی انتخاب کدام مدل‌ها دیده شوند. مدل‌های غیرفعال (بدون کلید API)
          به‌صورت کم‌رنگ نشان داده می‌شوند و تا زمانی که کلید وارد نکنی قابل انتخاب نیستند.
        </p>
        <div className="rounded-lg border border-border p-4">
          <ModelVisibilityDialog />
        </div>
      </section>
    </div>
  );
}
