-- ─────────────────────────────────────────────────────────────────────────────
-- tms_trip — the driver trip/tracking-session backbone.
--
-- Before this, "START TRIP" was a boolean (tms_driver.location_sharing_enabled)
-- plus active_route_id, so there was no trip_id, no history, no summary, and no
-- duplicate-session detection. Nothing cleared the flag except an explicit "Go Off
-- Duty" tap, so closed browsers left routes "sharing" for weeks.
--
-- Shared MyJKKN database — additive only, idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tms_trip (
  id               uuid primary key default gen_random_uuid(),
  route_id         uuid not null references public.tms_route(id),
  driver_id        uuid not null references public.tms_driver(id),
  vehicle_id       uuid not null references public.tms_vehicle(id),
  travel_date      date not null default (now() at time zone 'Asia/Kolkata')::date,
  direction        text not null default 'onward'
                     check (direction in ('onward','return')),
  status           text not null default 'active'
                     check (status in ('active','completed','expired','cancelled')),
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  end_reason       text check (end_reason in ('driver','auto_expiry','admin')),
  last_fix_at      timestamptz,
  start_latitude   numeric,
  start_longitude  numeric,
  end_latitude     numeric,
  end_longitude    numeric,
  distance_km      numeric not null default 0,
  fix_count        integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid
);

-- Duplicate-session prevention, enforced by the database rather than app logic.
--
-- Deliberately NOT keyed on (route_id, travel_date, direction): that would cap a
-- route at one onward trip per day, so a driver who ends a trip early and restarts
-- would hit a constraint violation. Constraining only ACTIVE rows gives the
-- guarantee we want (one live session per route / driver / bus) while allowing
-- any number of trips per day.
create unique index if not exists tms_trip_one_active_per_route
  on public.tms_trip (route_id) where status = 'active';
create unique index if not exists tms_trip_one_active_per_driver
  on public.tms_trip (driver_id) where status = 'active';
-- Safe today: 0 routes share a vehicle. Two active trips on one bus would corrupt
-- the shared tms_vehicle.current_* position under last-write-wins.
create unique index if not exists tms_trip_one_active_per_vehicle
  on public.tms_trip (vehicle_id) where status = 'active';

create index if not exists tms_trip_route_date
  on public.tms_trip (route_id, travel_date desc);
create index if not exists tms_trip_active
  on public.tms_trip (status) where status = 'active';

-- Link position history to trips. Nullable so the ~27,800 pre-existing rows are
-- untouched and keep meaning exactly what they meant.
alter table public.gps_location_history
  add column if not exists trip_id uuid references public.tms_trip(id);
create index if not exists gps_location_history_trip
  on public.gps_location_history (trip_id) where trip_id is not null;

-- Reads/writes go through service-role API routes. RLS is enabled with one explicit
-- own-driver read policy so a direct client query fails visibly rather than silently
-- returning an empty set.
alter table public.tms_trip enable row level security;

drop policy if exists tms_trip_select_own_driver on public.tms_trip;
create policy tms_trip_select_own_driver on public.tms_trip
  for select to authenticated
  using (
    exists (
      select 1
      from public.tms_driver d
      left join public.staff s on s.id = d.staff_id
      where d.id = tms_trip.driver_id
        and (d.profile_id = auth.uid() or s.profile_id = auth.uid())
    )
  );

-- ── Configurable thresholds ──────────────────────────────────────────────────
-- Defaults mirror the constants already in the code, so inserting this row changes
-- no behaviour on its own.
insert into public.admin_settings (setting_type, settings_data, updated_at)
values (
  'tracking',
  jsonb_build_object(
    'liveMaxSec', 120,
    'staleMaxSec', 300,
    'offlineMaxMin', 30,
    'tripExpiryMin', 30,
    'unexpectedStopMin', 10,
    'minAccuracyM', 100,
    'stopGeofenceM', 150
  ),
  now()
)
on conflict (setting_type) do nothing;

-- ── Permission ───────────────────────────────────────────────────────────────
-- Data-driven and idempotent, matching 20260703121000_seed_tms_notification_permissions.sql:
-- grant to every role that can already broadcast location, rather than hardcoding
-- role_key values that would miss any role added later.
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb)
                  || '{"tms.tracking.trip.manage": true}'::jsonb,
    updated_at = now()
where coalesce((permissions ->> 'tms.tracking.share')::boolean, false) = true;

-- ── One-time cleanup of stuck sessions ───────────────────────────────────────
-- Two drivers are flagged as sharing while reporting nothing. There is no trip to
-- migrate them into (they are not transmitting), so clear the flags. Those drivers
-- must tap START TRIP again — user-visible and intended.
update public.tms_driver
set location_sharing_enabled = false,
    active_route_id = null,
    location_sharing_started_at = null
where location_sharing_enabled = true;

-- ── Verification (run separately after applying) ─────────────────────────────
--   select count(*) from public.tms_trip;                                   -- 0
--   select count(*) from public.tms_driver where location_sharing_enabled;  -- 0
--   select settings_data from public.admin_settings where setting_type='tracking';
--   select count(*) from public.custom_roles where permissions ? 'tms.tracking.trip.manage';
