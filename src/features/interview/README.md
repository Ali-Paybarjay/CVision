مرضیه · منطق مصاحبه: پرسش‌های InterviewSession، نمره در چهار معیار و بازخورد.

- `server/my-data.ts`: جایی که مصاحبه Profile و آگهی‌های کاربر را می‌خواند: تابع‌های شایان در `src/features/profile/my-data.ts` (#48). اگر کاربر وارد نشده یا Supabase وصل نیست، دادهٔ نمونهٔ یک پرسونا برمی‌گردد.
- `server/session-store.ts`: ذخیره و خواندن `InterviewSession` در جدول `interview_sessions` برای کاربر واردشده (آگهی‌های نمونه ذخیره نمی‌شوند). `loadLatestReport(jobId)` آخرین جلسهٔ گزارش‌دار یک شغل را با تاریخش می‌دهد و `listPracticeSummaries()` برای هر شغل فقط تاریخ و نمرهٔ کل آخرین تمرین تمام‌شده را، بدون خواندن جواب‌ها؛ داشبورد (#208) هم می‌تواند همین را import کند (#206).
- `server/completion-event.ts`: جزئیات رویداد `interview.session_completed`، فقط عدد و برچسب، بدون متن پرسش و جواب.
