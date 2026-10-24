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
| `ai.hidden_text_removed` | علی | `askModel` در حالت live پیش از فرستادن پرامپت نویسهٔ نامرئی از آن پاک کرد؛ فقط برای درخواستی که از سقف روزانه گذشت، و نه وقتی فقط U+2028 یا U+2029 خط تازه شد | `feature`، `removed` (جمع نویسه‌های پاک‌شده)، و تعدادهای `cleanModelText`: `zeroWidth`، `byteOrderMark`، `softHyphen`، `bidi`، `tag`، `variationSelector`، `hangulFiller`، `annotation`، `lineSeparator`، `tamperSigns`؛ هرگز خود متن | کارت #68؛ `tamperSigns` فقط ثبت می‌شود و هیچ درخواستی را رد نمی‌کند |

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
