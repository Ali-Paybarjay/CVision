-- reporting: daily totals of AI use, cost and failures for the team, with nothing that says whose requests they were
-- (issue #160, agreed on card #45). Shayan reads them through the ai_usage_reader role, which sees these two views
-- and nothing else. The schema is not in the Data API's list (supabase/config.toml), so browsers never reach it.
create schema reporting;

-- Plain views, not security_invoker: they read the tables with their owner's rights, so ai_usage_reader needs no
-- rights on the tables themselves. Days are UTC days, as the daily limits are, whatever the session's time zone.

-- ai_usage_daily: one row per day, feature and model. ok = false is counted twice over: a request the model
-- answered but refused, or whose answer did not fit, kept its tokens; a row reserved for a request and never filled
-- in has none (reserveWithinDailyLimit in src/shared/ai/usage.ts).
create view reporting.ai_usage_daily as
select
  (created_at at time zone 'utc')::date as day,
  feature,
  model,
  count(*) as requests,
  count(*) filter (where not ok and (input_tokens > 0 or output_tokens > 0)) as refused_or_invalid,
  count(*) filter (where not ok and input_tokens = 0 and output_tokens = 0) as never_filled,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens,
  sum(cost_usd) as cost_usd
from public.ai_usage
group by day, feature, model;

-- ai_events_daily: askModel's ai.failed and ai.limited events per day (docs/events.md). ai.failed has the error's
-- class and HTTP status, ai.limited which daily limit turned the request away; neither says who asked.
create view reporting.ai_events_daily as
select
  (created_at at time zone 'utc')::date as day,
  name as event,
  properties ->> 'feature' as feature,
  properties ->> 'error' as error,
  -- Only a number is read as a status, so one odd event cannot break the whole view.
  case when jsonb_typeof(properties -> 'status') = 'number' then (properties ->> 'status')::numeric::integer end as status,
  properties ->> 'limit' as daily_limit,
  count(*) as events
from public.events
where name in ('ai.failed', 'ai.limited')
group by day, event, feature, error, status, daily_limit;

-- ai_usage_reader: may read the two views and nothing else. It cannot sign in: Ali gives it a login and a password in
-- Supabase, so neither is ever in the repository. A role belongs to the whole database server and outlives a local
-- database reset, so it may already be there.
do $$
begin
  if not exists (select from pg_catalog.pg_roles where rolname = 'ai_usage_reader') then
    create role ai_usage_reader nologin;
  end if;
end;
$$;

revoke all on schema reporting from public, anon, authenticated;
revoke all on all tables in schema reporting from public, anon, authenticated;
grant usage on schema reporting to ai_usage_reader;
grant select on reporting.ai_usage_daily, reporting.ai_events_daily to ai_usage_reader;
