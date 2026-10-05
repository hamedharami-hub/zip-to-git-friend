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

## ۶. نقشه مهاجرت دیتابیس (Supabase → Firestore)

### واقعیت دامنه

از `src/integrations/supabase/types.ts` استخراج شد: **۲۴ جدول**، حدود **۳۰۰ ستون**،
و **۵ تابع RPC** (منطق سمت سرور که در Firestore باید به Cloud Function تبدیل شود).

نکته: `firebase-blueprint.json` فعلی فقط **۵ موجودیت** دارد و پوشش کافی ندارد.

### دسته‌بندی بر اساس مالکیت داده

| گروه                 | جدول‌ها                                                                                                                                                          | رفتار در Firestore                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **خصوصی** (per-user) | `user_settings`, `profiles`, `user_gamification`, `user_achievements`, `scenario_sessions`, `scenario_saved_sentences`, `sentence_flags`, `news_blocked_domains` | زیر `users/{uid}/...` قرار می‌گیرند و با Rules کاربرمحور محافظت می‌شوند |
| **عمومی/مرجع**       | `sentence_lab`, `sentence_categories`, `sentence_paths`, `news_sources`, `news_folders`                                                                          | فقط‌خواندنی برای همه، نوشتن فقط با نقش admin                            |
| **ترکیبی**           | `books`, `book_chapters`, `paragraph_analyses`, `leitner_folders`, `leitner_cards`, `sentence_progress`, `daily_quests`, `news_articles`, `news_digests`         | بررسی جداگانه لازم دارند                                                |

### ترتیب پیشنهادی مهاجرت

هر مرحله باید کامل، تست‌شده و قابل بازگشت باشد.

**مرحله ۱ — کم‌ریسک (تنظیمات و پروفایل)**

- `user_settings` و `profiles` — همین حالا در `users/{uid}` نوشته می‌شوند؛ فقط باید
  نگاشت فیلد و حذف وابستگی به Supabase در `settingsStore` انجام شود.

**مرحله ۲ — داده‌های کاربر Leitner**

- `leitner_folders` و `leitner_cards` — قوانین Rules برایشان آماده شد.
- نیازمند: تصمیم درباره ساختار داده. پیشنهاد: `leitner_cards` به‌صورت زیرپوشه‌های
  `leitner_folders/{folderId}/cards/{cardId}` تا کوئری پوشه رایگان شود.

**مرحله ۳ — کتاب‌ها (حجیم‌ترین بخش)**

- `books`, `book_chapters`, `paragraph_analyses`
- ریسک: `paragraph_analyses` حجم بالایی دارد و نوشتن آن در `setDoc` با merge
  باعث هزینه زیاد Firestore می‌شود. باید بررسی شود آیا کش محلی (`useAICache`)
  مانع نوشتن تکراری می‌شود یا نه.

**مرحله ۴ — آموزش و پیشرفت**

- `sentence_progress`, `daily_quests`, `user_gamification`, `user_achievements`
- ۵ تابع RPC gamification باید به Cloud Functions یا منطق سمت کلاینت تبدیل شوند.

**مرحله ۵ — اخبار (پیچیده‌ترین)**

- `news_articles`, `news_digests`, `news_sources`, `news_folders`, `news_blocked_domains`
- ۳۰ تابع لبه Supabase این بخش را تغذیه می‌کنند؛ مهاجرت بدون جایگزینی آن‌ها
  شکست می‌خورد. این مرحله عملاً بازنویسی بک‌اند است.

### مواردی که پیش از شروع باید حل شوند

1. **تابع‌های RPC** — ۵ تابع وجود دارد که معادل آماده‌ای در Firestore ندارند.
2. **Storage** — `supabase/functions/news-scrape-article` و `audio-tts` فایل ذخیره می‌کنند.
   مهاجرت به Firebase Storage باید جداگانه برنامه‌ریزی شود.
3. **داده‌های موجود کاربران** — برای انتقال داده واقعی به اسکریپت export/import نیاز است.
4. **تناسب Firestore با این دامنه** — Firestore برای کوئری‌های پرتکرار و اسناد کوچک مناسب است،
   ولی برای لیست‌های بزرگ و sort-های پیچیده هزینه و محدودیت دارد. جدول `sentence_lab` به‌تنهایی
   ۲۲ ستون دارد و ساختار `news_articles` هم پیچیده است.
   **قبل از شروع مهاجرت باید بررسی شود آیا Cloud SQL انتخاب بهتری است.**

### قوانین امنیتی (انجام شد)

`firestore.rules` اصلاح شد:

- `allow list` دیگر به `resource.data` تکیه نمی‌کند. در عملیات `list`،
  متغیر `resource` تعریف نشده و استفاده از آن باعث خطای زمان اجرا می‌شود.
  به‌جای آن کوئری اعتبارسنجی می‌شود: `where("userId").isEqualTo(uid)` به‌همراه
  سقف `limit` برابر `MAX_LIST_LIMIT`.
- برای ۱۶ مسیر مهاجرت‌نشده عمداً `if false` گذاشته شد تا fail-closed باشد.

**نکته برای ادامه:** هر کوئری لیست در کلاینت باید حتماً شامل این دو باشد، وگرنه
Firestore درخواست را رد می‌کند:

```typescript
query(collection(db, "leitner_cards"), where("userId", "==", uid), limit(200));
```

## ۷. تک کار بعدی قابل اجرا

- تصمیم‌گیری درباره زبان رابط کاربری (فارسی یا انگلیسی) و سپس یکپارچه‌سازی پیام‌ها،
  و بعد آغاز مرحله ۱ مهاجرت (`user_settings` و `profiles`).
