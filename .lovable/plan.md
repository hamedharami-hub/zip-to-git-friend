# پلن بهبود بخش اخبار

## ۱. رفع باگ‌های TTS سرتیتر
**فایل‌ها:** `src/components/books/ChapterTTSPlayer.tsx`, `src/lib/batchAnalyzeChapter.ts`, `src/components/books/InteractiveBookText.tsx`

- هر `<h1>..<h6>` به‌عنوان یک واحد گفتاری مستقل قرار می‌گیرد (جدا از پاراگراف بعدی) تا با هم خوانده نشوند.
- منطق اسکرول `centerActiveParagraph` گسترش می‌یابد تا هدینگ‌ها و اولین پاراگراف بعد از هدینگ هم با کلید مشترک شناسایی شوند و در وسط صفحه قرار بگیرند.
- ایندکس‌گذاری speech event برای هدینگ‌ها هم‌تراز با پاراگراف‌ها می‌شود.

## ۲. منوی تنظیمات یکپارچه در صفحه خبر
**فایل جدید:** `src/components/news/NewsReaderSettings.tsx`
**ویرایش:** `src/pages/NewsArticle.tsx`

نوار بالای صفحه ساده می‌شود و فقط شامل: عنوان، دکمه «تغییر زبان» (تک‌کلیک toggle بین FA/EN/دوزبانه)، دکمه «خواندن» (TTS)، و یک دکمه چرخ‌دنده ⚙ که این Sheet را باز می‌کند:

- **تم مطالعه:** روز / شب / کاغذ (sepia)
- **اندازه فونت:** ۵ سطح
- **نوع فونت:** Sans/Serif/Vazir/Mono
- **چینش متن:** راست/چپ/وسط/justify
- **ستاره‌دار کردن خبر** (toggle)
- **باز کردن منبع:** دکمه‌های YouTube/لینک اصلی
- **ترجمه دوباره از اول** (پاک کردن کش ترجمه این مقاله)
- **خواندن دوباره از اول** (reset TTS index)
- **پردازش دوباره** (پاک کردن کش analysis)

## ۳. TTS کامپکت + MediaSession
**فایل:** `src/components/books/ChapterTTSPlayer.tsx`, `src/hooks/useMediaSession.ts`

- پنل گسترده فعلی به یک نوار باریک پایین صفحه (مثل mini-player) تبدیل می‌شود — حداکثر ۶۴px ارتفاع.
- دکمه‌های Play/Pause/Stop/Restart/Speed در یک ردیف.
- MediaSession API برای نمایش کنترل در نوتیفیکیشن بار (عنوان مقاله + actions: play, pause, stop, previoustrack=قبلی، nexttrack=بعدی).

## ۴. HTML اکسپورت قابل تنظیم
**فایل:** `src/components/news/NewsShareMenu.tsx`

داخل HTML اکسپورت‌شده یک toolbar چسبان بالا اضافه می‌شود با:
- زبان (FA/EN/دوزبانه)
- تم (روشن/تاریک/کاغذ)
- اندازه فونت (− / +)
- چینش (راست/چپ/وسط/justify)

همه با localStorage در خود فایل HTML ذخیره می‌شود (standalone، بدون وابستگی بیرونی).

## ۵. متن پردازش‌شده عمیق‌تر
**فایل:** `supabase/functions/analyze-paragraph/index.ts` (یا پرامپت معادل در `src/lib/batchAnalyzeChapter.ts`)

پرامپت بازنویسی می‌شود تا خروجی:
- توضیح مفهومی طولانی‌تر (۳-۵ پاراگراف به جای ۱-۲)
- bullet points از نکات کلیدی
- پس‌زمینه و context تاریخی/فنی
- ارتباط با مفاهیم مرتبط

## ترتیب اجرا
۱. رفع باگ TTS سرتیتر (سریع، تأثیر زیاد)
۲. منوی تنظیمات یکپارچه + ساده‌سازی header
۳. TTS کامپکت + MediaSession
۴. HTML اکسپورت با toolbar
۵. پرامپت پردازش عمیق‌تر

---

پس از تأیید، شروع می‌کنم. اگر بخشی اولویت پایین‌تری دارد بفرمایید تا حذف یا به مرحله بعد موکول شود.
