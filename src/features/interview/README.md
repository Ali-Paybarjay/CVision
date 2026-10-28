مرضیه · منطق مصاحبه: پرسش‌های InterviewSession، نمره در چهار معیار و بازخورد.

- `server/my-data.ts`: جایی که مصاحبه Profile و آگهی‌های کاربر را می‌خواند: تابع‌های شایان در `src/features/profile/my-data.ts` (#48). اگر کاربر وارد نشده یا Supabase وصل نیست، دادهٔ نمونهٔ یک پرسونا برمی‌گردد.
- `server/session-store.ts`: ذخیره و خواندن `InterviewSession` در جدول `interview_sessions` برای کاربر واردشده (آگهی‌های نمونه ذخیره نمی‌شوند).
- `server/completion-event.ts`: جزئیات رویداد `interview.session_completed`، فقط عدد و برچسب، بدون متن پرسش و جواب.
- `engine/stages.ts` · `suggestAnswer`: بعد از «End here» (#205)، برای هر پرسش بی‌جواب یک جواب پیشنهادی فقط از روی رزومه، یک درخواست برای هر پرسش. قاعده‌های دقت در `engine/checks.ts` (`suggestionProblems`)؛ اگر جواب مدل حتی بعد از تلاش دوباره قبول نشود، نسخهٔ امن ساخته‌شده با کد (`fallbackSuggestion`) نشان داده می‌شود.
