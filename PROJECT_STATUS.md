# Project Status

تاریخ: ۲۰۲۶-۱۰-۰۵

## ۱. وضعیت فعلی

**Supabase تنها بک‌اند است.** پروژه دیگر از Firebase استفاده نمی‌کند.

- `npm run lint`، `npm run typecheck` و `npm run build` هر سه بدون خطا اجرا می‌شوند.
- احراز هویت، دیتابیس، ذخیره‌سازی و توابع لبه، همه روی Supabase هستند.
- رابط کاربری کاملاً انگلیسی است.

## ۲. حذف Firebase (انجام شد)

مهاجرت ناقص به Firebase که در ۲۰۲۶-۰۹ انجام شده بود، کاملاً برگشت. Firebase فقط
لایه‌ای نازک روی Supabase بود و تقریباً کد مرده محسوب می‌شد:

| حذف‌شده                                                                                  | توضیح                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------ |
| `src/contexts/FirebaseAuthContext.tsx`                                                   | کلاس پوشش Firebase Auth              |
| `src/pages/FirebaseAuth.tsx`                                                             | صفحه ورود موازی                      |
| `src/integrations/firebase/`                                                             | `client.ts`، `config.ts`، `index.ts` |
| `src/lib/firebase.ts`                                                                    | راه‌انداز Firestore و Analytics      |
| `src/lib/firebaseConfig.functions.ts`                                                    | بدون استفاده                         |
| `firestore.rules`                                                                        | قوانین امنیتی Firestore              |
| `firebase.json`، `firebase-blueprint.json`، `firebase-applet-config.json`، `.firebaserc` | پیکربندی                             |
| پکیج `firebase` از `package.json`                                                        | وابستگی                              |

### تغییرات در کد باقی‌مانده

- **`src/contexts/AuthContext.tsx`** — حذف منطق تطبیق Firebase user با `User` شکل
  Supabase. قبلاً اگر کاربر Firebase بود ولی Supabase نبود، به‌صورت مصنوعی یک
  `User` ساخته می‌شد. حالا `user` مستقیماً از session می‌آید.
- **`src/App.tsx`** — برداشتن `<FirebaseAuthProvider>` و مسیر `/firebase-auth`.
- **`src/pages/Auth.tsx`** — **بازنویسی کامل مسیر ورود.** این بخش مهم‌ترین کار بود،
  چون کاربر قبلاً واقعاً با Firebase وارد می‌شد:
  - `signUp` → `supabase.auth.signUp` (با بررسی حالت تأیید ایمیل)
  - `signIn` → `supabase.auth.signInWithPassword`
  - Google → `supabase.auth.signInWithOAuth` با redirect به `/auth/callback`
- **`src/hooks/useNativeBackButton.ts`** — حذف مسیر `/firebase-auth` که دیگر وجود ندارد.

### چرا این کار کم‌ریسک بود

Supabase Auth از قبل کامل و فعال بود: ۳۲ فراخوانی در ۱۴ فایل شامل
`AuthContext.tsx`، `settingsStore.ts`، `AuthCallback.tsx` و `lib/news.ts`.
مسیر `/auth/callback` و صفحه `AuthCallback` از قبل با `supabase.auth` کار می‌کردند.
تنها بخشی که وصل نبود، همین صفحه ورود بود.

## ۳. داده‌ها

Supabase تنها ذخیره‌گاه داده است و دست‌نخورده باقی مانده:

- ۲۴ جدول، حدود ۳۰۰ ستون
- ۲۳۹ خط سیاست RLS
- ۱۰ تابع SQL
- ۲۸ تابع لبه در `supabase/functions/`
- مسیر `/api/` برای seed داده

## ۴. مسائل امنیتی باز

- **کلیدهای Supabase در تاریخچه git لو رفته است** (کامیت `431e985`).
  - حذف از شاخه انجام شده ولی **در تاریخچه باقی است**.
  - **اقدام لازم از سمت کاربر:** در داشبورد Supabase کلید را باطل و تمدید کنید
    (Rotate/Regenerate). حذف از تاریخچه به‌تنهایی کافی نیست.
  - کلید از نوع `publishable/anon` است و به‌تنهایی دسترسی کامل نمی‌دهد،
    ولی چون در ریپوی عمومی دیده می‌شود باید تعویض شود.

## ۵. چرا مهاجرت به Firestore لغو شد

اگر روزی خواستید از Supabase به سرویس دیگری بروید، این دلایل ثبت شده‌اند:

- **محدودیت ۱ MiB در Firestore**: جدول `book_chapters` ستون `html` دارد که متن
  کامل HTML هر فصل کتاب را نگه می‌دارد. این از سقف Firestore فراتر می‌رود و
  فصل‌ها باید به سندهای کوچک‌تر تقسیم شوند.
- **۲۳۹ خط RLS** باید به Firestore Rules بازنویسی شود؛ این دو مدل تفاوت
  بنیادی دارند (RLS هر سطر را بررسی می‌کند، Firestore هر کوئری را).
- **۱۰ تابع SQL** منطق تراکنشی دارند و باید به Cloud Functions منتقل شوند.
- **۲۸ تابع لبه** باید بازنویسی شوند.
- Firestore به‌ازای هر document read هزینه دارد؛ خواندن لیست اخبار می‌تواند
  ماهانه هزینه‌زا شود.

اگر روزی مهاجرت به اکوسیستم گوگل لازم شد، **Cloud SQL** گزینه منطقی‌تری است،
چون کد رابطه‌ای است و مهاجرت عملاً فقط تغییر رشته اتصال خواهد بود.
نکته: Cloud SQL لایه رایگان دائمی ندارد (فقط ۳ ماه trial) و کوچک‌ترین
instance حدود $۹ در ماه است.

## ۶. تک کار بعدی قابل اجرا

- تعویض کلید Supabase از داشبورد (نیازمند دسترسی کاربر).
