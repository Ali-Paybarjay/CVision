-- stats: what the daily-stats workflow needs to leave the team's accounts out of the active-user count, without
-- seeing anyone's email (issue #162). The workflow runs supabase/queries/active-users.sql as cvision_stats, which could
-- not read auth.users on Supabase: postgres may read the auth schema but cannot let another role into it. Now one
-- function, owned by the role that applies this migration, turns the team's emails into user ids, and cvision_stats
-- loses its access to auth.users. The schema is not in the Data API's list (supabase/config.toml), so browsers never
-- reach it.
create schema stats;

-- cvision_stats: reads public.events for the daily totals, and runs stats.team_user_ids. bypassrls, as public.events
-- has row-level security with no policies. On live Ali made it by hand, with a login and a password that are never in
-- the repository, and this leaves both as they are. A role belongs to the whole database server and outlives a local
-- database reset, so it may already be there; where it is not, it is made without a login, so the grants below work.
do $$
begin
  if not exists (select from pg_catalog.pg_roles where rolname = 'cvision_stats') then
    create role cvision_stats nologin bypassrls;
  end if;
end;
$$;

alter role cvision_stats set default_transaction_read_only = on;
grant select on public.events to cvision_stats;

-- team_user_ids: the ids of the accounts on a list of emails separated by commas, spaces or new lines, the same rule
-- the query used before: case does not matter, and a base address also gives each of its name+...@ aliases. Only ids
-- come back. security definer, so it reads auth.users with its owner's rights; with an empty search_path every table
-- is named with its schema, and built-in functions come from pg_catalog, which Postgres always searches first.
create function stats.team_user_ids(team_emails text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with excluded_emails as (
    select distinct regexp_replace(lower(email), '\+[^@]*@', '@') as email
    from regexp_split_to_table(team_emails, '[\s,;]+') as list (email)
    where email <> ''
  )
  select u.id
  from auth.users u
  join excluded_emails x on regexp_replace(lower(trim(u.email)), '\+[^@]*@', '@') = x.email
$$;

-- Only cvision_stats may use the schema and run the function. New functions are open to public until revoked.
revoke all on schema stats from public, anon, authenticated;
revoke execute on function stats.team_user_ids(text) from public, anon, authenticated;
grant usage on schema stats to cvision_stats;
grant execute on function stats.team_user_ids(text) to cvision_stats;

-- cvision_stats no longer reads auth.users. Revoking select on the table takes the column grants (id, email) with it,
-- and neither revoke fails where nothing was granted.
revoke select on auth.users from cvision_stats;
revoke usage on schema auth from cvision_stats;
