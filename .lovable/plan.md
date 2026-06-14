# کشف خبر زنده با Google Search Grounding

## این خاصیت چیست؟
مدل‌های Gemini (از جمله `google/gemini-3.5-flash`) یک ابزار داخلی به نام **Google Search Grounding** دارند. وقتی این ابزار در درخواست فعال شود، مدل قبل از پاسخ، خودش در گوگل جستجوی زنده انجام می‌دهد و نتایج تازه را همراه با لیست منابع (`groundingMetadata.groundingChunks` با `web.uri` و `web.title`) برمی‌گرداند. این یعنی محدود به دانش قدیمی مدل نیستیم و می‌توانیم خبرهای امروز را پیدا کنیم.

## آنچه ساخته می‌شود

### ۱. Edge Function جدید: `news-discover-live`
یک تابع جدید در `supabase/functions/news-discover-live/index.ts` که:
- ورودی: `{ topic: string, windowHours?: number, maxResults?: number }`
- مدل: `google/gemini-3.5-flash` از طریق Lovable AI Gateway
- در body درخواست، فیلد `tools: [{ google_search: {} }]` اضافه می‌شود تا گراندینگ فعال شود.
- system prompt: «جدیدترین خبرهای مرتبط با موضوع را در بازهٔ زمانی مشخص از وب پیدا کن. خروجی را با ابزار `emit_news` بفرست.»
- از tool-calling (مثل `news-digest`) برای دریافت خروجی ساخت‌یافته استفاده می‌کنیم:
  ```
  emit_news({
    items: [{ title, url, source, publishedAt?, summary }],
    combinedArticle?: { title, markdown }   // مقالهٔ ترکیبی
  })
  ```
- منابع را از `groundingMetadata` پاسخ هم استخراج می‌کنیم و با لیست مدل تلفیق می‌کنیم (برای اطمینان از لینک واقعی).
- خروجی: `{ items: [...], combinedArticle: {...}, model }`

### ۲. کلاینت: تابع `discoverLiveNews` در `src/lib/news.ts`
wrapper سادهٔ `supabase.functions.invoke('news-discover-live', { body })`.

### ۳. UI: دکمهٔ «کشف خبر» در صفحهٔ `src/pages/News.tsx`
- یک دکمهٔ جدید کنار جستجو/Discovery فعلی با آیکون Sparkles و متن «کشف خبر زنده».
- زدن دکمه → دیالوگ کوچک با ورودی موضوع (پیش‌فرض از topic فعلی) + اسلایدر windowHours.
- بعد از پاسخ، دو بخش نمایش داده می‌شود:
  - **لیست منابع**: کارت‌های قابل کلیک — هر آیتم با کلیک روی آن، مثل سایر اخبار به `NewsArticle` با URL منبع می‌رود (از مسیر import موجود استفاده می‌کنیم).
  - **دکمهٔ «ساخت مقالهٔ ترکیبی»**: مقالهٔ تلفیقی بازگشتی از مدل را در یک view (مثل `NewsDigest`) نشان می‌دهد، با لیست منابع پاورقی.

### ۴. تنظیمات
هیچ تنظیم جدیدی لازم نیست؛ مدل ثابت `google/gemini-3.5-flash` در edge function تنظیم می‌شود.

## ملاحظات فنی
- اگر Lovable AI Gateway فیلد `tools: [{ google_search: {} }]` را به‌صورت native پاس‌ترو نکند، fallback: استفاده از prompt-only و واکشی URLها از پاسخ متنی — اما اول تست می‌کنیم. (برای Gemini روی Gateway، ابزار `google_search` پشتیبانی می‌شود.)
- خطاهای ۴۲۹ و ۴۰۲ مانند سایر توابع به UI گزارش می‌شوند (toast).
- نتیجه در حافظهٔ مرورگر cache می‌شود (مثل `getCachedDiscovery`) تا بار اضافه نزند.

## فایل‌های تغییر یافته
- `supabase/functions/news-discover-live/index.ts` (جدید)
- `src/lib/news.ts` (افزودن `discoverLiveNews`)
- `src/pages/News.tsx` (افزودن دکمه + دیالوگ + نمایش نتایج)
- `supabase/config.toml` (ثبت تابع جدید در صورت نیاز)
