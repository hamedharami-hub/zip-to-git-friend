
# بازطراحی Editorial گرم — Design System کل برنامه

سبک انتخابی: **Editorial گرم** (حس مجله‌ی کاغذی، serif برای تیترها، رنگ‌های کرم/خاکی/مس، انیمیشن متوسط)

## فلسفه طراحی

از Material 3 رنگی فعلی (teal + warm tertiary) به یک سیستم **مجله‌ای گرم** مهاجرت می‌کنیم:
- **پس‌زمینه**: کرمی کاغذی `#faf8f5` به‌جای سفید استریل
- **متن**: مشکی نرم `#2d2d2d` به‌جای مشکی محض
- **رنگ اصلی**: مس/تراکوتا `#c2410c` (به‌جای teal فعلی)
- **سطوح**: لایه‌های کرمی متفاوت با کنتراست ملایم
- **تایپوگرافی دوگانه**: یک serif برجسته برای تیترها (مثل **Fraunces** یا **Instrument Serif**) + sans تمیز برای متن (**Inter Tight**) + **Vazirmatn** برای فارسی
- **انیمیشن متوسط (۳/۵)**: fade-in نرم، hover-lift ملایم، transition روان — بدون اغراق

## محدوده تغییرات (کل برنامه از طریق Design System)

با تغییر توکن‌های مرکزی، تقریباً همه‌ی صفحات خودبه‌خود به‌روز می‌شوند چون اکثر کامپوننت‌ها از توکن‌های semantic استفاده می‌کنند.

### ۱. توکن‌های CSS (`src/styles.css`)
- بازنویسی متغیرهای `:root` با پالت Editorial گرم (light)
- بازنویسی `.dark` با نسخه‌ی شب گرم (پس‌زمینه `#1a1614`، متن کرم)
- اضافه کردن `--font-serif: "Fraunces"` و `--font-display: "Fraunces"`
- نگه‌داشتن `--font-sans: "Inter Tight", Vazirmatn` برای body
- اضافه کردن توکن‌های جدید:
  - `--shadow-paper`: سایه‌ی نرم کاغذی به‌جای elevation سخت
  - `--gradient-warm`: گرادیان نامحسوس کرم→صدفی برای hero
  - `--texture-grain`: noise SVG ظریف برای پس‌زمینه (اختیاری، CSS-only)
- کاهش radius پیش‌فرض: `--radius: 12px` (به‌جای 16px فعلی) — حس editorial نه material

### ۲. فونت‌ها (`src/routes/__root.tsx`)
- اضافه‌کردن `<link>` به Google Fonts برای **Fraunces** (400/600/700, opsz) و **Inter Tight** (400/500/600)
- حذف لود فعلی Roboto Flex اگر هست

### ۳. کامپوننت‌های کلیدی UI
- **`button.tsx`**: حذف pill rounded-full از variant های اصلی → `rounded-lg`، حذف elevation سنگین، اضافه کردن variant `editorial` (border زیرین مسی)
- **`card.tsx`**: کاهش shadow، اضافه‌کردن گزینه border ظریف کرمی به‌جای elevation
- **`input.tsx`**: کاهش به `rounded-md`، border زیرین تنها (underline-style اختیاری برای فرم‌های مهم)
- **`badge.tsx`**: حالت outline ظریف به‌عنوان پیش‌فرض

### ۴. صفحه Home (`src/pages/Home.tsx`)
- تیتر اصلی با فونت Fraunces بزرگ (display)
- یک "eyebrow" کوچک با حروف بزرگ تایپوگرافی editorial بالای تیتر
- کارت‌های Mode: کاهش radius از 28px به 16px، حذف tone container های پررنگ و جایگزینی با border کرمی + یک accent مسی روی آیکون
- جداکننده‌های افقی ظریف بین بخش‌ها (مثل مجله)

### ۵. صفحات محتوایی (Reader, News, Books)
- این صفحات از طریق توکن‌ها خودکار به‌روز می‌شوند
- در `BookReader` و `NewsArticle` فقط: تنظیم max-width مطالعه (`max-w-prose`) و فونت serif برای متن مقاله

### ۶. انیمیشن (سطح ۳/۵)
- `animate-fade-in` روی mount صفحات
- hover lift ملایم (`hover:-translate-y-0.5`) روی کارت‌ها
- transition روی رنگ/سایه با `duration-300 ease-out`
- یک ingress ظریف برای hero با blur-fade (بدون کتابخانه اضافه)

## جزئیات فنی (برای مرجع)

```text
رنگ‌های اصلی (light mode):
  background:       #faf8f5  (کرم کاغذی)
  surface:          #f5f0e8
  surface-container:#ede5d6
  foreground:       #2d2d2d
  muted-foreground: #6b5d4f
  primary:          #c2410c  (تراکوتا/مس)
  secondary:        #8b6f47  (خاکی گرم)
  accent:           #a8856a
  border:           #e0d5c2

dark mode:
  background:       #1a1614
  surface:          #241f1b
  foreground:       #f0e8dc
  primary:          #e8a87c  (مس روشن‌تر برای کنتراست)
```

## فایل‌هایی که تغییر می‌کنند

- `src/styles.css` — کل متغیرها + توکن‌های جدید
- `src/routes/__root.tsx` — لود فونت‌ها
- `src/components/ui/button.tsx` — حذف pill، editorial variant
- `src/components/ui/card.tsx` — کاهش shadow
- `src/components/ui/input.tsx` — کاهش radius
- `src/pages/Home.tsx` — تایپوگرافی editorial، layout مجله‌ای
- `src/pages/BookReader.tsx` و `src/pages/NewsArticle.tsx` — فقط فونت body مقاله (max-w-prose + font-serif)

## چیزی که تغییر نمی‌کند
- منطق برنامه، روتر، state، AI، DB — هیچ
- ساختار کامپوننت‌ها — فقط استایل
- زبان فارسی و RTL — حفظ کامل (Vazirmatn fallback)

پس از پیاده‌سازی، کل برنامه حس یک مجله‌ی گرم کاغذی پیدا می‌کند بدون از دست رفتن کارایی.
