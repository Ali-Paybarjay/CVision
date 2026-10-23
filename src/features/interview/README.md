مرضیه · منطق مصاحبه: پرسش‌های InterviewSession، نمره در چهار معیار و بازخورد.

- `server/my-data.ts`: جایی که مصاحبه Profile و آگهی‌های کاربر را می‌خواند. فعلاً دادهٔ نمونهٔ سارا؛ وقتی تابع‌های شایان (#48) ادغام شد، فقط همین یک خط به `src/features/profile` اشاره می‌کند.
- `server/session-store.ts`: ذخیره و خواندن `InterviewSession` در جدول `interview_sessions` برای کاربر واردشده (آگهی‌های نمونه ذخیره نمی‌شوند).
- `server/completion-event.ts`: جزئیات رویداد `interview.session_completed`، فقط عدد و برچسب، بدون متن پرسش و جواب.
