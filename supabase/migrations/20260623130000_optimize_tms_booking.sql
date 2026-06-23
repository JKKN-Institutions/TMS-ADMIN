-- ─────────────────────────────────────────────────────────────────────────────
-- Redesign tms_booking: lean, date-wise, delete-on-cancel.
--   * Composite PK (learner_id, travel_date) — drops the surrogate uuid id and the
--     redundant unique index (one identity, one index).
--   * Presence = booked. Cancel = DELETE the row. No status/cancelled_at columns,
--     so the table never accumulates dead rows and every read drops its status filter.
--   * Covering index makes the route+date roster/capacity query index-only.
--   * travel_date is in the PK => the table is partition-ready (RANGE) for later.
-- Only 3 throwaway test rows exist, so we drop & recreate. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
drop table if exists public.tms_booking cascade;

create table public.tms_booking (
  learner_id  uuid not null references public.learners_profiles(id) on delete cascade,
  travel_date date not null,
  route_id    uuid not null references public.tms_route(id),       -- snapshot of route at booking time
  stop_id     uuid references public.tms_route_stop(id),           -- snapshot of boarding stop
  booked_at   timestamptz not null default now(),
  booked_by   uuid,                                                -- learner user id (or admin if on-behalf)
  primary key (learner_id, travel_date)
);

create index idx_booking_route_date
  on public.tms_booking (route_id, travel_date) include (learner_id, stop_id);

alter table public.tms_booking enable row level security;
-- Writes go through the service-role client (RLS bypassed); learners may read their own.
drop policy if exists tms_booking_learner_select on public.tms_booking;
create policy tms_booking_learner_select on public.tms_booking
  for select using (
    learner_id in (select lp.id from public.learners_profiles lp where lp.profile_id = auth.uid())
  );
