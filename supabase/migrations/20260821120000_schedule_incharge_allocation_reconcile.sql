-- ⚠ NOT YET APPLIED. Apply only after the branch is deployed.
--
-- This schedules a nightly job that GETs /api/cron/incharge-allocation-reconcile
-- on the deployed app. That route ships with this branch and does not exist in
-- production yet, so applying this before deploy produces nightly 404s.

-- Schedule the in-charge share allocation reconcile.
--
-- The share allocation is kept fresh by explicit recompute hooks on the admin
-- paths that change a roster, but those hooks are best-effort BY DESIGN: they
-- must never fail the admin action that triggered them. Learners also move
-- between routes through route optimization (lib/route-optimization/apply.ts)
-- and through direct database edits, neither of which calls a hook at all.
-- This job is the drift safety net, and without it scheduled the safety net
-- simply never runs -- an in-charge can be scored, and eventually billed,
-- against a share that no longer matches the bus.
--
-- The job is NOT a rebalance: splitRouteShare is deterministic, so a route
-- whose allocation already matches its roster is left untouched. Only genuine
-- drift causes a write.
--
-- Vercel crons have never fired on this project (proxy.ts 401'd them before the
-- handler ran), so scheduling goes through pg_cron + pg_net exactly like
-- tms-auto-generate-bills, tms-incharge-attendance and
-- tms-incharge-month-verdict. Both vault secrets already exist.
--
-- '30 14 * * *' UTC = 20:00 IST, chosen for two reasons:
--   1. It is one hour BEFORE tms-incharge-attendance (30 15 UTC / 21:00 IST),
--      so each day is scored against an allocation that has just been
--      reconciled rather than one a day stale. It is also clear of
--      tms-incharge-month-verdict (0 16 UTC / 21:30 IST), so the two jobs that
--      read the allocation never contend with the job that rewrites it.
--   2. 20:00 IST is after the onward marking window has closed for the day, so
--      no allocation is being rewritten underneath an in-charge who is mid-way
--      through marking their share.
-- (tms-trip-expiry runs '*/5 * * * *' and will always overlap something; it is
-- a few-row update and does not touch these tables.)
--
-- This job moves no money and revokes no role -- it only repairs allocation
-- rows -- so it is deliberately NOT gated on inchargeEnforcementMode or
-- inchargeShareScoringEnabled. A correct allocation while the feature is
-- dormant is exactly what makes the eventual dry run trustworthy.

-- cron.schedule upserts by jobname in pg_cron >= 1.4, but unschedule-first keeps
-- this migration replayable on any version.
do $$
begin
  perform cron.unschedule('tms-incharge-allocation-reconcile');
exception when others then
  null; -- job did not exist
end $$;

select cron.schedule(
  'tms-incharge-allocation-reconcile',
  '30 14 * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
           || '/api/cron/incharge-allocation-reconcile',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret')),
    timeout_milliseconds := 180000
  );
  $$
);

-- ── Verification (run separately after applying) ─────────────────────────────
--   select jobname, schedule, active from cron.job
--    where jobname = 'tms-incharge-allocation-reconcile';
--   -- The route reports what it WOULD change in its summary; the initial
--   -- backfill is the same URL with ?force=1, which recomputes every route.
