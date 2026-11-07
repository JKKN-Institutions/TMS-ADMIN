-- ─────────────────────────────────────────────────────────────────────────────
-- tms_pre_trip_check — the driver's daily pre-trip check (Director, 7 Nov 2026).
--
-- Before the FIRST trip of the day on a bus, the driver taps yes/no for six items
-- (tyres, brakes, lights, horn, fuel level, first-aid box) and photographs the
-- odometer. Any "no" alerts the transport head (in the app, via tms_notification).
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
  -- Filled when the trip this check cleared is started. Nullable: the check is
  -- made BEFORE the trip exists.
  trip_id              uuid references public.tms_trip(id),
  -- Same IST-day default as tms_trip.travel_date, so a 5:30 am check is "today".
  check_date           date not null default (now() at time zone 'Asia/Kolkata')::date,
  -- One column per item: true = OK, false = problem. Fixed list by design.
  tyres_ok             boolean not null,
  brakes_ok            boolean not null,
  lights_ok            boolean not null,
  horn_ok              boolean not null,
  fuel_level_ok        boolean not null,
  first_aid_box_ok     boolean not null,
  odometer_km          numeric not null check (odometer_km >= 0 and odometer_km < 10000000),
  -- Path inside the private tms-pre-trip-photos bucket.
  odometer_photo_path  text not null,
  -- Derived, so it can never disagree with the six answers.
  any_issue            boolean generated always as (
                         not (tyres_ok and brakes_ok and lights_ok and horn_ok
                              and fuel_level_ok and first_aid_box_ok)
                       ) stored,
  notes                text check (notes is null or char_length(notes) <= 1000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid
);

-- One check per driver, bus and day. A second trip the same day reuses it.
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
-- The app writes through service-role API routes (like tms_trip). These policies
-- make a direct client query behave correctly rather than leak or silently fail:
--   • a driver reads and inserts only their own rows. "Own" honours BOTH links,
--     tms_driver.profile_id and staff.profile_id, exactly like
--     tms_trip_select_own_driver (3 of 30 drivers have no profile_id today).
--   • the transport head (tms.dashboard.view — held only by transport_head) and
--     super admins read every row.
-- No UPDATE or DELETE policy: a submitted check is a record, not a draft.
alter table public.tms_pre_trip_check enable row level security;

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

drop policy if exists tms_pre_trip_check_insert_own_driver on public.tms_pre_trip_check;
create policy tms_pre_trip_check_insert_own_driver on public.tms_pre_trip_check
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
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

-- The app uploads server-side with the service role, under <auth uid>/<date>/...
-- These owner-only policies are a backstop for any direct client call: a user may
-- upload to and read only their own folder. Transport head / super admins see
-- photos through signed URLs minted by the server, not through a policy here.
drop policy if exists tms_pre_trip_photos_insert_own on storage.objects;
create policy tms_pre_trip_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tms-pre-trip-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists tms_pre_trip_photos_select_own on storage.objects;
create policy tms_pre_trip_photos_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tms-pre-trip-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No SECURITY DEFINER function is added by this migration.

-- ── Verification (run separately after applying) ─────────────────────────────
--   select count(*) from public.tms_pre_trip_check;                         -- 0
--   select id, public, file_size_limit from storage.buckets where id = 'tms-pre-trip-photos';
--   select policyname, cmd from pg_policies where tablename = 'tms_pre_trip_check';  -- 3 rows
--   select policyname from pg_policies where schemaname = 'storage'
--     and policyname like 'tms_pre_trip_photos_%';                          -- 2 rows
