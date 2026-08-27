-- Retire in-charge attendance enforcement.
--
-- The punitive half of the bus in-charge feature (strikes -> probation ->
-- removal -> billing) is removed. Its API routes are deleted in the same
-- change, so these jobs would call endpoints that no longer exist and log a
-- 404 every weekday at 21:00.
--
-- DATA IS DELIBERATELY KEPT. tms_incharge_attendance_strike (167 rows),
-- tms_incharge_probation (30 rows) and tms_incharge_month_verdict are NOT
-- dropped: they are the audit trail behind the 2026-08-14 run that removed 35
-- in-charges and raised Rs 4,44,850 in bills. Those bills still exist in the
-- fee ledger, so the record of why they were raised must outlive the feature.
-- The tables simply become read-only history with no writer.
--
-- Only 'tms-incharge-attendance' was ever actually scheduled in production; the
-- other two migrations were written but deliberately left unapplied. All three
-- are unscheduled defensively so this is correct against any environment.
do $$
declare
  j text;
begin
  foreach j in array array[
    'tms-incharge-attendance',
    'tms-incharge-month-verdict'
  ]
  loop
    -- cron.unschedule throws if the job does not exist, so probe first: this
    -- migration must be a no-op on an environment that never scheduled them.
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
      raise notice 'unscheduled %', j;
    end if;
  end loop;
end $$;

-- Verify:
--   select jobname from cron.job where jobname like '%incharge%';
-- Applied 2026-08-27: this now returns NO rows. The share-ownership recompute
-- ('tms-incharge-allocation-reconcile') is retained in code as part of the
-- assignment system, but its scheduling migration was never applied here, so
-- there is nothing left in cron.job matching 'incharge'.
