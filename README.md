# Lingua

اپلیکیشن یادگیری زبان مبتنی بر محتوای دلخواه (videos، podcasts، books، news) با قابلیت‌های فلش‌کارت Leitner، تمرین جمله‌سازی AI، و ابزارهای مطالعه.

## ویژگی‌ها

- **Leitner**: فلش‌کارت با الگوریتم spaced repetition.
- **Videos / Podcasts**: آپلود ویدیو/صوت با زیرنویس، shadowing و حالت blind listening.
- **Books**: مطالعه EPUB و فصل‌های متنی با ترجمه کلمه، آنالیز AI و TTS.
- **News**: خواندن اخبار با خلاصه و بازنویسی AI به زبان ساده.
- **Sentence Lab**: تمرین مکالمه و جمله‌سازی برای حوزه‌های مختلف (عمومی، پزشکی، دارویی).
- **AI**: استفاده از مدل‌های مختلف برای ترجمه، بازنویسی، تولید مثال و تمرین.
- **PWA**: قابل نصب روی دستگاه موبایل/دسکتاپ.

## تکنولوژی

- React 18 + TypeScript
- TanStack Start / React Router
- Tailwind CSS + shadcn/ui
- Vite 7
- Supabase (auth, database, storage, edge functions)
- Firebase (auth)
- Cloudflare Workers / Wrangler

## راه‌اندازی محلی

1. نیازمندی‌ها:
   - Node.js ≥ 22.12
   - npm یا bun

2. نصب وابستگی‌ها:
   ```bash
   npm install
   ```

3. ساخت فایل `.env` از روی `.env.example`:
   ```bash
   cp .env.example .env
   ```
   سپس مقادیر واقعی Supabase را در `.env` قرار دهید.

4. اجرای dev server:
   ```bash
   npm run dev
   ```
   برنامه در `http://localhost:8080` بالا می‌آید.

## اسکریپت‌ها

- `npm run dev` — اجرای dev server
- `npm run build` — build برای production
- `npm run lint` — بررسی ESLint
- `npm run format` — فرمت کل پروژه با Prettier

## همگام‌سازی Lovable ↔ GitHub

این پروژه با [Lovable](https://lovable.dev) ساخته شده و دوطرفه با GitHub همگام می‌شود:

- تغییرات در Lovable به شاخه `main` گیتهاب پوش می‌شوند.
- تغییرات پوش‌شده به `main` گیتهاب به Lovable برمی‌گردند.
- Lovable فقط یک شاخه را مدیریت می‌کند (`main`).
- اگر یک فایل همزمان در هر دو طرف تغییر کند، نسخه گیتهاب برنده است.

برای تنظیم یا بازنشانی اتصال: در Lovable بروید به **Project settings → Git → GitHub** و ریپوی `haramipours-glitch/zip-to-git-friend` را انتخاب کنید.

## نکات امنیتی

- **فایل `.env` نباید در git کامیت شود.**
- از `.env.example` به عنوان الگو استفاده کنید و `.env` را محلی نگه دارید.
- اگر کلیدهای Supabase قبلاً در تاریخچه git کامیت شده‌اند، در داشبورد Supabase آن‌ها را rotate کنید.

## مشارکت

برای اضافه کردن ویژگی جدید:

1. یک شاخه جدید بسازید.
2. تغییرات را کامیت کنید.
3. Pull Request به `main` بزنید.
4. پس از merge، Lovable تغییرات را از `main` دریافت می‌کند.

