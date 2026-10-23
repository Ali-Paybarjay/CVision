-- A row that belongs to a job must belong to the job's owner too (issue #28).
-- Row-level security only checks user_id, and Postgres checks a foreign key without row-level security,
-- so the plain job_id -> jobs (id) keys let a user point a row at another user's job.
-- Each key now points at jobs (id, user_id) with the row's own user_id, so the job has to be the user's own.

-- jobs: a job and its owner are unique together, so the other tables can point at both.
alter table public.jobs
  add constraint jobs_id_user_id_key unique (id, user_id);

-- The four tables that hang off a job: the plain key out, the composite key in. Rows are still deleted with their job.
alter table public.match_results
  drop constraint match_results_job_id_fkey,
  add constraint match_results_job_id_user_id_fkey
    foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade;

alter table public.tailoring_changes
  drop constraint tailoring_changes_job_id_fkey,
  add constraint tailoring_changes_job_id_user_id_fkey
    foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade;

alter table public.interview_sessions
  drop constraint interview_sessions_job_id_fkey,
  add constraint interview_sessions_job_id_user_id_fkey
    foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade;

alter table public.applications
  drop constraint applications_job_id_fkey,
  add constraint applications_job_id_user_id_fkey
    foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade;

-- The keys look rows up by job and user (when a job is deleted, for one), so index the pair instead of job_id alone.
-- Lookups by job_id alone use the same indexes.
drop index public.match_results_job_id_idx;
drop index public.tailoring_changes_job_id_idx;
drop index public.interview_sessions_job_id_idx;
drop index public.applications_job_id_idx;

create index match_results_job_id_user_id_idx on public.match_results (job_id, user_id);
create index tailoring_changes_job_id_user_id_idx on public.tailoring_changes (job_id, user_id);
create index interview_sessions_job_id_user_id_idx on public.interview_sessions (job_id, user_id);

-- applications: one per job for each user, so a job is never tracked twice, even when Apply is pressed in two
-- tabs at once (PR #59). Its unique index also serves the applications key above.
alter table public.applications
  add constraint applications_job_id_user_id_key unique (job_id, user_id);
