-- Which coverage rule decided this verdict.
--
-- The month-verdict cron has no AuthContext and so deliberately never calls
-- lib/activity/log.ts; the tms_incharge_month_verdict row IS its audit
-- substitute, and that row must explain every bill on its own. Once per-share
-- scoring exists alongside the original route-level rule, "which rule billed
-- this person?" is part of that explanation.
--
-- Nullable: rows written before this column existed genuinely predate the
-- distinction, and backfilling them to 'route' would assert something about
-- runs nobody recorded.
alter table tms_incharge_month_verdict
  add column if not exists scored_by text
  check (scored_by is null or scored_by in ('route', 'share'));

comment on column tms_incharge_month_verdict.scored_by is
  'route = credited if anyone marked the route that day; share = credited only if this in-charge covered their own share. Null on rows written before per-share scoring existed.';
