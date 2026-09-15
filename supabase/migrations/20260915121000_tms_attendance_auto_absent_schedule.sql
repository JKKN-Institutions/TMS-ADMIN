-- Run the auto-absent job every 10 minutes.
-- Apply AFTER the app deploy that labels 'auto' marks, and before 07:00 IST or
-- during the morning window: the first run closes every trip already ended today.
-- Off switch:
--   select cron.unschedule('tms-attendance-auto-absent');
select cron.unschedule(jobid) from cron.job where jobname = 'tms-attendance-auto-absent';
select cron.schedule(
  'tms-attendance-auto-absent',
  '*/10 * * * *',
  $$select public.tms_auto_close_attendance()$$
);
