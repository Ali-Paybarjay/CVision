-- Active users and CV checks, per London day and in total: the official count, defined in the active-user section of
-- docs/events.md. The daily-stats workflow runs this file every morning and posts the totals on card #127; a person
-- can run the same file by hand in the Supabase SQL Editor. One statement, as the SQL Editor shows only the last result.
--
-- Team, test and demo accounts are left out through one list of emails, separated by commas, spaces or new lines.
-- A base address also leaves out each of its name+...@ aliases. The list never goes in the repo.
-- - psql (what the workflow does): psql -v team_emails="a@example.com,b@example.com" -f supabase/queries/active-users.sql
--   psql puts the list in as one quoted SQL string, so no SQL is built from it.
-- - Supabase SQL Editor: on the line marked "team list" below, replace the psql variable (a colon, then team_emails
--   in single quotes) with the list in single quotes, e.g. 'a@example.com, b@example.com'.
--
-- Totals only: no column reaches a user. One Total row, then one row per London day from the first active user or CV
-- check to today, newest first; a day with neither shows 0. Today's row is not complete until the day ends.
-- The daily-stats workflow reads these six columns by name and in this order: change them together.
with excluded_emails as (
  select distinct regexp_replace(lower(email), '\+[^@]*@', '@') as email
  from regexp_split_to_table(:'team_emails', '[\s,;]+') as email -- team list
  where email <> ''
),
-- The accounts on the list, with every name+...@ alias of each address.
excluded_users as (
  select u.id
  from auth.users u
  join excluded_emails x on regexp_replace(lower(trim(u.email)), '\+[^@]*@', '@') = x.email
),
-- Every day each signed-in user did something that makes them active.
active as (
  select distinct
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
),
-- Every CV check, by anyone not on the list. Checks are logged with anonymous_id today, so team checks still count.
checks as (
  select
    e.id,
    e.user_id,
    e.anonymous_id,
    (e.created_at at time zone 'Europe/London')::date as day
  from public.events e
  where e.name = 'cvcheck.completed'
    and (e.user_id is null or e.user_id not in (select id from excluded_users))
),
-- Every London day from the first active user or check to today, so a day with neither still shows 0.
days as (
  select d::date as day
  from generate_series(
    least((select min(day) from active), (select min(day) from checks))::timestamp,
    (now() at time zone 'Europe/London')::date::timestamp,
    interval '1 day'
  ) as d
)
-- Both joins can repeat a row on the same day, so every count is a count of distinct users, visitors or events.
select
  case when grouping(d.day) = 1 then 'Total' else d.day::text end as day,
  count(distinct a.user_id) as active_users,
  count(distinct a.user_id) filter (where a.day = a.first_day) as new_active_users,
  count(distinct c.id) as checks,
  count(distinct c.user_id) as signed_in_people,
  count(distinct c.anonymous_id) filter (where c.user_id is null) as anonymous_visitors
from days d
left join with_first_day a on a.day = d.day
left join checks c on c.day = d.day
group by grouping sets ((d.day), ())
order by grouping(d.day) desc, d.day desc;
