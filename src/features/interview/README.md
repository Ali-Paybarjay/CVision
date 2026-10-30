مرضیه · منطق مصاحبه: پرسش‌های InterviewSession، نمره در چهار معیار و بازخورد.

- `server/my-data.ts`: جایی که مصاحبه Profile و آگهی‌های کاربر را می‌خواند: تابع‌های شایان در `src/features/profile/my-data.ts` (#48). اگر کاربر وارد نشده یا Supabase وصل نیست، دادهٔ نمونهٔ یک پرسونا برمی‌گردد.
- `server/session-store.ts`: ذخیره و خواندن `InterviewSession` در جدول `interview_sessions` برای کاربر واردشده (آگهی‌های نمونه ذخیره نمی‌شوند).
- `server/completion-event.ts`: جزئیات رویداد `interview.session_completed`، فقط عدد و برچسب، بدون متن پرسش و جواب.
- `engine/checks.ts`: قاعده‌های هر مرحله. در بازبینی، قاعده‌های قابل‌ترمیم (`ReviewRule`) جواب را رد نمی‌کنند: `repairReviewedSet` follow-up بد را حذف می‌کند (اگر دست‌کم یکی بماند) یا سؤال را به نسخهٔ پیش از بازبینی برمی‌گرداند، و قاعده‌های کل مجموعه فقط ثبت می‌شوند. هر قاعده با نام و شمار، بی‌متن، در رویداد `interview.review_rule_broken` ثبت می‌شود. موضوع‌های شخصی و ساختار سخت می‌مانند (#220).
