-- One level of mark history on tms_attendance.
--
-- Boarding staff share ONE roster row per learner-day and first mark wins
-- (lib/boarding/attendance-ownership.ts). Two paths may still overwrite an
-- existing mark: a transport-head correction, and a QR scan — which is physical
-- proof of boarding and so may flip absent -> present.
--
-- When that happens the roster must be able to show WHAT it overwrote,
-- "(was Absent · Saranya G · 7:30 AM)", without walking the activity log on every
-- render. One level is enough for that; the activity log keeps the full trail.
--
-- Additive only: nothing is dropped, no existing constraint changes, and the
-- unique (learner_id, trip_date, direction) key is deliberately untouched —
-- attendance stays shared across the route's staff.
alter table public.tms_attendance
  add column if not exists previous_status     text,
  add column if not exists previous_scanned_by uuid references public.profiles(id) on delete set null,
  add column if not exists previous_scanned_at timestamptz;

-- Mirrors the existing status check. Guarded so the migration is re-runnable.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tms_attendance_previous_status_check'
  ) then
    alter table public.tms_attendance
      add constraint tms_attendance_previous_status_check
      check (previous_status is null or previous_status in ('present', 'absent'));
  end if;
end $$;

-- ── Verification (run separately after applying) ─────────────────────────────
--   select column_name from information_schema.columns
--   where table_name = 'tms_attendance' and column_name like 'previous_%';
--   -- Expect exactly 3 rows.
