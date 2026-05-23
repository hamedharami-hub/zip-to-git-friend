## Goal

پروژه `sync-learn-player` (Vite + React Router DOM) که در zip فرستادید رو داخل همین پروژه TanStack Start منتقل کنیم. تمام منطق، کامپوننت‌ها، stores، lib، hooks، contexts، integrations و edge functions **بدون تغییر محتوایی** کپی می‌شوند. فقط لایه‌ی routing / entry / head / toaster با ساختار TanStack تطبیق داده می‌شود.

## محدوده‌ی پروژه‌ی مبدأ

- 27 صفحه در `src/pages/` (Home, Videos, Player, Settings, Leitner, Stats, Auth, Audio, Books, LanguageBooks, BookReader, Share, News, NewsArticle, NewsDigest, NotFound + 11 صفحه‌ی SentenceLab)
- ~70 کامپوننت در `src/components/` (به‌علاوه `ui/`)
- 22 hook، 10 zustand store، 1 context (`AuthContext`)
- ~60 ماژول در `src/lib/`
- `src/integrations/supabase/{client,types}` و `src/integrations/lovable`
- 24 Supabase Edge Function و 17 migration SQL در `supabase/`
- وابستگی‌های اضافه: `react-router-dom`, `@radix-ui/react-toast`, `zustand`, `epubjs`, `idb`, `jszip`, `next-themes`, `recharts`, `embla-carousel-react`, `vaul`, `cmdk`, `input-otp`, `react-day-picker`, `react-hook-form`, `@hookform/resolvers`, `@supabase/supabase-js`, `@lovable.dev/cloud-auth-js`, `lucide-react`, `date-fns`, `react-window`, `tailwindcss-animate`, `@tailwindcss/typography`, `sonner`, `class-variance-authority`, `clsx`, `tailwind-merge`, `zod`

## استراتژی کلی

پروژه‌ی فعلی TanStack Start با Tailwind v4 و SSR روی Cloudflare Worker است. مبدأ Tailwind v3 + JSX `lazy` + `BrowserRouter` + `Toaster (radix)` است. این‌ها سه نقطه‌ی برخورد دارند که باید با شیم تطبیق داده شوند تا «بقیه‌ی کد دست‌نخورده» بماند:

1. **Routing**: به‌جای `BrowserRouter/Routes/Route`، برای هر صفحه یک فایل route در `src/routes/` ساخته می‌شود که همان کامپوننت `src/pages/...` را render می‌کند. خود فایل‌های `src/pages/...` بدون تغییر باقی می‌مانند (TanStack مجاز است صفحات را از `src/pages/` import کند، فقط نباید آنجا route تعریف شود).
2. **Toaster**: مبدأ از `@/components/ui/toaster` (مبتنی بر radix-toast + `useToast`) استفاده می‌کند. این فایل و hook `use-toast.ts` به‌همراه `@radix-ui/react-toast` کپی/نصب می‌شوند تا importهای موجود کار کنند. `sonner` هم به‌صورت موازی نگه داشته می‌شود (همان‌طور که در App.tsx اصلی هست).
3. **Tailwind**: مبدأ Tailwind v3 + `tailwind.config.ts` + `tailwindcss-animate` + `@tailwindcss/typography` دارد. چون پروژه‌ی فعلی v4 است و کل توکن‌ها از `src/styles.css` می‌آیند، نیاز است:
   - `tailwind.config.ts` و `postcss.config.js` مبدأ کپی شوند و pluginهای typography/animate نصب شوند.
   - یا — راه ساده‌تر — همان `src/styles.css` فعلی نگه داشته شود ولی توکن‌های رنگ/فونت/keyframe پروژه‌ی مبدأ (`src/index.css` و `tailwind.config.ts`) به‌صورت معادل v4 اضافه شوند. **این پلن گزینه‌ی اول را انتخاب می‌کند** (نصب Tailwind v3 در کنار حذف v4) چون «بدون تغییر کد UI» را تضمین می‌کند.

## مراحل اجرا

### 1) آماده‌سازی وابستگی‌ها
- حذف `@tanstack/react-start` نمی‌شود (لازم برای entry فعلی)، اما:
- نصب پکیج‌های مبدأ که در پروژه‌ی فعلی نیستند:  
  `react-router-dom @radix-ui/react-toast zustand epubjs idb jszip next-themes recharts embla-carousel-react vaul cmdk input-otp react-day-picker react-hook-form @hookform/resolvers @supabase/supabase-js @lovable.dev/cloud-auth-js date-fns react-window @types/react-window @tailwindcss/typography tailwindcss-animate sonner class-variance-authority clsx tailwind-merge zod lucide-react react-resizable-panels`  
  (هرکدام که از قبل هست skip می‌شود.)
- نکته: `react-router-dom` فقط نصب می‌شود تا importهای موجود در صفحات (`useNavigate`, `Link`, `useParams` از `react-router-dom`) بشکنند نخورند. در سطح route این‌ها داخل یک `BrowserRouter` در `__root.tsx` پیچیده می‌شوند.

### 2) کپی فایل‌های مبدأ به پروژه (بدون تغییر محتوایی)
- `src/pages/**` → `src/pages/**`
- `src/components/**` (شامل `ui/**` — overrideی فعلی) → `src/components/**`
- `src/hooks/**` → `src/hooks/**`
- `src/lib/**` → `src/lib/**`
- `src/store/**` → `src/store/**`
- `src/contexts/AuthContext.tsx` → همان مسیر
- `src/integrations/**` → `src/integrations/**`
- `src/App.css`, `src/index.css` → کپی
- `public/**` (favicon, icons, robots) → `public/**`
- `supabase/functions/**` و `supabase/migrations/**` → `supabase/**`
- `capacitor.config.ts`, `components.json` → root

### 3) تطبیق routing با TanStack
- `__root.tsx` بازنویسی می‌شود تا کل درخت App.tsx مبدأ (QueryClientProvider, TooltipProvider, Toaster, Sonner, AuthProvider, SettingsBootstrap, SyncBridge, BrowserRouter, NativeGestures) را در بر بگیرد و `<Outlet />` را به‌جای `<Routes>` بگذارد.
- برای هر مسیر، یک فایل سبک در `src/routes/` ساخته می‌شود که فقط:
  ```tsx
  import Home from '@/pages/Home';
  export const Route = createFileRoute('/')({ component: Home });
  ```
  فهرست فایل‌ها (نام دقیق برای flat dot-naming):
  - `index.tsx` → Home
  - `videos.tsx`, `auth.tsx`, `leitner.tsx`, `stats.tsx`, `audio.tsx`, `books.tsx`, `language-books.tsx`, `news.tsx`, `settings.tsx`, `share.tsx`
  - `player.$videoId.tsx` → Player
  - `books.$bookId.tsx` → BookReader
  - `news.$articleId.tsx` → NewsArticle, `news.digest.tsx` → NewsDigest
  - `sentence-lab.tsx` (index), `sentence-lab.general.tsx`, `sentence-lab.planner.tsx`, `sentence-lab.leitner.tsx`, `sentence-lab.admin.tsx`
  - `sentence-lab.domain.$domain.tsx`, `sentence-lab.path.$pathId.tsx`, `sentence-lab.path.$pathId.drill.tsx`, `sentence-lab.scenario.$.tsx`, `sentence-lab.$categorySlug.tsx`
  - `notFoundComponent` در `__root` به `NotFound` صفحه‌ی مبدأ point می‌شود.
- چون صفحات از `react-router-dom` (`useParams`, `useNavigate`, `Link`) استفاده می‌کنند، یک `BrowserRouter` در `__root.tsx` کل `<Outlet />` را می‌پیچد. این کار باعث می‌شود مسیریابی واقعی توسط TanStack انجام شود ولی hookهای `react-router-dom` در صفحات کار کنند (URL یکسان از history می‌خوانند). ⚠️ اگر این روش با SSR ناسازگار باشد، fallback این است که در هر route، `params` از `Route.useParams()` گرفته و به‌صورت prop به کامپوننت page پاس داده شود؛ اما این مستلزم تغییر صفحات می‌شود. برای حفظ شرط «بدون تغییر»، روش اول اولویت دارد و در صورت بروز خطای SSR، صفحات player/bookReader/sentence-lab به route-level params مهاجرت محدود می‌شوند.

### 4) Entry و SSR
- `src/router.tsx` همان QueryClient فعلی را نگه می‌دارد (per-request).
- `src/start.ts` و `src/server.ts` دست‌نخورده.
- صفحات مبدأ بسیاری از `window`, `localStorage`, `idb` در سطح ماژول استفاده می‌کنند → کل صفحات با dynamic import (مشابه `lazy` در App.tsx مبدأ) از `__root.tsx` بارگذاری می‌شوند تا SSR نشکند. در فایل route از `component: lazyRouteComponent(() => import('@/pages/Foo'))` استفاده می‌شود.

### 5) Tailwind / Styles
- `src/styles.css` فعلی حذف نمی‌شود ولی محتوای `src/index.css` مبدأ به آن append می‌شود.
- `tailwind.config.ts` مبدأ کپی می‌شود و در `vite.config.ts` اگر پلاگین Tailwind v4 فعال است، با pipeline v3 جایگزین می‌شود (`postcss.config.js` + `tailwindcss` v3). این تنها بخش پیکربندی است که از پروژه‌ی فعلی دور می‌شود.

### 6) Env و Cloud
- مقادیر `VITE_SUPABASE_URL` و `VITE_SUPABASE_PUBLISHABLE_KEY` لازم است؛ اگر Lovable Cloud این پروژه فعال نیست، باید فعال شود تا این متغیرها در دسترس باشند. Edge functions و migrations مبدأ هم پس از اتصال Cloud باید deploy شوند (یک مرحله‌ی جداگانه پس از build سبز).

### 7) اعتبارسنجی
- اجرای build سبز.
- باز کردن preview روی `/`, `/videos`, `/leitner` و بررسی console برای خطای SSR/window.

## محدودیت‌ها و ریسک‌ها

1. **شرط «هیچ تغییری»**: لایه‌ی routing و head به‌ناچار تغییر می‌کند (فایل‌های route جدید + bridging `react-router-dom`). محتوای داخل `src/pages/**` تغییر نمی‌کند مگر اینکه روش bridging شکست بخورد.
2. **Capacitor**: ساخت native (`@capacitor/*`) در محیط Cloudflare Worker معنی ندارد؛ فایل کپی می‌شود ولی build صرفاً برای web است.
3. **PWA / Workbox**: `vite-plugin-pwa` با TanStack Start template به‌طور رسمی هماهنگ نیست؛ در فاز اول حذف می‌شود تا build بشکند نخورد. اگر بعداً لازم شد، جداگانه فعال‌سازی می‌شود.
4. **Edge Functions**: کد آن‌ها کپی می‌شود ولی deploy باید پس از اتصال Cloud انجام شود.
5. **حجم کار**: ~200 فایل کپی + ~25 route جدید + 1 bridging در `__root.tsx`. عملیات سنگین اما مکانیکی است.

## تحویل نهایی

- پروژه build می‌شود و همه‌ی مسیرهای مبدأ روی همان URLها در preview قابل دسترسی‌اند.
- منطق UI/داده/استورها/AI/lib کاملاً دست‌نخورده.
- یک یادداشت بعد از اجرا: «PWA و Capacitor غیرفعال‌اند؛ Edge functions کپی شده ولی نیاز به deploy دارند».

پس از تأیید این پلن، اجرا را شروع می‌کنم.
