-- CVision initial schema.
-- One table per contract in src/shared/contracts (except CvCheckResult, which is never stored).
-- Each row keeps the contract object in `data` (validated by zod in the app) and belongs to one user.
-- Row-level security: every user sees and changes only their own rows.
-- Deleting a user from auth.users deletes all their rows (Your data is yours).

-- Keep updated_at current on every change.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles: the user's Profile (one per user) and the path of their CV file in storage.
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  cv_file_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- jobs: job ads the user pasted (phase 2 adds ads from job APIs).
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- match_results: how well the user's Profile fits a job.
create table public.match_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- tailoring_changes: suggested CV edits for a job, each proposed, approved or rejected.
create table public.tailoring_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- interview_sessions: practice interviews for a job.
create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- applications: the tracker on the dashboard.
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for the per-user lookups every page makes.
create index jobs_user_id_idx on public.jobs (user_id);
create index match_results_user_id_idx on public.match_results (user_id);
create index match_results_job_id_idx on public.match_results (job_id);
create index tailoring_changes_user_id_idx on public.tailoring_changes (user_id);
create index tailoring_changes_job_id_idx on public.tailoring_changes (job_id);
create index interview_sessions_user_id_idx on public.interview_sessions (user_id);
create index interview_sessions_job_id_idx on public.interview_sessions (job_id);
create index applications_user_id_idx on public.applications (user_id);
create index applications_job_id_idx on public.applications (job_id);

-- Owner-only access on every user table: RLS on, explicit grants, and one policy per action.
do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'jobs', 'match_results', 'tailoring_changes', 'interview_sessions', 'applications']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);

    execute format(
      'create policy "Users read their own rows" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "Users add their own rows" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "Users change their own rows" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "Users delete their own rows" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);

    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- events: usage events from track(). Written only by the server (secret key), never read by browsers.
create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  anonymous_id text,
  name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index events_name_created_at_idx on public.events (name, created_at);
create index events_user_id_idx on public.events (user_id);

-- ai_usage: one row per real model request, for daily limits and cost tracking. Server only.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  anonymous_key text,
  feature text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  ok boolean not null,
  created_at timestamptz not null default now()
);

create index ai_usage_user_id_created_at_idx on public.ai_usage (user_id, created_at);
create index ai_usage_anonymous_key_created_at_idx on public.ai_usage (anonymous_key, created_at);
create index ai_usage_feature_created_at_idx on public.ai_usage (feature, created_at);

-- RLS on with no policies: browsers (anon, authenticated) get nothing; the server's secret key bypasses RLS.
alter table public.events enable row level security;
alter table public.ai_usage enable row level security;
revoke all on table public.events from anon, authenticated;
revoke all on table public.ai_usage from anon, authenticated;

-- cvs: private storage for uploaded CVs. Each user's files live under a folder named after their user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cvs',
  'cvs',
  false,
  5242880,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
);

-- Upload, replace (upsert needs insert, select and update), read and delete: own folder only.
create policy "Users read their own CVs" on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users upload their own CVs" on storage.objects for insert to authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users replace their own CVs" on storage.objects for update to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users delete their own CVs" on storage.objects for delete to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);
