# حالت «ساده‌سازی روزمره» متن انگلیسی

یک نسخه‌ی جدید بازنویسی به سیستم اضافه می‌کنیم که متن انگلیسی را با کلمات/عبارت‌ها/اصطلاحاتِ پرکاربردِ مکالمه‌ی روزمره بازنویسی می‌کند — بدون حذف هیچ نکته‌ای. سطح سختی در تنظیمات قابل‌انتخاب است. وقتی روشن باشد، متنِ نمایش‌داده‌شده به‌جای نسخه‌ی اصلی، نسخه‌ی ساده‌شده می‌شود (همان رفتاری که برای rewrite‌های فعلی وجود دارد).

## ۱) تنظیمات کاربر
- در `src/types/index.ts` و `src/store/settingsStore.ts` فیلد جدید اضافه می‌شود:
  - `simplifyLevel: 'a2-b1' | 'b1-b2'` (پیش‌فرض `a2-b1`)
- در `src/pages/Settings.tsx` یک کارت جدید «ساده‌سازی متن انگلیسی» با دو رادیو (مبتدی-متوسط / متوسط) و یک توضیح کوتاه فارسی اضافه می‌شود.

## ۲) Edge function `rewrite-chapter`
- یک style جدید به `STYLE_INSTRUCTIONS` اضافه می‌شود: `everyday_simple` (و حالت سطح متوسط `everyday_simple_b2`). دستور سیستمی:
  - زبانِ روزمره، جمله‌های کوتاه، اصطلاحات/phrasal verbs/collocations پرکاربرد.
  - **حفظ کامل تمام نکته‌ها، اعداد، اسم‌ها، نقل‌قول‌ها و ترتیب ایده‌ها** — حق حذف هیچ نکته‌ای ندارد.
  - طول خروجی تقریباً برابر متن اصلی (نه خلاصه).
- استایل قدیمی `simplified_english` دست‌نخورده می‌ماند (برای کسانی که خلاصه‌ی ساده می‌خواهند).

## ۳) خبر (`src/pages/NewsArticle.tsx`)
- `RewriteLength` به `'long' | 'max' | 'auto-max' | 'simple'` گسترش می‌یابد.
- تب چهارم «ساده 🟢» کنار تب‌های موجود اضافه می‌شود.
- در `handleRewrite('simple')` تابعِ خبر همان edge function را با style جدید (`everyday_simple` یا `everyday_simple_b2` بر اساس `simplifyLevel`) صدا می‌زند.
- در `news_digests`، رکورد با `length='simple'` ذخیره می‌شود (همان مکانیزم cache فعلی، نیازی به migration نیست — ستون `length` متنی است).
- اگر کاربر در تنظیمات «ساده‌سازی» را فعال کند (یک toggle بالا اضافه می‌کنیم: `defaultSimplifyArticles`)، با باز شدن خبر و وجود متن انگلیسی، تب simple خودکار ساخته/انتخاب می‌شود.

## ۴) کتاب (`src/components/books/ChapterRewriteTabs.tsx`)
- یک style جدید به لیست استایل‌های قابل‌انتخاب اضافه می‌شود: `everyday_simple` با عنوان «ساده‌سازی روزمره (کامل)».
- یک تیک بالای فهرست استایل‌ها: «ساده‌سازی روزمره با ذکر تمام نکته‌ها» — وقتی روشن شود، استایل را روی `everyday_simple` می‌گذارد و دکمه «بساز» را برجسته می‌کند.
- خروجی مثل بقیه‌ی rewrite‌ها در `book_chapter_rewrites` cache می‌شود (بدون تغییر اسکیما).

## ۵) راهنمای نمایش
- وقتی نسخه‌ی ساده فعال است، یک badge کوچک «ساده‌شده» بالای محتوا نشان داده می‌شود تا کاربر بداند متن اصلی نیست.

## جزئیات فنی
- بدون migration دیتابیس.
- بدون نیاز به secret جدید (از همان Lovable AI Gateway استفاده می‌شود).
- مدل پیش‌فرض: `google/gemini-3-flash-preview` (با امکان override از تنظیمات مدل‌ها).
- آفلاین: نتیجه پس از تولید در `newsOfflineCache` و IndexedDB کتاب ذخیره می‌شود — مثل بقیه‌ی rewrite‌ها.

## فایل‌های تغییریافته
- `src/types/index.ts` — افزودن `simplifyLevel` و `defaultSimplifyArticles`
- `src/store/settingsStore.ts` — مقادیر پیش‌فرض
- `src/pages/Settings.tsx` — UI تنظیمات
- `supabase/functions/rewrite-chapter/index.ts` — استایل جدید
- `src/pages/NewsArticle.tsx` — تب simple
- `src/components/books/ChapterRewriteTabs.tsx` — تیک + استایل جدید
- `src/lib/chapterRewrite.ts` — افزودن `everyday_simple` به نوع استایل‌ها
