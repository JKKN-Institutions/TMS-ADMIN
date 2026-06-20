-- ─────────────────────────────────────────────────────────────────────────────
-- tms_booking: per-learner, per-day whole-day travel booking.
--
-- One booking row (UNIQUE per learner+date) authorizes BOTH the onward and return
-- scans for that date. A learner with no 'booked' row for today cannot pull a
-- boarding pass or be scanned (enforced in app code). Walk-ups (unbooked learners
-- boarded by staff when seats remain) are recorded on tms_attendance via the new
-- is_walk_up flag, NOT here.
--
-- Target: shared MyJKKN Supabase project (ref: kvizhngldtiuufknvehv). Additive only.
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tms_booking (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners_profiles(id) on delete cascade,
  route_id uuid not null references public.tms_route(id),       -- snapshot of assignment at booking time
  stop_id uuid references public.tms_route_stop(id),            -- snapshot
  travel_date date not null,
  status text not null default 'booked' check (status in ('booked','cancelled')),
  booked_at timestamptz not null default now(),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (learner_id, travel_date)
);

create index if not exists idx_tms_booking_date_route on public.tms_booking(travel_date, route_id, status);
create index if not exists idx_tms_booking_learner_date on public.tms_booking(learner_id, travel_date);

drop trigger if exists trg_tms_booking_updated_at on public.tms_booking;
create trigger trg_tms_booking_updated_at
  before update on public.tms_booking
  for each row execute function public.tms_set_updated_at();

alter table public.tms_booking enable row level security;
-- Writes go through the service-role client (RLS bypassed); learners may read their own.
drop policy if exists tms_booking_learner_select on public.tms_booking;
create policy tms_booking_learner_select on public.tms_booking
  for select using (
    learner_id in (select lp.id from public.learners_profiles lp where lp.profile_id = auth.uid())
  );

-- Walk-up flag on attendance (booked-and-present vs walk-up reporting).
alter table public.tms_attendance
  add column if not exists is_walk_up boolean not null default false;

-- Grant the learner self-booking permission to the existing student role.
update public.custom_roles
set permissions = permissions || '{"tms.bookings.self": true}'::jsonb,
    updated_at = now()
where role_key = 'student'
  and not (permissions ? 'tms.bookings.self');
