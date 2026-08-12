-- ─────────────────────────────────────────────────────────────────────────────
-- Backstop for trip expiry.
--
-- The PRIMARY mechanism is lib/tracking/trips.ts expireStaleTrips(), called on read
-- paths. This job exists only so trips still close when nobody opens a page. It is
-- deliberately the SECONDARY mechanism: this project has two Vercel cron jobs that
-- have never fired in production, so scheduler-only expiry would reproduce the exact
-- stuck-session bug it is meant to fix.
--
-- The threshold is read from admin_settings so it stays in step with the app.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tms_expire_stale_trips()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minutes integer;
  v_count   integer;
begin
  select coalesce((settings_data ->> 'tripExpiryMin')::integer, 30)
    into v_minutes
  from public.admin_settings
  where setting_type = 'tracking';

  v_minutes := coalesce(v_minutes, 30);

  -- Data-modifying CTEs always run to completion even when the primary query does
  -- not read them, so `released` executes regardless of the count below.
  with expired as (
    update public.tms_trip
    set status = 'expired',
        ended_at = now(),
        end_reason = 'auto_expiry',
        updated_at = now()
    where status = 'active'
      and coalesce(last_fix_at, started_at) < now() - make_interval(mins => v_minutes)
    returning id, driver_id
  ),
  released as (
    update public.tms_driver d
    set location_sharing_enabled = false,
        active_route_id = null,
        location_sharing_started_at = null
    from expired e
    where d.id = e.driver_id
    returning d.id
  )
  select count(*)::integer into v_count from expired;

  return coalesce(v_count, 0);
end $$;

comment on function public.tms_expire_stale_trips() is
  'Backstop for trip expiry; the primary path is expireStaleTrips() on API reads.';

-- cron.schedule upserts by jobname in pg_cron >= 1.4, but unschedule-first keeps this
-- migration replayable on any version.
do $$
begin
  perform cron.unschedule('tms-expire-stale-trips');
exception when others then
  null; -- job did not exist
end $$;

select cron.schedule(
  'tms-expire-stale-trips',
  '*/5 * * * *',
  $$select public.tms_expire_stale_trips();$$
);

-- ── Verification (run separately after applying) ─────────────────────────────
--   select jobname, schedule, active from cron.job where jobname='tms-expire-stale-trips';
--   select public.tms_expire_stale_trips();  -- expect 0 with no stale trips
