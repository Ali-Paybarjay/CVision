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

رویداد تازه‌ای که اضافه می‌کنید، اول در همین جدول بیاید.

## قیف سه قدم برند

| قدم | رسیدن به قدم یعنی دست‌کم یکی از این رویدادها |
|---|---|
| ۱. Upload your CV | `profile.cv_uploaded` |
| ۲. Paste a job ad | `jobs.ad_pasted` |
| ۳. Get a tailored CV and cover letter | `tailor.change_approved`، `tailor.cover_letter_created` یا `tailor.cv_exported` |

هر نفر در هر قدمی که به آن رسیده شمرده می‌شود، و رسیدن به یک قدم یعنی قدم‌های پیش از آن را هم رفته است. پس کسی که فقط `jobs.ad_pasted` دارد (مثلاً Profile را روی دستگاه دیگری ساخته)، در قدم ۱ و ۲ هر دو شمرده می‌شود، نه فقط در قدم آخرش. «نفر» یعنی `user_id`، یا `anonymous_id` برای کسی که حساب ندارد.

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
    (1, 'Upload your CV'),
    (2, 'Paste a job ad'),
    (3, 'Get a tailored CV and cover letter')
) as steps (step, title)
order by steps.step;
```

## شمار رسمی کاربر فعال

عدد رسمی ایستگاه ۴ (دست‌کم ۱۵)، هدف ارائه (۴۰) و وضعیت روزانهٔ پایلوت (#127) از این دو کوئری می‌آید. تا وقتی داشبورد قدم ۴ آماده شود، علی هر روز اجرایشان می‌کند و فقط عددها را در تماس روزانه می‌دهد.

**کاربر فعال** طبق پلن کاربر واردشده‌ای است که دست‌کم یک رزومه یا کاورلتر اختصاصی ساخته، یا یک تمرین مصاحبهٔ کامل انجام داده. در کد یعنی دست‌کم یکی از این رویدادها با `user_id`:

| کار | رویداد |
|---|---|
| رزومهٔ اختصاصی ساخت | `tailor.change_approved` (دست‌کم یک تغییر را تأیید کرد)، یا `tailor.cv_exported` با `document` برابر `cv` و `approvedChanges` بیشتر از صفر |
| کاورلتر ساخت | `tailor.cover_letter_created`، یا `tailor.cv_exported` با `document` برابر `cover-letter` |
| تمرین مصاحبه را تمام کرد | `interview.session_completed` |

- شمرده نمی‌شود: `tailor.change_rejected`، `tailor.apply_clicked`، دانلود رزومه بدون هیچ تغییر تأییدشده (`approvedChanges` برابر صفر)، رویدادهای Profile و آگهی، و `cvcheck.completed` که پایین‌تر جدا شمرده می‌شود. پس این تعریف از قدم ۳ قیف، که هر `tailor.cv_exported` و هر بازدیدکنندهٔ بی‌حساب را می‌شمارد، سخت‌گیرتر است.
- کار بی‌حساب (`anonymous_id`، مثلاً `/tailor` در حالت mock بدون ورود) کسی را فعال نمی‌کند.
- رویدادهای `tailor.*` و جزئیات `document` و `approvedChanges` از ادغام #82 ثبت می‌شوند.
- کسی که حسابش را حذف کرده دیگر شمرده نمی‌شود، چون رویدادهایش هم با حسابش پاک می‌شوند.

**حساب‌های تیم، تست و دمو** کنار گذاشته می‌شوند، بی‌آنکه ایمیل یا شناسهٔ کسی در مخزن بیاید:

1. در SQL Editor، جای `paste-team-email-here@example.com` در `excluded_emails` ایمیل هر حسابی را بگذارید که نباید شمرده شود، هر کدام در یک خط `('…'),` (خط آخر بدون ویرگول): حساب‌های تیم، حساب‌های تستی که هم‌تیمی‌ها می‌سازند (#140) و حساب دمو (#142).
2. آدرس پایه کافی است: `name@…` همهٔ `name+…@…`ها را هم کنار می‌گذارد.
3. فهرست فقط در SQL Editor می‌ماند و هرگز در مخزن، PR، کارت، شیت یا گروه تیم نمی‌آید. کوئری با همان placeholder هم اجرا می‌شود، ولی آن وقت حساب‌های تیم هم شمرده می‌شوند.

خروجی فقط عدد است و هیچ ستونی به کاربری نمی‌رسد: یک ردیف `Total` و یک ردیف برای هر روز به وقت لندن، از اولین رویداد (نه فقط ۳۰ روز اخیر). `active_users` شمار کاربرهای فعال آن روز است و `new_active_users` کسانی که آن روز برای اولین بار فعال شدند. عدد ایستگاه ۴ و ارائه `active_users` در ردیف `Total` است.

**کاربر فعال، روزانه و کل:**

```sql
with excluded_emails (email) as (
  values
    -- One line per team, test or demo account. Paste them here only, never in the repo.
    ('paste-team-email-here@example.com')
),
-- The accounts on the list, with every name+…@ alias of each address.
excluded_users as (
  select u.id
  from auth.users u
  join excluded_emails x
    on regexp_replace(lower(trim(u.email)), '\+[^@]*@', '@') = regexp_replace(lower(trim(x.email)), '\+[^@]*@', '@')
),
-- Every day each signed-in user did something that makes them active.
active as (
  select
    e.user_id,
    (e.created_at at time zone 'Europe/London')::date as day
  from public.events e
  where e.user_id is not null
    and e.user_id not in (select id from excluded_users)
    and (
      e.name in ('tailor.change_approved', 'tailor.cover_letter_created', 'interview.session_completed')
      or (
        e.name = 'tailor.cv_exported'
        and (
          e.properties ->> 'document' = 'cover-letter'
          or coalesce((e.properties ->> 'approvedChanges')::int, 0) > 0
        )
      )
    )
),
with_first_day as (
  select user_id, day, min(day) over (partition by user_id) as first_day
  from active
)
select
  case when grouping(a.day) = 1 then 'Total' else a.day::text end as day,
  count(distinct a.user_id) as active_users,
  count(distinct a.user_id) filter (where a.day = a.first_day) as new_active_users
from with_first_day a
group by grouping sets ((a.day), ())
order by grouping(a.day) desc, a.day desc;
```

**چک رزومه، جدا:** همان فهرست `excluded_emails` را اینجا هم بگذارید. `checks` شمار چک‌هاست، `signed_in_people` کاربرهای واردشده و `anonymous_visitors` بازدیدکننده‌های بی‌حساب، با `anonymous_id`.

- `anonymous_id` کلیدی روزانه از IP است. پس در ردیف `Total` کسی که چند روز آمده چند بار شمرده می‌شود و چند نفر پشت یک IP یک نفرند؛ آن عدد تخمین است.
- الان چک رزومه رویداد را برای همه، حتی کاربر واردشده، با `anonymous_id` ثبت می‌کند. پس `signed_in_people` فعلاً صفر است و چک‌های تیم با فهرست کنار نمی‌روند: شمار چک‌هایی را که تیم گزارش می‌دهد (مثل اجراهای #140) دستی از `checks` کم کنید. اگر روزی `user_id` هم ثبت شود، همین کوئری بی‌تغییر کار می‌کند.

```sql
with excluded_emails (email) as (
  values
    -- The same list as above.
    ('paste-team-email-here@example.com')
),
excluded_users as (
  select u.id
  from auth.users u
  join excluded_emails x
    on regexp_replace(lower(trim(u.email)), '\+[^@]*@', '@') = regexp_replace(lower(trim(x.email)), '\+[^@]*@', '@')
),
checks as (
  select
    e.user_id,
    e.anonymous_id,
    (e.created_at at time zone 'Europe/London')::date as day
  from public.events e
  where e.name = 'cvcheck.completed'
    and (e.user_id is null or e.user_id not in (select id from excluded_users))
)
select
  case when grouping(c.day) = 1 then 'Total' else c.day::text end as day,
  count(*) as checks,
  count(distinct c.user_id) as signed_in_people,
  count(distinct c.anonymous_id) filter (where c.user_id is null) as anonymous_visitors
from checks c
group by grouping sets ((c.day), ())
order by grouping(c.day) desc, c.day desc;
```
