-- ─────────────────────────────────────────────────────────────────────────────
-- tms_pre_trip_check — the driver's daily pre-trip check (Director, 7 Nov 2026;
-- reminder-not-block ruling 8 Nov 02:4x).
--
-- Once a day per bus, the driver taps yes/no for six items (tyres, brakes, lights,
-- horn, fuel level, first-aid box) and photographs the odometer — OR records a skip
-- with a reason ("Camera not working", "No network", "Emergency trip", "Other: …").
-- The check NEVER blocks a trip: live tracking must not stop. Any "no", and any
-- skip, alerts the transport head (in the app, via tms_notification).
--
-- NOT the old Bus Inspection (tms_inspection): that was the transport head's
-- periodic 25-item inspection, removed from the app by 20260923120000 and holding
-- one live row from 21 Sep. This is a separate, daily, driver-owned record.
--
-- Shared MyJKKN database — additive only, idempotent. Touches no existing row.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tms_pre_trip_check (
  id                   uuid primary key default gen_random_uuid(),
  driver_id            uuid not null references public.tms_driver(id),
  vehicle_id           uuid not null references public.tms_vehicle(id),
  -- The trip this check belongs to: filled when a trip starts after the check, or
  -- when the check is done during a running trip. Nullable.
  trip_id              uuid references public.tms_trip(id),
  -- Same IST-day default as tms_trip.travel_date, so a 5:30 am check is "today".
  check_date           date not null default (now() at time zone 'Asia/Kolkata')::date,
  -- true = the driver skipped the check; skip_reason then says why.
  skipped              boolean not null default false,
  skip_reason          text,
  -- One column per item: true = OK, false = problem. Fixed list by design.
  -- Null only on a skipped row (see tms_pre_trip_check_done_or_skipped).
  tyres_ok             boolean,
  brakes_ok            boolean,
  lights_ok            boolean,
  horn_ok              boolean,
  fuel_level_ok        boolean,
  first_aid_box_ok     boolean,
  odometer_km          numeric check (odometer_km >= 0 and odometer_km < 10000000),
  -- Path inside the private tms-pre-trip-photos bucket. Null only on a skipped row.
  odometer_photo_path  text,
  -- Derived, so it can never disagree with the answers: any "no", or a skip.
  any_issue            boolean generated always as (
                         skipped or not coalesce(
                           tyres_ok and brakes_ok and lights_ok and horn_ok
                           and fuel_level_ok and first_aid_box_ok, false)
                       ) stored,
  notes                text check (notes is null or char_length(notes) <= 1000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  -- A row is EITHER a full check (all six answers, odometer, photo, no reason)
  -- OR a skip with a non-empty reason. Nothing in between.
  constraint tms_pre_trip_check_done_or_skipped check (
    (skipped
      and skip_reason is not null
      and char_length(btrim(skip_reason)) between 1 and 500)
    or
    (not skipped
      and skip_reason is null
      and tyres_ok is not null and brakes_ok is not null and lights_ok is not null
      and horn_ok is not null and fuel_level_ok is not null and first_aid_box_ok is not null
      and odometer_km is not null and odometer_photo_path is not null)
  )
);

-- One record (check or skip) per driver, bus and day. A second trip the same day
-- does not ask again.
create unique index if not exists tms_pre_trip_check_one_per_day
  on public.tms_pre_trip_check (driver_id, vehicle_id, check_date);
create index if not exists tms_pre_trip_check_vehicle_date
  on public.tms_pre_trip_check (vehicle_id, check_date desc);
create index if not exists tms_pre_trip_check_issues
  on public.tms_pre_trip_check (check_date desc) where any_issue;

-- tms_set_updated_at() is shared by 10+ tables (see 20260921100000); reuse, never redefine.
drop trigger if exists trg_tms_pre_trip_check_updated_at on public.tms_pre_trip_check;
create trigger trg_tms_pre_trip_check_updated_at before update on public.tms_pre_trip_check
  for each row execute function public.tms_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- ALL writes go through the service-role API route (POST /api/driver/pre-trip-check),
-- which uploads the photo and resolves the bus from the route. There is deliberately
-- NO insert/update/delete policy: a client-side insert could invent a photo path,
-- bus, date or skip and mark the day's check as done. Read policies only:
--   • a driver reads only their own rows. "Own" honours BOTH links,
--     tms_driver.profile_id and staff.profile_id, exactly like
--     tms_trip_select_own_driver (3 of 30 drivers have no profile_id today).
--   • the transport head (tms.dashboard.view — held only by transport_head) and
--     super admins read every row.
alter table public.tms_pre_trip_check enable row level security;
-- Matches tms_trip's live grants: the anon role gets nothing.
revoke all on public.tms_pre_trip_check from anon;

drop policy if exists tms_pre_trip_check_select_own_driver on public.tms_pre_trip_check;
create policy tms_pre_trip_check_select_own_driver on public.tms_pre_trip_check
  for select to authenticated
  using (
    exists (
      select 1
      from public.tms_driver d
      left join public.staff s on s.id = d.staff_id
      where d.id = tms_pre_trip_check.driver_id
        and (d.profile_id = auth.uid() or s.profile_id = auth.uid())
    )
  );

drop policy if exists tms_pre_trip_check_select_transport_head on public.tms_pre_trip_check;
create policy tms_pre_trip_check_select_transport_head on public.tms_pre_trip_check
  for select to authenticated
  using (public.is_super_admin() or public.user_has_permission('tms.dashboard.view'));

-- ── Odometer photos ──────────────────────────────────────────────────────────
-- A NEW private bucket. tms-inspection-photos is not reused: 20260923120000 queues
-- it for removal via the Storage API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tms-pre-trip-photos', 'tms-pre-trip-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- NO storage.objects policies, like every other TMS bucket: the API uploads and
-- mints signed URLs with the service role. A client policy would let any signed-in
-- account (learners included) upload images here. This file does not touch
-- storage.objects at all.

-- No SECURITY DEFINER function is added by this migration.

-- ── Verification (run separately after applying) ─────────────────────────────
--   select count(*) from public.tms_pre_trip_check;                         -- 0
--   select id, public, file_size_limit from storage.buckets where id = 'tms-pre-trip-photos';
--   select policyname, cmd from pg_policies where tablename = 'tms_pre_trip_check';  -- 2 rows, both SELECT
--   select count(*) from pg_policies where schemaname = 'storage'
--     and coalesce(qual, '') || coalesce(with_check, '') like '%tms-pre-trip-photos%';  -- 0
--   select has_table_privilege('anon', 'public.tms_pre_trip_check', 'select');        -- false
