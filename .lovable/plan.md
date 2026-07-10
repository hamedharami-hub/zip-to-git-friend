# تجزیه‌ی Rewrite tabs از NewsArticle.tsx

`src/pages/NewsArticle.tsx` حدود ۸۲۰ خط است و بخش عمده‌ی آن مربوط به تب‌های بازنویسی هوش مصنوعی (Rewrite) است. این بخش را به یک کامپوننت مستقل منتقل می‌کنیم بدون تغییر رفتار.

## کارها

1. **ساخت `src/components/news/ArticleRewriteTabs.tsx`**
   - همه‌ی UI مربوط به تب‌های بازنویسی (short / long / max / simple / auto-max)
   - انتخاب مدل هوش مصنوعی (inline model selector موجود)
   - نمایش وضعیت بارگذاری، خطا، دکمه‌های retry
   - تزریق تصاویر مقاله در متن بازنویسی (`injectArticleImages`)
   - props: article, model, onModelChange, displayLang, typo, و callbackهای مورد نیاز

2. **ساخت `src/hooks/useArticleRewrite.ts`** (در صورت نیاز)
   - منطق fetch/cache بازنویسی به یک هوک منتقل شود تا کامپوننت کوچک بماند
   - state مربوط به هر tab length + مدل انتخابی

3. **به‌روزرسانی `src/pages/NewsArticle.tsx`**
   - جایگزینی بلاک Rewrite با `<ArticleRewriteTabs ... />`
   - حفظ همه‌ی رفتار فعلی: TTS، ترجمه، تصاویر، share menu

## تضمین کیفیت

- بدون تغییر در رفتار یا UI کاربر (pixel-parity)
- تایپ‌چک باید پاس شود
- تست دستی: باز کردن یک مقاله، سوییچ بین تب‌های بازنویسی، تغییر مدل، بازآفرینی

## دامنه‌ی خارج از این مرحله

- تغییر منطق caching بازنویسی
- تغییر UI یا استایل tabs
- تغییر رفتار TTS/share/typography (که فعلاً در NewsArticle باقی می‌مانند)

نتیجه: `NewsArticle.tsx` باید حدود ۴۰۰–۵۰۰ خط شود، و `ArticleRewriteTabs.tsx` مستقل و قابل تست باشد.
