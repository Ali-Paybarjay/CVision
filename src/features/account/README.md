علی · حساب کاربری: ورود، حریم خصوصی و رضایت، دانلود و حذف کامل داده (Your data is yours).

- `data-rights.ts`: فقط سرور، با کلاینت admin و فیلتر `user_id` همان کاربرِ نشست. `summariseUserData` تعداد ردیف‌های کاربر در هشت جدول (`userTables`: شش جدول قرارداد به‌علاوهٔ `events` و `ai_usage`) و تعداد فایل‌های رزومه در `cvs/<user_id>/` (با پوشه‌های تو در تو و صفحه‌به‌صفحه) را می‌شمارد. `exportUserData` همهٔ این‌ها را در یک ZIP می‌گذارد: `data.json` و فایل‌های اصلی رزومه زیر `cv-files/`. `deleteAccount` اول فایل‌های رزومه را پاک می‌کند (Supabase کاربری را که فایل دارد پاک نمی‌کند)، بعد کاربر را با `auth.admin.deleteUser`؛ بقیهٔ ردیف‌ها با `on delete cascade` می‌روند. اگر وسط کار خطا بدهد، می‌گوید تا کجا پیش رفته. در لاگ فقط مرحله و کد خطا می‌آید.
- `zip.ts`: نویسندهٔ کوچک ZIP بدون فشرده‌سازی، با CRC-32، تا وابستگی تازه لازم نباشد.
- `data-rights-actions.ts`: `deleteMyAccount`، که فقط با تایپ دقیق `DELETE` جلو می‌رود؛ هر چیز دیگری یعنی «Nothing was deleted». بعد از حذف، این مرورگر را خارج می‌کند، رویداد `account.deleted` را فقط با شمارش‌ها و بدون شناسهٔ کاربر ثبت می‌کند و به `/dashboard/your-data/deleted` می‌رود.
- `your-data.tsx` و `delete-account-form.tsx`: صفحهٔ `/dashboard/your-data`: چه چیزی از کاربر داریم، بعد Download my data، بعد Delete my account با دو تأیید. تا Supabase وصل نیست، به‌جای این‌ها پیام می‌دهد.
- `account-deleted.tsx`: صفحهٔ تأیید حذف، با دادهٔ مرورگر پاک‌شده و فهرست چیزهایی که فوراً پاک نمی‌شوند و تا کی می‌مانند (`notDeletedStraightAway`). متنش با بخش `not-deleted-straight-away` صفحهٔ Privacy یکی است؛ هر دو را با هم عوض کن.
- `browser-data.ts` و `sign-out-button.tsx`: موقع خروج و بعد از حذف، همهٔ کلیدهای `cvision.` در localStorage پاک می‌شوند (بخش علی از #35).
- `test-support.ts`: کلاینت admin ساختگی و خوانندهٔ ZIP، فقط برای آزمون‌ها.
