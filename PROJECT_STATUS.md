# Project Status

تاریخ: ۲۰۲۶-۱۰-۰۵

## ۱. کارهای انجام‌شده

### زیرساخت

- مهاجرت از Lovable به اکوسیستم گوگل.
- فعال‌سازی Firebase با شناسه `gen-lang-client-0772842205` در منطقه `asia-southeast1`.
- پیکربندی ماژول‌های کلاینت `auth` و `firestore`.
- ایجاد `firebase-blueprint.json` و قوانین `firestore.rules` و استقرار آن‌ها.

### سلامت کد (۲۰۲۶-۱۰-۰۵)

- رفع **۱۳۵٬۴۰۲ خطای lint**. CI که پیش از این روی هر push قرمز بود، اکنون سبز است
  (اجرای `37303623474` با موفقیت کامل شد).
- جایگزینی دو بلوک `catch (err: any)` با `unknown` در مسیر احراز هویت Firebase.
- **رفع باگ حلقه بی‌پایان redirect در ورود با Google**: در `signInWithGoogle` شرط
  `isMobile` به‌تنهایی باعث می‌شد **هر خطایی** روی موبایل به `signInWithRedirect` برود
  (از جمله تنظیم اشتباه دامنه OAuth یا حساب غیرفعال) و کاربر بدون پیام خطا در حلقه گیر کند.
  اکنون فقط برای `auth/popup-blocked` و `auth/network-request-failed` redirect می‌کند و
  بقیه خطاها را rethrow می‌کند.

## ۲. وضعیت فعلی

- `npm run lint`، `npm run typecheck` و `npm run build` هر سه بدون خطا اجرا می‌شوند.
- احراز هویت روی Firebase است؛ اما **داده‌ها تقریباً به‌طور کامل روی Supabase باقی مانده‌اند**.

## ۳. وضعیت واقعی مهاجرت دیتابیس

برخلاف تصور اولیه، مهاجرت دیتابیس **تقریباً شروع نشده است**:

| لایه                       | وضعیت                           |
| -------------------------- | ------------------------------- |
| احراز هویت (Auth)          | انجام شده روی Firebase          |
| دیتابیس (Data)             | روی Supabase - ۱۲ جدول          |
| قوانین امنیتی              | `firestore.rules` مستقر شده     |
| توابع لبه (Edge Functions) | ۳۰ تابع روی Supabase باقی مانده |
| ذخیره‌سازی فایل (Storage)  | روی Supabase Storage            |

- **تنها** کدی که به Firestore می‌نویسد، `users/{uid}` در `FirebaseAuthContext` است
  (تنظیمات کاربر + پروفایل).
- ۱۲ جدول Supabase که هنوز در کد استفاده می‌شوند:
  `sentence_lab`, `sentence_progress`, `sentence_categories`, `books`,
  `sentence_paths`, `daily_quests`, `leitner_cards`, `sentence_flags`,
  `leitner_folders`, `user_settings`, `paragraph_analyses`, `book_chapters`.
- `firestore.rules` برای `leitner_folders`، `leitner_cards`، `books` و
  `sentence_progress` قانون `allow list` نوشته که با `resource.data` کار نمی‌کند
  (در کوئری‌ها `resource` در دسترس نیست). تا زمانی که این کوئری‌ها نوشته نشوند
  بی‌اثر است، اما **باید اصلاح شود** به شکل
  `allow list: if isSignedIn() && request.query.limit <= N && ...`.

## ۴. مسائل امنیتی باز

- **کلیدهای Supabase در تاریخچه git لو رفته است** (کامیت `431e985`).
  - `SUPABASE_PUBLISHABLE_KEY` و `SUPABASE_URL` در آن کامیت موجودند.
  - حذف از شاخه انجام شده ولی **در تاریخچه باقی است**.
  - **اقدام لازم از سمت کاربر:** در داشبورد Supabase کلید را باطل و تمدید کنید
    (Rotate/Regenerate). حذف از تاریخچه به‌تنهایی کافی نیست.
- کلید از نوع `publishable/anon` است (نه `service_role`) و به‌تنهایی دسترسی کامل
  نمی‌دهد، ولی چون در ریپوی عمومی دیده می‌شود باید تعویض شود.

## ۵. ناهماهنگی طراحی

- **زبان رابط کاربری نیمه‌فارسی و نیمه‌انگلیسی است**: در پیام‌های `toast`، ۳۳ پیام فارسی
  و ۳۱ پیام انگلیسی وجود دارد (مثلاً `"Analysis failed."` کنار `"ترجمه لغو شد."`).
  - توجه: متغیر `displayLang` فقط برای **زبان محتوای آموزشی** است، نه زبان رابط کاربری.
  - راه‌حل درست: یک لایه i18n سبک یا توابع پیام مرکزی، و انتخاب یک زبان برای کل رابط.
- ناهماهنگی جزئی: یک رنگ hardcoded خارج از توکن‌ها (`bg-emerald-500` در
  `GamificationHUD.tsx`) در کنار بقیه که از توکن استفاده می‌کنند.
- سیستم طراحی (توکن‌های CSS + افکت شیشه‌ای + ۴۹ کامپوننت shadcn) در مجموع سالم و منظم است.

## ۶. تک کار بعدی قابل اجرا

- تصمیم‌گیری درباره زبان رابط کاربری (فارسی یا انگلیسی) و سپس یکپارچه‌سازی پیام‌ها،
  و بعد آغاز مهاجرت جدول‌به‌جدول از Supabase به Firestore با پشتیبانی از داده‌های موجود.
