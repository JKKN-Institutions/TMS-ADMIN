-- Apply only AFTER the app is deployed AND a test mail has been approved, or
-- the job 404s daily / mails the transport heads something nobody has checked.
-- Same pg_cron + pg_net + vault mechanism as tms-incharge-bill-review.
-- 04:30 UTC = 10:00 IST, after the morning boarding burst (scans land 7-9 am),
-- because "booked but nobody scanned" means nothing before the buses have run.
-- The route itself skips Sundays, declared holidays and all-clear days, and
-- sends at most one mail per IST date.

do $$
begin
  perform cron.unschedule('tms-attention-digest');
exception when others then
  null; -- job did not exist
end $$;

select cron.schedule(
  'tms-attention-digest',
  '30 4 * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
           || '/api/cron/attention-digest',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret')),
    timeout_milliseconds := 60000
  );
  $$
);

-- Verify: select jobname, schedule, active from cron.job where jobname = 'tms-attention-digest';
-- Off switch: select cron.unschedule('tms-attention-digest');
