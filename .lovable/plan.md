# پلن جامع حرفه‌ای‌سازی برنامه

بعد از ممیزی کامل کد، لاگ‌های Console، Auth، Linter دیتابیس و اسکن امنیت، این لیست نهایی و اجرایی است. همه در یک ترن انجام می‌شود.

---

## بخش A — رفع باگ‌ها و پایداری (اولویت ۱)

### A1. باگ‌های تأییدشده از Console
- **`Home.tsx` → `TileCard`**: هشدار «Function components cannot be given refs». `Link` از TanStack به کامپوننت `ref` می‌دهد و `TileCard` آن را forward نمی‌کند. → تبدیل به `React.forwardRef`.
- **`Home.tsx`**: با ۱۹۵ خط، تمام Tile ها هر بار re-render می‌شوند → `React.memo` روی `TileCard`.

### A2. خطای «missing OAuth secret» (ثابت‌شده در ترن قبل)
- در کد چیزی نیست. یادداشت هشدار به کاربر در همان پنل Auth + راهنمای غیرفعال‌سازی provider اضافی.

### A3. Navigation و Back-button
- بازبینی `useNativeBackButton` برای همه صفحات (Digest، Share، Firebase-auth، SentenceLab پاث‌ها) که فعلاً در نقشه‌ی `parentFor` نیستند.
- افزودن `notFoundComponent` به route های مهمی که هنوز ندارند (طبق قانون TanStack).

### A4. Boundary ها و Error handling
- بررسی `ErrorBoundary` روی route های سنگین (`News`, `NewsArticle`, `BookReader`, `Player`) — اضافه‌شدن fallback واحد با دکمه «تلاش دوباره».
- افزودن `defaultErrorComponent` و `defaultNotFoundComponent` در `router.tsx` اگر ست نشده.

### A5. Firestore/Firebase Sync
- `FirebaseAuthContext` هم‌زمان با `AuthContext` sync می‌کند → احتمال race و double-write.
- افزودن debounce (۵۰۰ms) روی `settingsStore.subscribe` قبل از push به Firestore.
- Fallback در نبود شبکه (offline).

### A6. IndexedDB / db.ts
- migration v7 → افزودن `try/catch` حول upgrade تا در دستگاه‌های با DB خراب، برنامه crash نکند.
- افزودن util `purgeOldAnalysisCache()` برای پاک‌سازی خودکار کش قدیمی‌تر از ۹۰ روز (جلوگیری از پر شدن دیسک).

### A7. Supabase Linter (۴ هشدار SECURITY DEFINER)
- تابع‌های `gamif_*` و `grant_achievement` قابل EXECUTE توسط `authenticated`. → migration: `REVOKE EXECUTE ... FROM public; GRANT EXECUTE ... TO authenticated;` صریح (فعلاً به هر signed-in باز است — این هدف طراحی است، پس فقط لینت را با GRANT صریح ساکت می‌کنیم).

### A8. RLS spot-check
- بازبینی جدول‌های `user_settings`, `profiles`, `user_gamification`, `daily_quests`, `user_achievements`, `sentence_lab` برای وجود policy های SELECT/INSERT/UPDATE/DELETE مبتنی بر `auth.uid()`.

### A9. Edge Functions پایدارسازی
- افزودن `try/catch` و JSON error سازگار به همه‌ی توابع `news-*` و `analyze-*` (چند تا فعلاً بدون shape واحد fail می‌شوند).
- افزودن rate-limit ساده (in-memory per-user) برای `news-scrape-article` و `news-search`.

---

## بخش B — UI/UX و دسکتاپ (اولویت ۲)

### B1. Layout سراسری
- `News.tsx` (۲۳۲۹ خط!) → استخراج بخش‌های Discovery، AllNews، Sidebar به کامپوننت‌های جدا در `src/components/news/` (کاهش re-render و maintainability).
- سازگاری Grid روی صفحات ≥1440px با استفاده از الگوی `grid-cols-[minmax(0,1fr)_auto]` (طبق responsive-layout-patterns).

### B2. Glassmorphism یکپارچه
- بازبینی مصرف `.glass-reflect` روی همه‌ی Card/Dialog؛ حذف مواردی که با تم Night تضاد ندارند.
- افزودن fallback برای مرورگرهای بدون `backdrop-filter`.

### B3. Home.tsx
- Bento grid فعلی زیبا است ولی روی موبایل دو ستون خیلی فشرده است — تنظیم breakpoint ها.
- افزودن skeleton برای بارگذاری اولیه.

### B4. Settings.tsx (۹۲۹ خط)
- تقسیم به Tabs (AI / TTS / Reading / Cloud / Advanced) — فعلاً یک صفحه‌ی طولانی است.

### B5. NewsArticle.tsx و BookReader.tsx
- Header چسبان (sticky) با blur در حالت اسکرول.
- Toolbar شناور در پایین موبایل برای اکشن‌های سریع (Share/TOC/TTS/Reading Mode).

### B6. Accessibility
- افزودن `aria-label` و `focus-visible` روی همه‌ی دکمه‌های آیکنی (News toolbar، Reader controls).
- کنتراست متن روی حالت Sepia بازبینی.

### B7. RTL / فارسی
- بازبینی `dir="rtl"` روی dialog های ExportDialog و ReaderSettings.
- عدد فارسی در progress ها.

---

## بخش C — کارایی و سرعت (اولویت ۳)

### C1. Bundle size
- `News.tsx` ۲۳۲۹ خطی → code-split با `.lazy.tsx` روی sub-view های Digest، AllNews، Discovery.
- بررسی `src/pages/Settings.tsx` برای lazy import پنل‌های سنگین.

### C2. Query caching
- افزودن `staleTime` مناسب به `useQuery` های News (فعلاً هر ورود refetch می‌کند).
- Prefetch مقاله‌ی بعدی هنگام باز بودن یک مقاله.

### C3. TTS و AI
- `geminiTts` فعلاً موازی است ولی بدون concurrency limit → افزودن `p-limit` (۳ همزمان) تا rate-limit نخوریم.
- Cache صوتی در IndexedDB با LRU (سقف ۲۰۰MB).
- افزودن گزینه‌ی «مدل سریع‌تر» به‌عنوان default در ReaderTTSQuickSettings.

### C4. Images
- افزودن `loading="lazy"` و `decoding="async"` روی همه‌ی `<img>` در News/Books.
- Placeholder blur برای تصاویر مقاله.

### C5. Service Worker
- تأیید pre-cache نکردن پاسخ‌های `/api/` و Supabase.
- به‌روزرسانی manifest cache size limit به ۵۰MB.

### C6. Rendering
- `React.memo` روی `NewsCard`, `BookCard`, `ParagraphAnalysisCard`.
- Virtualization (`@tanstack/react-virtual`) روی لیست‌های بلند News و Leitner Cards.

### C7. Startup
- Deferred load برای Firebase (فقط وقتی کاربر `/firebase-auth` می‌رود).
- Deferred load برای MCP و OAuth consent route.

---

## بخش D — کیفیت کد و DX

- افزودن ESLint rule برای منع `console.log` در production.
- افزودن `README.md` توسعه‌دهنده.
- تایپ صریح روی همه‌ی edge function response ها (`z.infer`).

---

## فایل‌ها/مسیرهایی که تغییر می‌کنند (خلاصه)

```
src/pages/Home.tsx                — forwardRef + memo + skeleton
src/pages/News.tsx                — استخراج ساب‌ویوها + lazy
src/pages/Settings.tsx            — Tabs بندی
src/pages/NewsArticle.tsx         — sticky header + toolbar
src/pages/BookReader.tsx          — sticky header + toolbar
src/router.tsx                    — default error/notFound
src/routes/__root.tsx             — notFoundComponent
src/contexts/FirebaseAuthContext.tsx — debounce sync + offline guard
src/hooks/useNativeBackButton.ts  — parentFor گسترش
src/lib/db.ts                     — safe upgrade + purge helper
src/lib/geminiTts.ts              — p-limit + LRU
src/components/news/*             — کامپوننت‌های استخراج‌شده
src/components/reader/*           — memo + a11y
supabase/migrations/*.sql         — GRANT صریح روی SECURITY DEFINER
supabase/functions/*              — try/catch + rate-limit
```

## ترتیب اجرا در ترن build

1. باگ‌های سریع (Home ref، DB safe upgrade، Firebase debounce)
2. Layout و لینتر SQL
3. استخراج News.tsx به کامپوننت‌ها + lazy
4. Settings Tabs
5. Sticky headers + toolbar
6. Perf: memo، virtualization، p-limit
7. تست بصری با Playwright روی Home/News/Reader

---

## چیزهایی که در این پلن نیست (نیاز به تأیید جدا)
- تغییر معماری Auth (Firebase vs Supabase — الان هر دو هست)
- تغییر مدل‌های AI پیش‌فرض
- طراحی مجدد کامل (redesign) — فقط پالایش تم فعلی
