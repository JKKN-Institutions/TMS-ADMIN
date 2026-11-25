-- ⚠ NOT YET APPLIED. Apply only after the proxy allowlist entry for
-- /api/cron/booking-reminders is deployed, otherwise the job is 401'd every day.
--
-- Applying this STARTS the daily sends: every working day at 17:00 IST, each
-- learner with a route, a paid Term 1 and no booking for the next bookable day
-- gets one inbox + push reminder. Until now the reminder was scheduled from
-- vercel.json and never ran (the proxy 401'd it), so this is new to learners.
-- Off switch without unscheduling: Settings -> Scheduling -> autoNotifyPassengers.
--
-- Same pg_cron + pg_net mechanism as tms-fee-payment-notices and
-- tms-auto-generate-bills. 11:30 UTC = 17:00 IST, before the booking cutoff.
-- Idempotent per learner and date, so a retried run cannot double-notify.

do $$
begin
  perform cron.unschedule('tms-booking-reminders');
exception when others then
  null; -- job did not exist
end $$;

select cron.schedule(
  'tms-booking-reminders',
  '30 11 * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
           || '/api/cron/booking-reminders',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret')),
    timeout_milliseconds := 120000
  );
  $$
);

-- Verification (run separately after applying):
--   select jobname, schedule, active from cron.job where jobname = 'tms-booking-reminders';
-- Preview the audience without notifying anyone:
--   GET /api/cron/booking-reminders?dryRun=1   (with the Bearer secret)
