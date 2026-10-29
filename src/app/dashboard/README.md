علی · داشبورد: صفحهٔ اصلی کاربرِ واردشده، با پیگیری درخواست‌ها و پیوند حساب.

- `your-data`: صفحهٔ «Your data» برای دانلود و حذف کامل داده (#43)، با `download/route.ts` (POST، فایل ZIP، `Cache-Control: no-store`) و `deleted` (صفحهٔ تأیید حذف). کد اصلی در `src/features/account` است.
- `jobs/[jobId]`: صفحهٔ «Job ad» (#208): متن کامل آگهی یکی از شغل‌های کاربر، همان‌طور که paste کرده، با عنوان و شرکت و لینک برگشت به داشبورد. کد اصلی `JobAd` در `src/features/tracker/job-ad.tsx` است؛ شغل گم‌شده یا مال کس دیگر `not-found.tsx` را نشان می‌دهد.
