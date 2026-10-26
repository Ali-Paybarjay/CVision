-- AI cost in a time window: what the real model requests in that window cost, per feature, from public.ai_usage.
-- After someone has gone through the app once as a test user, the ai-cost-report workflow runs this file when they
-- start it by hand from the Actions tab; a person can run the same file in the Supabase SQL Editor. One statement, as
-- the SQL Editor shows only the last result.
--
-- The window is a start and an end in London time, written YYYY-MM-DD HH:MM, e.g. 2026-10-27 10:00.
-- - psql (what the workflow does):
--   psql -v from_london="2026-10-27 10:00" -v to_london="2026-10-27 10:40" -f supabase/queries/ai-cost.sql
--   psql puts each time in as one quoted SQL string, so no SQL is built from them.
-- - Supabase SQL Editor: on the two lines marked "window" below, replace each psql variable (a colon, then from_london
--   or to_london in single quotes) with the time in single quotes, e.g. '2026-10-27 10:00'.
--
-- Totals only: no column reaches a user. cost_usd is the app's own estimate at the model's standard price
-- (estimateCostUsd in src/shared/ai/usage.ts). Each feature falls in one group:
-- - one-time: building the Profile from the CV, once per user (profile-extract, profile-follow-up)
-- - per-job: everything done for each job ad (profile-job, profile-match, tailor-*, interview-*)
-- - cv-check: the free CV check, which is anonymous, so it never counts as an account
-- - other: any feature not listed here yet
-- Rows: each feature with its group, then the group's total (feature 'total'), then the window's total (group and
-- feature 'total'), which is always there, with zeros when the window has no request. accounts counts the signed-in
-- accounts that made requests: 1 on the window's total means only the test account was busy. log_rows counts every row
-- in public.ai_usage, inside the window or not: 0 means the database role sees none of them.
-- The ai-cost-report workflow reads these eight columns by name and in this order: change them together.
with time_window as (
  select
    (:'from_london')::timestamp at time zone 'Europe/London' as starts_at, -- window
    (:'to_london')::timestamp at time zone 'Europe/London' as ends_at -- window
),
requests as (
  select
    case
      when u.feature in ('profile-extract', 'profile-follow-up') then 'one-time'
      when u.feature in ('profile-job', 'profile-match') or u.feature like 'tailor-%' or u.feature like 'interview-%'
        then 'per-job'
      when u.feature = 'cv-check' then 'cv-check'
      else 'other'
    end as cost_group,
    u.feature,
    u.user_id,
    u.input_tokens,
    u.output_tokens,
    u.cost_usd
  from public.ai_usage u
  cross join time_window w
  where u.created_at >= w.starts_at
    and u.created_at < w.ends_at
)
select
  coalesce(cost_group, 'total') as "group",
  coalesce(feature, 'total') as feature,
  count(*) as requests,
  count(distinct user_id) as accounts,
  coalesce(sum(input_tokens), 0) as input_tokens,
  coalesce(sum(output_tokens), 0) as output_tokens,
  round(coalesce(sum(cost_usd), 0), 4) as cost_usd,
  (select count(*) from public.ai_usage) as log_rows
from requests
group by grouping sets ((cost_group, feature), (cost_group), ())
order by
  grouping(cost_group),
  case cost_group when 'one-time' then 1 when 'per-job' then 2 when 'cv-check' then 3 else 4 end,
  grouping(feature),
  cost_usd desc,
  feature;
