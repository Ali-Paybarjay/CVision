-- tailored_cvs: the CV and cover letter the user approved for one job, saved when they download it or press Apply
-- (issue #67). The contract object (TailoredCv in src/shared/contracts/tailoring.ts) lives in `data`, as in the
-- other user tables. Deleting the user, or the job, deletes it too.
create table public.tailored_cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The job has to be the user's own, as for the other tables that hang off a job (issue #28).
  constraint tailored_cvs_job_id_user_id_fkey
    foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade,
  -- One saved version per job for each user. Its unique index also serves the key above.
  constraint tailored_cvs_job_id_user_id_key unique (job_id, user_id)
);

-- For the per-user lookups (the Your data page, the download).
create index tailored_cvs_user_id_idx on public.tailored_cvs (user_id);

-- Owner-only access, as on the other user tables: RLS on, explicit grants, and one policy per action.
alter table public.tailored_cvs enable row level security;
revoke all on table public.tailored_cvs from anon;
grant select, insert, update, delete on table public.tailored_cvs to authenticated;

create policy "Users read their own rows" on public.tailored_cvs for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users add their own rows" on public.tailored_cvs for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users change their own rows" on public.tailored_cvs for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their own rows" on public.tailored_cvs for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger set_updated_at before update on public.tailored_cvs
  for each row execute function public.set_updated_at();
