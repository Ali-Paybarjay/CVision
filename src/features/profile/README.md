شایان · منطق پروفایل و تطابق: خواندن رزومه، استخراج Profile، تبدیل آگهی و تطابق.

## پروفایل (`/profile`)

- مسیر: آپلود رزومه با رضایت، بازبینی همهٔ بخش‌ها با یک دکمهٔ تأیید در آخر صفحه، و بعد خلاصهٔ پروفایل با ویرایش و ترجیحات شغلی (`preferences.ts`). مرحلهٔ پرسش‌های تکمیلی حذف شد، چون همان جزئیات در صفحهٔ بازبینی هست؛ `followUpAnswers` قدیمی در Profile می‌ماند.
- Back: هر قدم و هر صفحه بالای محتوا Back دارد (`ui/back-link.tsx`). در یک قدم به قدم قبل می‌رود؛ در قدم اول مثل دکمهٔ Back مرورگر به صفحهٔ قبلی سایت برمی‌گردد، و اگر صفحهٔ قبلی از سایت نیست، به `/dashboard` (از `/jobs` به `/profile`).
- Must-haves and deal-breakers: جعبهٔ متن اختیاری در فرم ترجیحات، برای هر خواسته یا نبایدی که گزینه‌ها ندارند (هدف شغلی، «No night shifts»، «Not in gambling»). یکی در هر خط، حداکثر ۵۰۰ نویسه، در `preferences.notes` ذخیره می‌شود. این متن خواستهٔ کاربر است، نه شاهد: هیچ‌وقت به‌عنوان مهارت یا تجربه وارد رزومه یا کاورلتر نمی‌شود (Nothing invented).
- کجا ذخیره می‌شود: اگر Supabase وصل است، فقط بعد از تأیید کاربر، Profile در جدول `profiles` و فایل رزومه در bucket `cvs` زیر پوشهٔ user id (`server/profile-account.ts`، از راه `POST /profile/save`). کاربر واردنشده همان اول پیام ورود می‌بیند. اگر Supabase وصل نیست، مثل قبل در مرورگر (`profile-store.ts`، کلید `cvision.profile`).
- حذف: `deleteMyProfileAction` ردیف `profiles` و همهٔ فایل‌های پوشهٔ کاربر در `cvs` را پاک می‌کند.
- رویدادها: `profile.cv_uploaded` (فرمت فایل) و `profile.approved` (نسخهٔ رضایت و تعدادها)، بدون متن رزومه.
- `cv-extraction.ts`: جواب مدل آسان‌گیر است؛ هر چه در رزومه نیست خالی می‌ماند و صفحهٔ بازبینی از کاربر می‌خواهد پرش کند (#33).

## آگهی و تطابق (`/jobs`)

- `job-extraction.ts`: بررسی متن و لینک آگهی، و ساختن `Job` از جواب مدل. متن آگهی همان‌طور که کاربر چسبانده نگه داشته می‌شود.
- `match.ts`: تطابق نیازمندی‌به‌نیازمندی. مدل برای هر نیازمندی فقط شمارهٔ یک خط از پروفایل (مثل `L7`) را می‌دهد و کد همان خط را کلمه‌به‌کلمه شاهد می‌گذارد، پس هیچ نقطهٔ قوتی بدون شاهد نمی‌آید (Nothing invented). امتیاز را کد حساب می‌کند: نیازمندی ضروری سه برابر امتیازی، «واضح» کامل و «مبهم» نصف.
- `server/check-job.ts`: `parseJob` و `matchJob` با `askModel` و پرامپت‌های `prompts/profile-job.md` و `prompts/profile-match.md`. در حالت mock، آگهی نمونهٔ پرسونایی که نام شرکتش در متن است برمی‌گردد و تطابق با قاعده‌های سادهٔ کلمه‌ای ساخته می‌شود.
- `server/job-store.ts`: ذخیرهٔ `Job` در `jobs` (با همان id) و `MatchResult` در `match_results` برای کاربر واردشده.
- `job-actions.ts`: Server Action صفحه، با رویدادهای `jobs.ad_pasted` و `jobs.match_shown` (بدون متن آگهی یا رزومه).
- آزمون‌های پرامپت: `server/check-job.eval.ts` (فقط با `npm run eval`).

## خواندن دادهٔ کاربر برای بقیهٔ تیم (`my-data.ts`)

تابع‌های سمت سرور برای خواندن دادهٔ کاربر واردشده. RLS هر کاربر را به ردیف‌های خودش محدود می‌کند و هر ردیف با شِمای `src/shared/contracts` بررسی می‌شود. اگر Supabase وصل نیست یا کاربر وارد نشده، دادهٔ نمونهٔ پرسونا برمی‌گردد تا صفحه‌ها نشکنند.

| تابع | خروجی | با دادهٔ نمونه |
|---|---|---|
| `getMyProfile({ jobId? })` | `Profile` یا `null` (هنوز پروفایلی ذخیره نکرده) | پروفایل پرسونایی که صاحب `jobId` است، وگرنه Sara |
| `listMyJobs()` | `Job[]`، جدیدترین اول | دو آگهی Sara |
| `getMyJob(jobId)` | `Job` یا `null` | آگهی نمونه با همین id (مثل `reza-job-1`)، وگرنه آگهی اول Sara |
| `getMyMatch(jobId)` | آخرین `MatchResult` آن آگهی یا `null` | تطابق همان آگهی نمونه |
| `getMyDataSource()` | `"account"` یا `"sample"` | `"sample"`، برای نشان دادن برچسب «دادهٔ نمونه» |

این تابع‌ها cookie می‌خوانند: داخل کامپوننتی که در `<Suspense>` است، یا در Server Action و Route Handler صدایشان کن.

```tsx
import { getMyDataSource, getMyJob, getMyMatch, getMyProfile } from "@/features/profile/my-data";

async function TailorView({ jobId }: { jobId: string }) {
  const [job, match, profile, source] = await Promise.all([
    getMyJob(jobId),
    getMyMatch(jobId),
    getMyProfile({ jobId }),
    getMyDataSource(),
  ]);
  if (!job || !match || !profile) return <p>This job isn’t in your account.</p>;
  // ...
}
```
