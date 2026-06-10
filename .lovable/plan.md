# انتقال امن پروژه به اکانت دوم (بدون پاک شدن داده‌ها)

## چرا دفعه‌ی قبل داده‌ها (مثلاً Sentence Lab) پاک شده بود؟

دو دلیل اصلی وجود داره و هر دو رو در این پلن پوشش می‌دیم:

1. **Seed/Reset Script اشتباه اجرا شد** — در این پروژه یک endpoint عمومی هست: `src/routes/api/public/seed-sentence-lab.ts` که با `supabaseAdmin.upsert(..., { onConflict: 'id' })` روی جداول `sentence_categories`, `sentence_paths`, `sentence_lab` می‌نویسه. اگر بعد از انتقال این فراخوانی بشه، رکوردهای کاربر با نسخه‌ی seed بازنویسی می‌شن.
2. **انتقال فقط Code انجام شد، نه Database** — یعنی Cloud (Supabase) جدیدی به پروژه‌ی مقصد وصل شد و چون migrationها دوباره از صفر اجرا شدن، جداول خالی موندن.

## روش پیشنهادی: Transfer Ownership (روش ۱)

این روش **همه چیز را با هم منتقل می‌کند**: کد + دیتابیس + Storage + Auth users + Secrets + Edge Functions. هیچ export/import دستی لازم نیست چون پروژه‌ی Cloud عوض نمی‌شه، فقط مالکیتش.

### مراحل

1. **Backup کامل (قبل از هر کاری — برای امنیت خاطر)**
   - export کامل CSV از همه‌ی جداول کاربری به `/mnt/documents/backup-<date>/`:
     - `books`, `book_chapters`
     - `leitner_cards`, `leitner_folders`
     - `sentence_categories`, `sentence_paths`, `sentence_lab`, `sentence_progress`, `sentence_flags`, `scenario_sessions`, `scenario_saved_sentences`
     - `news_articles`, `news_sources`, `news_folders`, `news_digests`, `news_blocked_domains`
     - `profiles`, `user_achievements`, `user_gamification`, `daily_quests`
   - اگه چیزی هم خراب شد، با همین فایل‌ها می‌شه بازگردانی کرد.

2. **دعوت اکانت دوم به Workspace فعلی**
   - Workspace Settings → People → Invite → ایمیل اکانت دوم → نقش **Admin**
   - از اکانت دوم Invite رو Accept کن.

3. **Transfer Ownership پروژه**
   - Project Settings → General → **Transfer ownership** → اکانت دوم رو انتخاب کن.
   - بعد از Transfer:
     - ✅ کد کامل
     - ✅ Lovable Cloud (دیتابیس + همه‌ی رکوردها — Sentence Lab، Leitner، Books، …)
     - ✅ Storage buckets (`book-files`, `leitner-audio`, `sentence-audio`, `leitner-images`)
     - ✅ Auth users
     - ✅ Edge Functions + Secrets (`LOVABLE_API_KEY`, …)
   - ⚠️ Credits منتقل نمی‌شن (اکانت دوم پلن خودش رو داره — همینی که می‌خوای).

4. **بعد از انتقال — چک‌های امنیتی**
   - login کن با همون کاربر تستی و مطمئن شو Sentence Lab، Leitner، Books همگی پیدا میشن.
   - یک query شمارش رکورد قبل و بعد از انتقال مقایسه کن (تعداد ردیف هر جدول).

5. **محافظت در برابر اشتباه دفعه‌ی قبل (seed endpoint)**
   - endpoint `‎/api/public/seed-sentence-lab` رو غیرفعال یا با guard محافظت می‌کنیم تا تصادفاً بعد از انتقال اجرا نشه و داده‌ی کاربر رو overwrite نکنه. (اگه تأیید کنی، در حالت build این تغییر رو هم اعمال می‌کنم.)

6. **حذف اکانت اول از Workspace (اختیاری)**
   - بعد از اطمینان از کارکرد، اکانت اول رو از People حذف کن.

## نکات تکمیلی

- **Published URL**: ممکنه slug عوض بشه — قبل از انتقال URL فعلی رو یادداشت کن.
- **Custom Domain**: اگه داشتی، DNS باید دوباره verify بشه.
- **GitHub**: اگه connected هست، بعد از انتقال ممکنه دوباره authorize لازم بشه.

## چیزی که از من می‌خوای تایید کنی

- [ ] ادامه دادن با همین روش (Transfer Ownership) — توصیه‌شده
- [ ] اجرای script پشتیبان‌گیری CSV از همه‌ی جداول قبل از انتقال (در حالت build)
- [ ] محافظت از `seed-sentence-lab` endpoint با guard تا تصادفاً overwrite نکنه
