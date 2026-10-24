علی · پیگیری درخواست‌ها: فهرست، تغییر وضعیت و قدم بعدی هر Application.

- `actions.ts`: `recordApplication(jobId)`، که دکمهٔ Apply نازنین صدا می‌زند. برای کاربر واردشده یک Application با وضعیت `applied` و تاریخ امروز ثبت می‌کند؛ Apply دوباره چیز تازه‌ای نمی‌سازد. `updateApplication(id, { status, nextStep })` وضعیت و قدم بعدی را از داشبورد ذخیره می‌کند؛ اگر وضعیت عوض شود، تاریخ امروز می‌شود و رویداد `tracker.status_changed` ثبت می‌شود.
- `applications.ts`: `loadTracker()` فهرست درخواست‌های کاربر را با عنوان و شرکت آگهی می‌خواند. تا Supabase وصل نیست، درخواست‌های نمونهٔ سارا (`sample.ts`) را برمی‌گرداند.
- `tracker.tsx` و `application-list.tsx`: بخش پیگیری در `/dashboard`، با حالت خالی (سه قدم برند) و لینک تمرین مصاحبه برای وضعیت interview.
- `model.ts`: برچسب وضعیت‌ها، شکل تغییر مجاز و تاریخ‌ها، مشترک بین سرور و مرورگر.
