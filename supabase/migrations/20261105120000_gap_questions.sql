-- gap_questions: the questions Tailor asked the user about one job's gaps (issue #304), kept so the page does not ask
-- the model again every time it is rebuilt. `data` holds { key, questions }: `key` is a hash of the Profile, job and
-- gaps the questions were written for, so a changed Profile or match gets new questions. Tailor writes and reads it.
-- Deleting the user, or the job, deletes it too.
create table public.gap_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The job has to be the user's own, as for the other tables that hang off a job (issue #28).
  constraint gap_questions_job_id_user_id_fkey
    foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade,
  -- One set of questions per job for each user. Its unique index also serves the key above.
  constraint gap_questions_job_id_user_id_key unique (job_id, user_id)
);

-- For the per-user lookups (the Your data page, the download).
create index gap_questions_user_id_idx on public.gap_questions (user_id);

-- Owner-only access, as on the other user tables: RLS on, explicit grants, and one policy per action.
alter table public.gap_questions enable row level security;
revoke all on table public.gap_questions from anon;
grant select, insert, update, delete on table public.gap_questions to authenticated;

create policy "Users read their own rows" on public.gap_questions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users add their own rows" on public.gap_questions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users change their own rows" on public.gap_questions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their own rows" on public.gap_questions for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger set_updated_at before update on public.gap_questions
  for each row execute function public.set_updated_at();
