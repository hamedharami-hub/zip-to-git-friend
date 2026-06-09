# پلن اجرای ۶ مورد درخواستی

## ۱. تکمیل موارد باقی‌مانده از پلن قبلی
- **منوی تنظیمات یکپارچه ⚙ در صفحه خبر** (`NewsArticle.tsx` + کامپوننت جدید `NewsReaderSettings.tsx`):
  - بالا فقط بماند: دکمه برگشت، عنوان کوتاه، تغییر زبان (FA/EN/دو) به‌صورت سه دکمه فشرده، دکمه پخش (TTS)، آیکن ⚙.
  - داخل ⚙: تم (روز/شب/کاغذ)، اندازه فونت (۵ پله)، نوع فونت، چینش متن، ستاره‌دار کردن، باز کردن لینک منبع/یوتیوب، بازترجمه از اول، بازخوانی کامل، بازپردازش AI.
- **MediaSession** برای پخش TTS (hook `useMediaSession.ts` موجود است؛ به `ChapterTTSPlayer.tsx` وصل می‌شود) تا کنترل پخش/توقف در نوتیفیکیشن گوشی بیاید + عنوان مقاله.

## ۲. ساده‌سازی نوار بالای HTML خروجی
- در `NewsShareMenu.tsx → buildBilingualHtml`:
  - بالا فقط سه دکمه زبان (دو / فا / EN) بماند.
  - بقیه (تم، فونت، اندازه، چینش) داخل یک دکمه ⚙ به‌صورت popover/details ساده با همان CSS inline.
  - تنظیمات باز/بسته شدن منو + کلیک خارج برای بستن.

## ۳. زوم با دو انگشت برای تغییر اندازه فونت
- **در HTML خروجی**: یک listener کوچک `touchstart/touchmove` که فاصله بین دو انگشت را اندازه‌گیری می‌کند و `--fs` را بین ۱۲ تا ۲۸ تنظیم می‌کند (و در localStorage ذخیره).
- **در صفحه خبر**: همان منطق در `NewsArticle.tsx` روی container متن، با به‌روزرسانی state اندازه فونت که از `NewsTypographyMenu` می‌آید.

## ۴. منوی نگه‌داشتن (long-press) روی پاراگراف
- اضافه‌کردن منو context روی هر `<p>/<h*>` در `InteractiveBookText.tsx` (از hook `useLongPress` موجود).
- گزینه‌ها:
  - 🔊 خواندن همین پاراگراف
  - ▶️ خواندن از این پاراگراف تا توقف
  - ⏹ توقف خواندن
  - 📋 کپی متن
  - 🌐 ترجمه/پردازش مجدد
- خواندن از این پاراگراف تا توقف از طریق `chapterAnalysisBus`/`paragraphSpeechBus` به `ChapterTTSPlayer` سیگنال می‌دهد که از index مشخص شروع کند.

## ۵. رفع ارور TTS آنلاین ElevenLabs و Gemini
- بررسی edge functionهای `elevenlabs-tts` و (در صورت وجود) `gemini-tts`؛ بررسی logها با `supabase--edge_function_logs`.
- اصلاح: احتمالاً CORS، یا فرمت body، یا میدل turbo برای فارسی + voiceId مناسب.
- برای Gemini: استفاده از `gemini-2.5-flash-tts` یا preview voice مناسب از طریق Lovable AI Gateway.

## ۶. افزودن TTS providerهای جدید
- در `Settings.tsx`: بخش جدید "TTS آنلاین" که از کاربر API key می‌گیرد برای:
  - Microsoft Azure Speech (کلید + region)
  - Hugging Face Inference (کلید + model id)
  - Play.ht (کلید + userId)
  - OpenTTS (URL سرور self-hosted)
- ذخیره در `settingsStore` (localStorage).
- ۴ تابع جدید در `src/lib/`:
  - `azureTts.ts` — REST `cognitiveservices/voices/list` + SSML با locale `fa-IR` (`fa-IR-DilaraNeural`/`fa-IR-FaridNeural`) و `en-US`.
  - `huggingfaceTts.ts` — POST به مدل (پیش‌فرض `facebook/mms-tts-fas` / `facebook/mms-tts-eng`).
  - `playhtTts.ts` — `/api/v2/tts/stream` با voiceهای فارسی/انگلیسی.
  - `openTts.ts` — GET ساده با voice locale.
- در گزینه‌های انتخاب TTS (`ChapterTTSPlayer.tsx` و `ReaderTTSQuickSettings.tsx`) این provider‌ها اضافه می‌شوند، با فیلتر زبان (فارسی/انگلیسی) خودکار.

## ترتیب اجرا
۱) رفع باگ TTS فعلی (مورد ۵) → ۲) منوی long-press پاراگراف (۴) → ۳) ساده‌سازی HTML + پینچ زوم (۲،۳) → ۴) منوی ⚙ صفحه خبر + MediaSession (۱) → ۵) providerهای جدید TTS (۶).

## نکته
این حجم کار در چند پاسخ پشت‌سرهم انجام می‌شود. اگر می‌خواهی روی موارد مشخصی اول تمرکز کنم بگو، وگرنه از مورد ۵ (رفع باگ ElevenLabs/Gemini) شروع می‌کنم.
