## Plan: Clarify AI model settings & add per-feature model pickers

### 1. Settings page — clarify "Default Gemini model"
- Rename label from "مدل پیش‌فرض Gemini" to "مدل تست Gemini (فقط برای تست کلید)"
- Add Persian helper text: "این مدل فقط برای دکمه تست کلید Gemini استفاده می‌شود. هر بخش (زیرنویس، کتاب، خبر) مدل اختصاصی خودش را در پایین دارد."

### 2. News rewrite — add inline model picker
- In `src/pages/NewsArticle.tsx` (or the news rewrite component), add a compact model selector next to the rewrite button — same UX as `ChapterRewriteTabs` shows ("AI: <model> · change in Settings")
- Also add a small dropdown to switch model on the fly (writes back to `settings.newsRewriteModelRef` via `useSettingsStore.update`)
- The selected model persists in settings

### 3. Separate batch analyze models
- Confirm current state: subtitles batch uses `batchModel`; books batch uses `paragraphBatchModelRef`/`bookBatchAnalysisModelRef`; news batch currently reuses the book one
- Add a dedicated `newsBatchAnalysisModelRef` in `settingsStore` defaults and `AppSettings` type
- Add its picker in Settings under the News section
- Wire news batch analysis call to use the new ref (fallback to book ref if unset)

### 4. Persian explanations under each model picker in Settings
For each model selector in `src/pages/Settings.tsx`, add a one-line Persian description below it:
- **مدل تست Gemini** — "فقط برای تست کلید Gemini"
- **Analyze (subtitle)** — "تحلیل جمله‌ی فعلی زیرنویس فیلم"
- **Quick translation** — "ترجمه‌ی سریع جمله/کلمه در زیرنویس فیلم (فقط فیلم)"
- **Word meaning** — "معنی کلمه با ضربه روی کلمه در زیرنویس"
- **Batch analyze (subtitle)** — "تحلیل گروهی همه‌ی جمله‌های یک زیرنویس"
- **Book single analysis** — "تحلیل یک پاراگراف کتاب"
- **Book batch analysis** — "تحلیل گروهی همه‌ی پاراگراف‌های یک فصل کتاب"
- **Book rewrite** — "بازنویسی فصل کتاب به سبک‌های مختلف"
- **News rewrite** — "بازنویسی خبر (خلاصه، ساده، طولانی، …)"
- **News batch analysis** (new) — "تحلیل گروهی پاراگراف‌های یک خبر"

### Files to edit
- `src/pages/Settings.tsx` — relabel test model, add Persian helpers, add news batch picker
- `src/store/settingsStore.ts` — add `newsBatchAnalysisModelRef` default
- `src/types/index.ts` — add `newsBatchAnalysisModelRef` field
- `src/pages/NewsArticle.tsx` (or wherever news rewrite UI lives) — add inline model picker
- News batch analysis call site — read from `newsBatchAnalysisModelRef` with book fallback

### Out of scope
- No changes to subtitles/books behavior — only labeling and a single new news-batch setting
- Doesn't remove the legacy `geminiModel` field (kept for backward compat with the test button)
