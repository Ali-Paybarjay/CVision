شایان · منطق پروفایل و تطابق: خواندن رزومه، استخراج Profile، پرسش‌های تکمیلی، تبدیل آگهی و تطابق.

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
