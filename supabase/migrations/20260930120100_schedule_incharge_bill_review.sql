-- Apply only AFTER the app is deployed, or the job 404s nightly.
-- Same pg_cron + pg_net + vault mechanism as tms-fee-payment-notices.
-- 21:30 UTC = 03:00 IST. Reviews the previous month; idempotent.

do $$
begin
  perform cron.unschedule('tms-incharge-bill-review');
exception when others then
  null; -- job did not exist
end $$;

select cron.schedule(
  'tms-incharge-bill-review',
  '30 21 * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
           || '/api/cron/incharge-bill-review',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret')),
    timeout_milliseconds := 120000
  );
  $$
);

-- Verify: select jobname, schedule, active from cron.job where jobname = 'tms-incharge-bill-review';
-- Off switch: select cron.unschedule('tms-incharge-bill-review');
