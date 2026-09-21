-- ⚠ NOT YET APPLIED. Apply only after the branch is deployed, otherwise the job
-- 404s every 5 minutes. Applying it does NOT start charging: the sweep is a
-- no-op until an admin turns the switch on in Settings → Fee Notice.
--
-- Same pg_cron + pg_net mechanism as tms-auto-generate-bills (Vercel crons have
-- never fired on this project). Every 5 minutes, so a Transport Fee lands at
-- most ~5 minutes after a learner's 48 hours end.

do $$
begin
  perform cron.unschedule('tms-fee-payment-notices');
exception when others then
  null; -- job did not exist
end $$;

select cron.schedule(
  'tms-fee-payment-notices',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
           || '/api/cron/fee-payment-notices',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret')),
    timeout_milliseconds := 120000
  );
  $$
);

-- Verification (run separately after applying):
--   select jobname, schedule, active from cron.job where jobname = 'tms-fee-payment-notices';
