-- ⚠ NOT YET APPLIED. Deferred deliberately.
--
-- This schedules a nightly job that GETs /api/cron/incharge-month-verdict on
-- the deployed app. That route ships with this branch and does not exist in
-- production yet, so applying this before deploy produces nightly 404s.
-- Apply only after the branch is deployed.

-- Schedule the bus in-charge month-end verdict.
--
-- Vercel crons have never fired on this project, so scheduling goes through
-- pg_cron + pg_net exactly like tms-auto-generate-bills and
-- tms-incharge-attendance. Both vault secrets already exist.
--
-- '0 16 28-31 * *' UTC = 21:30 IST on the 28th-31st. The job itself only acts
-- on the day it is run for, and its upsert on (staff_email, month) makes a
-- repeat run on the 29th, 30th and 31st idempotent -- which is exactly why the
-- schedule can be this crude rather than computing the true month end in cron
-- syntax, which cron cannot express.
--
-- This crude "fire every day from the 28th" schedule is only safe because the
-- ROUTE carries a matching guard: app/api/cron/incharge-month-verdict/route.ts
-- refuses to ACT (cancel/bill/revoke/notify) unless today is truly the last
-- day of the verdict month, or an explicit ?month= was supplied. On the
-- 28th-30th it still RECORDS the verdict in shadow -- harmless, since that is
-- the whole point of shadow -- but withholds the money/role side effects.
-- Do not "simplify" this schedule to a single fixed day without checking that
-- guard first: the schedule and the route's date check are a matched pair,
-- and removing either half on its own reintroduces the bug it closes (the
-- job settling the month three days early on non-idempotent side effects).
--
-- The job records verdicts but cancels, bills, revokes and notifies NOBODY
-- until inchargeEnforcementMode is switched from 'shadow' to 'enforce' on
-- Settings -> Scheduling.

do $$
begin
  perform cron.unschedule('tms-incharge-month-verdict');
exception when others then
  null; -- job did not exist
end $$;

select cron.schedule(
  'tms-incharge-month-verdict',
  '0 16 28-31 * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
           || '/api/cron/incharge-month-verdict',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret')),
    timeout_milliseconds := 180000
  );
  $$
);

-- ── Verification (run separately after applying) ─────────────────────────────
--   select jobname, schedule, active from cron.job
--    where jobname = 'tms-incharge-month-verdict';
