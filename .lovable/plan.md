# تکمیل موارد باقی‌مانده مهاجرت پروژه

در مرحله قبل فایل‌ها و dependencyها منتقل شدند ولی این موارد ناتمام بود. این پلن همه را تکمیل می‌کند:

## ۱. فعال‌سازی Lovable Cloud
- فراخوانی `supabase--enable` تا backend فعال شود
- این کار `VITE_SUPABASE_URL`، `VITE_SUPABASE_PUBLISHABLE_KEY` و `SUPABASE_SERVICE_ROLE_KEY` را به‌صورت خودکار تنظیم می‌کند
- بازنویسی `src/integrations/supabase/client.ts` در صورت نیاز تا از env vars جدید استفاده کند (نه hardcoded keyهای پروژه قبلی)

## ۲. اعمال ۱۷ migration SQL
فایل‌های `supabase/migrations/2026*.sql` از پروژه مبدأ کپی شده‌اند ولی روی دیتابیس اجرا نشده‌اند. باید:
- محتوای هر migration بررسی شود (جدول‌ها، RLS policies، functions، triggers، storage buckets)
- یک migration یکپارچه ساخته شود که همه را اعمال کند
- بررسی conflict با schema پیش‌فرض Lovable Cloud (auth.users, profiles احتمالی)

## ۳. استقرار ۲۴ Edge Function
لیست توابع:
```
analyze-paragraph, elevenlabs-tts, generate-language-chapter,
leitner-enrich-folder, leitner-generate-example, leitner-generate-image,
news-digest, news-discover-rss, news-fetch-rss, news-import-url,
news-scrape-article, news-search, news-trending, news-youtube-channel,
rewrite-chapter, sentence-auto-example, sentence-batch-complete,
sentence-grammar-examples, sentence-planner, sentence-roleplay,
sentence-scenario-chat, sentence-scenario-generate, sentence-tts-upload
```
- فایل‌ها در `supabase/functions/**` موجودند و خودکار با هر deploy منتشر می‌شوند
- نیاز به افزودن secrets: `LOVABLE_API_KEY` (برای AI Gateway)، `ELEVENLABS_API_KEY`، `GEMINI_API_KEY`، `GROQ_API_KEY` و هرچه در کد توابع به `Deno.env.get(...)` ارجاع داده شده

## ۴. اسکن secrets مورد نیاز
- `grep -rn "Deno.env.get" supabase/functions/` برای استخراج لیست کامل
- از کاربر فقط کلیدهایی که Lovable AI Gateway پوشش نمی‌دهد پرسیده می‌شود (ElevenLabs, Gemini مستقیم، Groq) — برای OpenAI/Anthropic/Gemini از AI Gateway استفاده می‌کنیم

## ۵. تأیید routing
- چون `src/routes/$.tsx` همه URLها را به `App.tsx` (با react-router-dom داخلی) می‌سپارد، باید verify شود همه ۲۷ صفحه قابل دسترس‌اند
- بررسی console برای خطاهای runtime

## ۶. رفع موارد ناسازگار با Cloudflare Worker
- PWA / Service Worker / Workbox: غیرفعال می‌مانند (در Worker قابل ارائه نیستند)
- Capacitor: dependencyها نصب‌اند ولی فقط برای build native استفاده می‌شوند، روی web تأثیری ندارند
- بررسی هر import از `node:` modules که در Worker پشتیبانی نمی‌شود

## ۷. بررسی build و typecheck
- اجازه می‌دهیم harness خودکار build بزند و خطاها را رفع می‌کنیم
- اگر TypeScript error در فایل‌های منتقل‌شده باشد، یا با cast سریع یا با `@ts-ignore` نقطه‌ای رفع می‌شود (هدف: حفظ منطق دست‌نخورده)

## ترتیب اجرا
1. فعال‌سازی Cloud
2. درخواست secrets غیر-Gateway از کاربر
3. ایجاد migration یکپارچه و اعمال
4. Deploy edge functions
5. تست preview و رفع خطاهای console

## محدودیت‌ها (اطلاع به کاربر)
- PWA install، offline-first و push notifications کار نمی‌کنند
- ساخت اپ موبایل Capacitor نیاز به export پروژه به GitHub دارد
- هر hardcoded Supabase URL/key از پروژه قبلی با کلیدهای جدید Cloud جایگزین می‌شود
