# Speed-Reading & Eye-Comfort Modes

اضافه کردن یک لایه‌ی مشترک «Reading Mode» به `NewsArticle` و `BookReader` که شامل ۸ تکنیک انتخاب‌شده می‌شه. همه از یک کامپوننت مشترک تغذیه می‌کنن.

## What the user gets

یک دکمه‌ی جدید ⚡ **«حالت مطالعه»** کنار دکمه‌های موجود (تنظیمات/TOC/TTS) در هدر مقاله و کتاب. با زدنش یک پنل باز می‌شه با ۴ تب:

**۱. Flash (فلش کلمات)**
- RSVP تک‌کلمه‌ای وسط صفحه با ORP (نقطه‌ی قرمز روی حرف بهینه).
- سوییچ Chunk Mode: ۱ / ۳ / ۵ کلمه‌ای.
- اسلایدر سرعت ۱۵۰–۹۰۰ WPM.
- Play/Pause، ±۱۰ کلمه، ری‌استارت، پروگرس‌بار.
- مکث خودکار روی نقطه/ویرگول.
- Fullscreen تیره برای تمرکز کامل.

**۲. Bionic**
- بولد کردن ابتدای هر کلمه (۴۰–۶۰٪ حروف، قابل تنظیم با اسلایدر «شدت»).
- پشتیبانی فارسی و انگلیسی (برای فارسی بر اساس مرز کلمات یونی‌کد).
- ترکیب‌شدنی با بقیه‌ی حالت‌های نمایشی.

**۳. Auto-Scroll + Ruler**
- اسکرول خودکار متن با WPM تنظیمی.
- خط راهنمای افقی نیمه‌شفاف وسط صفحه (Ruler).
- Pacer نقطه‌ای اختیاری روی خط فعلی.
- تپ برای Pause/Resume، اسلایدر سرعت زنده.

**۴. Focus**
- **Guided Highlight**: جمله‌ی فعلی رنگ پررنگ، بقیه کم‌رنگ (opacity 0.35). با تپ یا تایمر جلو می‌ره.
- **Focus Blur**: فقط پاراگراف فعلی واضح، بقیه blur(3px). سوییچ جدا.

**۵. Eye Comfort (همیشه در دسترس، حتی بدون حالت مطالعه)**
- پریست‌های آماده: Comfort / Sepia / Night / High-Contrast.
- کنترل جداگانه: اندازه فونت، فاصله خطوط (۱.۴–۲.۴)، عرض ستون (۴۵–۹۰ch)، فاصله حروف، فیلتر نور آبی (warm overlay).
- ذخیره در `settingsStore` و سینک ابری.

## Files

**New — مشترک بین news/book:**
- `src/components/reader/ReadingModeButton.tsx` — دکمه‌ی ورودی.
- `src/components/reader/ReadingModeSheet.tsx` — پنل با ۴ تب.
- `src/components/reader/modes/RsvpPlayer.tsx` — RSVP + Chunk، fullscreen، ORP.
- `src/components/reader/modes/BionicText.tsx` — رندر مجدد متن با `<b>` روی ابتدای کلمات.
- `src/components/reader/modes/AutoScrollRuler.tsx` — اسکرول خودکار + خط راهنما + pacer.
- `src/components/reader/modes/FocusOverlay.tsx` — Guided Highlight + Blur.
- `src/components/reader/EyeComfortPresets.tsx` — پریست‌ها + فیلتر نور آبی (overlay CSS).
- `src/lib/readingText.ts` — کمکی: استخراج متن plain از HTML/پاراگراف‌ها، توکنایز کلمات (fa+en)، محاسبه‌ی ORP index، chunk splitter.
- `src/lib/bionic.ts` — منطق بولد کردن ابتدای کلمات با شدت متغیر.
- `src/hooks/useReadingMode.ts` — state مشترک (mode، wpm، chunkSize، bionicIntensity، isFullscreen، currentIndex).

**Edit:**
- `src/pages/NewsArticle.tsx` — اضافه کردن `<ReadingModeButton>` در هدر؛ wrap کردن متن مقاله در `<ReadingModeHost>` تا Bionic/Focus/AutoScroll روی همون DOM اعمال بشه.
- `src/pages/BookReader.tsx` — همون کار برای متن فصل.
- `src/store/settingsStore.ts` + `src/lib/db.ts` — فیلدهای جدید: `reading.wpm`, `reading.chunkSize`, `reading.bionicEnabled`, `reading.bionicIntensity`, `reading.eyeComfortPreset`, `reading.lineHeight`, `reading.columnWidth`, `reading.blueLightFilter`.

## Technical notes

- RSVP از `requestAnimationFrame` با accumulator زمان استفاده می‌کنه تا در WPM بالا هم دقیق باشه. مکث اضافه روی توکن‌های پایان جمله (نقطه/؟/!/؟) × ۱.۵ و ویرگول × ۱.۲.
- ORP: برای کلمه‌ی طول n، ایندکس ≈ `Math.max(1, Math.floor(n * 0.35))`. حرف در اون ایندکس با رنگ قرمز و بقیه‌ی حروف چپ/راست‌چین با padding ثابت تا کلمه «نلغزه».
- Bionic روی TextNodes رندر می‌شه (نه innerHTML) تا HTML موجود (لینک/بولد/تصویر) نشکنه. با یک `MutationObserver` سبک روی تغییرات ترجمه.
- Guided Highlight: تقسیم پاراگراف‌ها با `paragraphSplit`، سپس جمله‌ها با regex مشترک (`.!?؟`)؛ span-wrap و کلاس `.rm-active` روی جمله‌ی فعلی.
- Auto-Scroll: `scrollBy` روی container مقاله با نرخ px/s محاسبه‌شده از WPM × میانگین ارتفاع خط.
- Blue-light: overlay ثابت `fixed inset-0 pointer-events-none bg-[#ffb066]/[opacity]` با mix-blend-multiply؛ شدت اسلایدر ۰–۴۰٪.
- Fullscreen RSVP از Fullscreen API + fallback CSS position:fixed.
- همه‌ی state ها در `settingsStore` ذخیره می‌شن → سینک ابری فعلی خودکار کار می‌کنه.
- بدون تغییر در business logic؛ فقط لایه‌ی presentation.

## Out of scope

- تغییر TTS یا ترجمه.
- تغییر layout هدر بجز اضافه‌کردن یک آیکن.
- ML-based sentence importance / eye-tracking.
