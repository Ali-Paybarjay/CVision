شایان · منطق پروفایل و تطابق: خواندن رزومه، استخراج Profile، تبدیل آگهی و تطابق.

## پروفایل (`/profile`)

- مسیر: آپلود رزومه با رضایت، بازبینی همهٔ بخش‌ها با یک دکمهٔ تأیید در نواری که پایین صفحه می‌ماند، و بعد خلاصهٔ پروفایل با ویرایش و ترجیحات شغلی (`preferences.ts`). مرحلهٔ پرسش‌های تکمیلی حذف شد، چون همان جزئیات در صفحهٔ بازبینی هست؛ `followUpAnswers` قدیمی در Profile می‌ماند.
- بدون رزومه: زیر فرم آپلود، «No CV to upload?» با دکمهٔ Fill in my details همان صفحهٔ بازبینی را خالی باز می‌کند (`emptyDraft` در `review-draft.ts`، و `source="manual"` در `ui/review-step.tsx`) تا کاربر خودش پر کند. چون رزومه‌ای خوانده نمی‌شود، رضایت جدایی (`manualConsent` در `consent.ts`، نسخه با پیشوند `manual-`) کنار دکمهٔ Approve and save گرفته می‌شود و با Profile در مرورگر، یا در رویداد `profile.approved` حساب، ثبت می‌شود. این گزینه فقط وقتی هنوز پروفایلی ذخیره نشده دیده می‌شود؛ پروفایل ذخیره‌شده با Check and edit your details عوض می‌شود. Upload a CV instead آنچه نوشته شده را تا وقتی صفحه باز است نگه می‌دارد.
- بدون Back: Profile و Jobs بالای صفحه دکمهٔ Back ندارند؛ نوار قدم‌ها و منوی بالای سایت به صفحه‌های دیگر می‌برند. در Profile دکمهٔ خود هر قدم (Cancel، Start again، Keep my current profile) به قدم قبل برمی‌گردد، و در Jobs گزارش تطبیق با Check another job از نو شروع می‌شود. `ui/back-link.tsx` فقط برای CV check و Interview مانده است.
- Must-haves and deal-breakers: جعبهٔ متن اختیاری در فرم ترجیحات، برای هر خواسته یا نبایدی که گزینه‌ها ندارند (هدف شغلی، «No night shifts»، «Not in gambling»). یکی در هر خط، حداکثر ۵۰۰ نویسه، در `preferences.notes` ذخیره می‌شود. این متن خواستهٔ کاربر است، نه شاهد: هیچ‌وقت به‌عنوان مهارت یا تجربه وارد رزومه یا کاورلتر نمی‌شود (Nothing invented).
- خط‌هایی که به نظر اشتباه تایپی‌اند (`mistyped.ts`، #360): زیر جعبه‌های Personal statement، What you did، Results and achievements و جزئیات داوطلبی و پروژه، اگر خطی تکهٔ تکراری، یک حرف پنج بار، بک‌اسلش جلوی حرف یا حروف کیبورد فارسی، عربی، روسی یا عبری وسط متن انگلیسی دارد، هشداری زرد همان تکه را نشان می‌دهد و جلوی Approve را نمی‌گیرد. جایش همین‌جاست، چون `match.ts` خط را کلمه‌به‌کلمه نقل می‌کند و Tailor رویش می‌سازد. مدلی در کار نیست، پس کلمه‌های درست ولی بی‌معنی را نمی‌گیرد.
- کجا ذخیره می‌شود: اگر Supabase وصل است، فقط بعد از تأیید کاربر، Profile در جدول `profiles` و فایل رزومه در bucket `cvs` زیر پوشهٔ user id (`server/profile-account.ts`، از راه `POST /profile/save`). کاربر واردنشده همان اول پیام ورود می‌بیند. اگر Supabase وصل نیست، مثل قبل در مرورگر (`profile-store.ts`، کلید `cvision.profile`).
- حذف: `deleteMyProfileAction` ردیف `profiles` و همهٔ فایل‌های پوشهٔ کاربر در `cvs` را پاک می‌کند.
- رویدادها: `profile.cv_uploaded` (فرمت فایل) و `profile.approved` (نسخهٔ رضایت، `manual` برای پروفایلی که کاربر خودش پر کرده، و تعدادها)، بدون متن رزومه.
- `cv-extraction.ts`: جواب مدل آسان‌گیر است؛ هر چه در رزومه نیست خالی می‌ماند و صفحهٔ بازبینی از کاربر می‌خواهد پرش کند (#33).

## آگهی و تطابق (`/jobs`)

- `job-extraction.ts`: بررسی متن و لینک آگهی، و ساختن `Job` از جواب مدل. متن آگهی همان‌طور که کاربر چسبانده نگه داشته می‌شود.
- `job-link.ts` و `server/read-ad-link.ts` (#330): آگهی از لینک. کاربر اول لینک را می‌دهد؛ سرور صفحه را فقط با `fetchPublicPage` (#278) باز می‌کند و متن آگهی در کادر آگهی می‌نشیند تا کاربر پیش از «Check my fit» آن را ببیند و کوتاه کند؛ چیزی بی‌تأییدش به مدل نمی‌رود. سایت‌هایی که آگهی را به سایت دیگری نشان نمی‌دهند (`textOnly` در فهرست `JOB_SITES`، مثل LinkedIn) اصلاً باز نمی‌شوند و صفحه بی‌درنگ متن را می‌خواهد، و اگر لینکی (مثلاً کوتاه‌شده) به یکی از آن‌ها برسد، درخواست به آن سایت فرستاده نمی‌شود؛ صفحه‌ای که باز می‌شود ولی برای یک آگهی کامل زیادی کوتاه است `no-ad` است. فهرست از آزمون روی آگهی‌های باز در ۷ نوامبر ۲۰۲۶ درآمده. هر راه کادر آگهی خودش را دارد، و لینک تازه متن لینک قبلی را پاک می‌کند. برای هر دلیل شکست یک جمله هست که بعدش متن آگهی را می‌خواهد، و لینک برای Apply می‌ماند.
- `match.ts`: تطابق نیازمندی‌به‌نیازمندی. مدل برای هر نیازمندی فقط شمارهٔ یک خط از پروفایل (مثل `L7`) را می‌دهد و کد همان خط را کلمه‌به‌کلمه شاهد می‌گذارد، پس هیچ نقطهٔ قوتی بدون شاهد نمی‌آید (Nothing invented). امتیاز را کد حساب می‌کند: نیازمندی ضروری سه برابر امتیازی، «واضح» کامل و «مبهم» نصف.
- `server/check-job.ts`: `parseJob` و `matchJob` با `askModel` و پرامپت‌های `prompts/profile-job.md` و `prompts/profile-match.md`. در حالت mock، آگهی نمونهٔ پرسونایی که نام شرکتش در متن است برمی‌گردد و تطابق با قاعده‌های سادهٔ کلمه‌ای ساخته می‌شود.
- `server/job-store.ts`: ذخیرهٔ `Job` در `jobs` (با همان id) و `MatchResult` در `match_results` برای کاربر واردشده.
- `job-actions.ts`: Server Actionهای صفحه: `checkJobAction` با رویدادهای `jobs.ad_pasted` و `jobs.match_shown`، و `readAdLinkAction` با `jobs.link_read` (نتیجه و نام سایت از فهرست، یا `other`؛ هیچ‌وقت لینک، نام کارفرما، متن آگهی یا رزومه).
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
