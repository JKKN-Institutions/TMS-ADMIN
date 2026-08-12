-- Schedule the bus in-charge attendance enforcement loop.
--
-- Vercel crons have never fired on this project (proxy.ts 401'd them before the
-- handler ran), so scheduling goes through pg_cron + pg_net exactly like the
-- live tms-auto-generate-bills job. Both vault secrets already exist.
--
-- 30 15 * * * UTC = 21:00 IST, after both the onward and return legs close.
-- The job itself skips weekends, and it warns, removes and bills NOBODY until
-- the inchargeEnforcementMode setting is switched from its 'shadow' default to
-- 'enforce' on Settings -> Scheduling.

-- cron.schedule upserts by jobname in pg_cron >= 1.4, but unschedule-first keeps
-- this migration replayable on any version.
do $$
begin
  perform cron.unschedule('tms-incharge-attendance');
exception when others then
  null; -- job did not exist
end $$;

select cron.schedule(
  'tms-incharge-attendance',
  '30 15 * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
           || '/api/cron/incharge-attendance',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret'))
  );
  $$
);

-- ── Verification (run separately after applying) ─────────────────────────────
--   select jobname, schedule, active from cron.job where jobname='tms-incharge-attendance';
--   -- Dry run against the deployed app, which writes nothing:
--   --   GET <tms_app_url>/api/cron/incharge-attendance?dryRun=1  with the Bearer secret
