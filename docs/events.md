# رویدادهای استفاده

مشترک · صاحب این فایل علی است؛ هر نفر ردیف رویدادهای بخش خودش را به‌روز می‌کند.

هر بخش رویدادهای خودش را با `track("<area>.<action>", details, actor)` از `@/shared/analytics/track` ثبت می‌کند، ترجیحاً داخل `after()` تا کار کاربر منتظرش نماند. هر رویداد یک ردیف در جدول `events` است: `name`، `properties`، `user_id` (کاربر واردشده) یا `anonymous_id` (بازدیدکنندهٔ بی‌حساب، از `getAnonymousKey()`)، و `created_at`. این جدول فقط سمت سرور است و مرورگر به آن دسترسی ندارد.

**قاعده:** در `properties` هیچ متن رزومه، آگهی، نامه، پرسش، جواب یا اطلاعات شخصی نمی‌آید. فقط شمارش، نمره، نوع، وضعیت و شناسه.

## رویدادهای مسیر کاربر

به ترتیب مسیر، از صفحهٔ اصلی تا Apply.

| رویداد | صاحب | کی ثبت می‌شود | جزئیات مجاز | وضعیت |
|---|---|---|---|---|
| `home.cta_clicked` | علی | کلیک روی Get started free یا Free 2-minute CV check در صفحهٔ اصلی | `cta`: `get_started` یا `cv_check`؛ `placement`: `header` یا `hero` | ثبت می‌شود (#41) |
| `cvcheck.completed` | مرضیه | نتیجهٔ چک دودقیقه‌ای رزومه نشان داده شد | نمرهٔ کلی و تعداد ایرادها | کارت #53 |
| `profile.cv_uploaded` | شایان | رزومه خوانده شد | بدون متن رزومه | کارت #47 |
| `profile.approved` | شایان | کاربر Profile را تأیید و ذخیره کرد | بدون متن رزومه | کارت #47 |
| `jobs.ad_pasted` | شایان | آگهی چسبانده و خوانده شد | بدون متن آگهی | کارت #46 |
| `jobs.match_shown` | شایان | گزارش تطابق نشان داده شد | بدون متن آگهی یا رزومه | کارت #46 |
| `tailor.change_approved` | نازنین | کاربر یک تغییر پیشنهادی را تأیید کرد | بدون متن رزومه | کارت #49 |
| `tailor.change_rejected` | نازنین | کاربر یک تغییر پیشنهادی را رد کرد | بدون متن رزومه | کارت #49 |
| `tailor.cover_letter_created` | نازنین | کاورلتر ساخته شد | بدون متن نامه | کارت #50 |
| `tailor.cv_exported` | نازنین | رزومهٔ اختصاصی دانلود شد | `format`: `pdf` یا `docx` | کارت #51 |
| `tailor.apply_clicked` | نازنین | دکمهٔ Apply زده شد (لینک رسمی آگهی باز شد) | بدون متن آگهی | کارت #52 |
| `tracker.status_changed` | علی | کاربر وضعیت یک درخواست را در داشبورد عوض کرد | `from` و `to`: وضعیت قبلی و تازه | PR #65 |
| `interview.session_completed` | مرضیه | تمرین مصاحبه تمام شد و گزارش آماده شد | `sessionId`، `jobId`، `mode`، `questions`، `followUpsAsked`، `overall`، `readiness`، `lowConfidenceAnswers`، `averageAnswerWords`، `durationSeconds` | ثبت می‌شود (#54)؛ فقط برای کاربر واردشده و یک بار برای هر session (#99) |
| `interview.length_over` | مرضیه | جواب مدل در یک مرحلهٔ مصاحبه یکی از قاعده‌های طول را شکست و با این حال نگه داشته شد (مثلاً `improvement` بیش از ۳ جمله)؛ فقط برای درخواست live کاربر واردشده | `stage` (`review` یا `evaluate`)، `rule` (`question-words`، `follow-up-length`، `quote-words`، `improvement-length`)، `count`؛ هرگز خود متن | بعد از #112؛ می‌گوید قاعده‌های طول چند بار شکسته می‌شوند |
| `ai.hidden_text_removed` | علی | `askModel` در حالت live پیش از فرستادن پرامپت نویسهٔ نامرئی از آن پاک کرد؛ فقط برای درخواستی که از سقف روزانه گذشت و مدل به آن جواب داد، و نه وقتی فقط U+2028 یا U+2029 خط تازه شد | `feature`، `removed` (جمع نویسه‌های پاک‌شده)، و تعدادهای `cleanModelText`: `zeroWidth`، `byteOrderMark`، `softHyphen`، `bidi`، `tag`، `variationSelector`، `hangulFiller`، `annotation`، `lineSeparator`، `tamperSigns`؛ هرگز خود متن | کارت #68؛ `tamperSigns` فقط ثبت می‌شود و هیچ درخواستی را رد نمی‌کند |
| `ai.failed` | علی | `askModel` در حالت live درخواستی به مدل فرستاد و به جای جواب خطا گرفت (کلید خراب، تمام شدن اعتبار، سقف OpenRouter، قطعی، timeout)؛ برای هر تلاش، تلاش دوم هم. خطا بی‌تغییر به صدازننده می‌رسد و ردیف رزروشدهٔ تلاش اول پاک می‌شود | `feature`، `error` (نام کلاس خطا، مثل `RateLimitError` یا `APIConnectionTimeoutError`)، `status` (کد HTTP، فقط اگر خطا داشته باشد)؛ هرگز متن خطا. بدون `user_id` و `anonymous_id` | کارت #160؛ شمار روزانه در view ِ `reporting.ai_events_daily` |
| `ai.limited` | علی | سقف روزانه درخواستی را پیش از فرستادن به مدل رد کرد (`limit-reached`) | `feature`، `limit`: `perUser` (سقف هر کاربر)، `perAnonymousVisitor` (چک‌های رایگان هر مهمان) یا `allAnonymous` (همهٔ مهمان‌ها روی هم). بدون `user_id` و `anonymous_id` | کارت #160؛ شمار روزانه در view ِ `reporting.ai_events_daily` |

رویداد تازه‌ای که اضافه می‌کنید، اول در همین جدول بیاید.

## قیف سه قدم برند

| قدم | رسیدن به قدم یعنی دست‌کم یکی از این رویدادها |
|---|---|
| ۱. Build your profile | `profile.cv_uploaded` یا `profile.approved` |
| ۲. Paste a job ad | `jobs.ad_pasted` |
| ۳. Get a tailored CV and cover letter | `tailor.change_approved`، `tailor.cover_letter_created` یا `tailor.cv_exported` |

هر نفر در هر قدمی که به آن رسیده شمرده می‌شود، و رسیدن به یک قدم یعنی قدم‌های پیش از آن را هم رفته است. پس کسی که فقط `jobs.ad_pasted` دارد (مثلاً Profile را روی دستگاه دیگری ساخته)، در قدم ۱ و ۲ هر دو شمرده می‌شود، نه فقط در قدم آخرش. «نفر» یعنی `user_id`، یا `anonymous_id` برای کسی که حساب ندارد. کسی که پروفایلش را بدون رزومه خودش پر کرده، `profile.cv_uploaded` ندارد و با `profile.approved` در قدم ۱ شمرده می‌شود (کارت #179).

## کوئری‌ها

در SQL Editor پروژهٔ Supabase اجرا کنید. روزها به وقت لندن‌اند و هر دو کوئری ۳۰ روز اخیر را می‌گیرند.

**شمارش روزانهٔ هر رویداد:**

```sql
select
  (created_at at time zone 'Europe/London')::date as day,
  name,
  count(*) as events,
  count(distinct coalesce(user_id::text, anonymous_id)) as people
from public.events
where created_at >= now() - interval '30 days'
group by day, name
order by day desc, name;
```

**قیف سه قدم برند:**

```sql
with step_events (name, step) as (
  values
    ('profile.cv_uploaded', 1),
    ('profile.approved', 1),
    ('jobs.ad_pasted', 2),
    ('tailor.change_approved', 3),
    ('tailor.cover_letter_created', 3),
    ('tailor.cv_exported', 3)
),
-- The furthest step each person reached.
furthest as (
  select coalesce(e.user_id::text, e.anonymous_id) as person, max(s.step) as step
  from public.events e
  join step_events s on s.name = e.name
  where e.created_at >= now() - interval '30 days'
    and coalesce(e.user_id::text, e.anonymous_id) is not null
  group by person
)
select
  steps.step,
  steps.title,
  (select count(*) from furthest where furthest.step >= steps.step) as people
from (
  values
    (1, 'Build your profile'),
    (2, 'Paste a job ad'),
    (3, 'Get a tailored CV and cover letter')
) as steps (step, title)
order by steps.step;
```

## شمار رسمی کاربر فعال

عدد رسمی ایستگاه ۴ (دست‌کم ۱۵)، هدف ارائه (۴۰) و وضعیت روزانهٔ پایلوت (#127) از یک فایل می‌آید: [`supabase/queries/active-users.sql`](../supabase/queries/active-users.sql). هر صبح کار خودکار `daily-stats` همین فایل را اجرا می‌کند و عددها را در #127 کامنت می‌کند (پایین‌تر)، و هر کس می‌تواند همان فایل را دستی در SQL Editor اجرا کند.

**کاربر فعال** طبق پلن کاربر واردشده‌ای است که دست‌کم یک رزومه یا کاورلتر اختصاصی ساخته، یا یک تمرین مصاحبهٔ کامل انجام داده. در کد یعنی دست‌کم یکی از این رویدادها با `user_id`:

| کار | رویداد |
|---|---|
| رزومهٔ اختصاصی ساخت | `tailor.change_approved` (دست‌کم یک تغییر را تأیید کرد)، یا `tailor.cv_exported` با `document` برابر `cv` و `approvedChanges` بیشتر از صفر |
| کاورلتر ساخت | `tailor.cover_letter_created`، یا `tailor.cv_exported` با `document` برابر `cover-letter` |
| تمرین مصاحبه را تمام کرد | `interview.session_completed` |

- شمرده نمی‌شود: `tailor.change_rejected`، `tailor.apply_clicked`، دانلود رزومه بدون هیچ تغییر تأییدشده (`approvedChanges` برابر صفر)، رویدادهای Profile و آگهی، و `cvcheck.completed` که در ستون‌های جدا شمرده می‌شود. پس این تعریف از قدم ۳ قیف، که هر `tailor.cv_exported` و هر بازدیدکنندهٔ بی‌حساب را می‌شمارد، سخت‌گیرتر است.
- کار بی‌حساب (`anonymous_id`، مثلاً `/tailor` در حالت mock بدون ورود) کسی را فعال نمی‌کند.
- رویدادهای `tailor.*` و جزئیات `document` و `approvedChanges` از ادغام #82 ثبت می‌شوند.
- کسی که حسابش را حذف کرده دیگر شمرده نمی‌شود، چون رویدادهایش هم با حسابش پاک می‌شوند.

**حساب‌های تیم، تست و دمو** کنار گذاشته می‌شوند، بی‌آنکه ایمیل یا شناسهٔ کسی در مخزن بیاید. فایل فهرست ایمیل‌ها را از متغیر psql به نام `team_emails` می‌گیرد: یک متن که ایمیل‌ها در آن با ویرگول، فاصله یا خط تازه جدا شده‌اند.

- آدرس پایه کافی است: `name@…` همهٔ `name+…@…`ها را هم کنار می‌گذارد. بزرگی و کوچکی حروف مهم نیست.
- تابع `stats.team_user_ids` (در `supabase/migrations/20261025212453_stats_team_user_ids.sql`، #162) فهرست را به شناسهٔ همان حساب‌ها برمی‌گرداند و جز شناسه چیزی نمی‌دهد. پس کسی که فایل را اجرا می‌کند به `auth.users` دسترسی لازم ندارد. فقط `cvision_stats` (پایین‌تر) و صاحب تابع (`postgres`، نقش SQL Editor) اجازهٔ اجرایش را دارند؛ `anon` و `authenticated` نه.
- در فهرست بیایند: حساب‌های تیم، حساب‌های تستی که هم‌تیمی‌ها می‌سازند (#140) و حساب دمو (#142). حساب تازه‌ای از این دست که ساخته شد، به secret `TEAM_ACCOUNT_EMAILS` هم اضافه شود.
- فهرست فقط در secret `TEAM_ACCOUNT_EMAILS` در GitHub و در SQL Editor می‌ماند و هرگز در مخزن، PR، کارت، شیت یا گروه تیم نمی‌آید.

**اجرای دستی در SQL Editor:**

1. همهٔ متن `supabase/queries/active-users.sql` را در SQL Editor پروژهٔ Supabase بچسبانید.
2. در خطی که ته آن `-- team list` آمده، `:'team_emails'` را با فهرست ایمیل‌ها بین دو `'` عوض کنید، مثلاً `'ali@example.com, marzieh@example.com'`. جای دیگری از متن را عوض نکنید.
3. Run را بزنید. اگر `:'team_emails'` عوض نشده باشد، کوئری با خطای `syntax error at or near ":"` می‌ایستد. با `''` (فهرست خالی) هم اجرا می‌شود، ولی آن وقت حساب‌های تیم هم شمرده می‌شوند.

**خروجی** فقط عدد است و هیچ ستونی به کاربری نمی‌رسد: یک ردیف `Total` و یک ردیف برای هر روز به وقت لندن، از روز اولین کاربر فعال یا اولین چک رزومه تا امروز (نه فقط ۳۰ روز اخیر). روزی که هیچ‌کدام را نداشته هم ردیف دارد، با صفر. پس ردیف زیر `Total` همیشه امروز است، که تا آخر روز هنوز کامل نیست.

| ستون | یعنی |
|---|---|
| `active_users` | کاربرهای فعال آن روز. عدد ایستگاه ۴ و ارائه همین ستون در ردیف `Total` است |
| `new_active_users` | کسانی که آن روز برای اولین بار فعال شدند |
| `checks` | شمار چک‌های رزومه (`cvcheck.completed`)، جدا از کاربر فعال |
| `signed_in_people` | کاربرهای واردشده‌ای که رزومه را چک کردند |
| `anonymous_visitors` | بازدیدکننده‌های بی‌حسابی که رزومه را چک کردند، با `anonymous_id` |

- `anonymous_id` کلیدی روزانه از IP است. پس در ردیف `Total` کسی که چند روز آمده چند بار شمرده می‌شود و چند نفر پشت یک IP یک نفرند؛ آن عدد تخمین است.
- الان چک رزومه رویداد را برای همه، حتی کاربر واردشده، با `anonymous_id` ثبت می‌کند. پس `signed_in_people` فعلاً صفر است و چک‌های تیم با فهرست کنار نمی‌روند: شمار چک‌هایی را که تیم گزارش می‌دهد (مثل اجراهای #140) دستی از `checks` کم کنید. اگر روزی `user_id` هم ثبت شود، همین کوئری بی‌تغییر کار می‌کند.

**گزارش خودکار هر صبح (#155):** `.github/workflows/daily-stats.yml` هر روز ساعت ۰۸:۰۰ UTC (۸ صبح لندن در زمستان، ۹ صبح در ساعت تابستانی بریتانیا) همین فایل را با `psql` اجرا می‌کند و یک کامنت فارسی روی #127 می‌گذارد: کاربر فعال و چک رزومهٔ دیروز، و کل هر کدام تا زمان اجرا (ساعتش به وقت لندن در کامنت می‌آید). همان جدول در صفحهٔ اجرا در Actions هم می‌آید. از Actions → Daily stats → Run workflow دستی هم اجرا می‌شود.

- دو secret لازم دارد: `SUPABASE_DB_URL` (connection string از نوع Session pooler، با رمز) و `TEAM_ACCOUNT_EMAILS` (همان فهرست بالا). هر دو secret محیط (environment) به نام `daily-stats` هستند، نه secret مخزن، و فقط شاخهٔ `main` اجازهٔ استفاده از این environment را دارد. secret مخزن به workflow هر شاخه‌ای می‌رسد، پس هر کسی که شاخه‌ای push کند می‌تواند آن را بخواند.
- اگر یکی از secretها نباشد، کوئری خطا بدهد، یا کوئری هیچ کاربر فعال و هیچ چک رزومه‌ای نبیند، کار با پیام روشن شکست می‌خورد و چیزی کامنت نمی‌کند.
- `SUPABASE_DB_URL` با نقش آمار، `cvision_stats`، وصل می‌شود که فقط این‌ها را لازم دارد: `bypassrls` (RLS روی `public.events` روشن است و هیچ policyای ندارد، پس بی آن صفر ردیف می‌بیند)، `select` روی `public.events`، و اجازهٔ استفاده از schema ‏`stats` و اجرای `stats.team_user_ids`. این نقش دیگر `auth.users` را نمی‌خواند و ایمیل هیچ کاربری را نمی‌بیند: migration #162 اجازه‌های قبلی‌اش روی `auth.users` و schema `auth` را پس می‌گیرد. همان migration نقش را اگر نباشد بی login می‌سازد و login و رمز نقشی را که هست دست نمی‌زند؛ رمز فقط در Supabase و در secret است، نه در مخزن.
- کار فقط عدد و تاریخ می‌نویسد، نه ایمیل یا شناسه، چون لاگ Actions این مخزن هم عمومی است.
- آزمون `supabase/tests/active-users-query.test.ts` خود فایل را روی پایگاه دادهٔ آزمایشی (PGlite) با دادهٔ ساختگی و با نقش `cvision_stats` اجرا می‌کند، پس اگر آن نقش اجازه‌ای کم داشته باشد شکست می‌خورد. ستون‌های فایل و workflow با هم عوض شوند؛ آزمون هم‌گامی‌شان را می‌سنجد. `supabase/tests/stats-team-user-ids.test.ts` تابع و اجازه‌های نقش را می‌سنجد.
