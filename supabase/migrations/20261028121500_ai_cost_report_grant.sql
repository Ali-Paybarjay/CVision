-- ai_cost_report_grant: the manual AI cost report (supabase/queries/ai-cost.sql, run by ai-cost-report.yml, #167)
-- connects as cvision_stats and reads public.ai_usage, which that role could not read (issue #203). The report needs
-- each request's time and account, so the daily views in schema reporting are not enough. bypassrls already takes the
-- role past row-level security; this gives it the table itself, to read only, as its sessions are read only too.
grant select on public.ai_usage to cvision_stats;
