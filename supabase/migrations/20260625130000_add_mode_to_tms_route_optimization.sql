-- Add apply-mode to optimization runs: 'today_booking' mutates tms_booking for the
-- date; 'permanent' mutates learners_profiles standing allocation. Existing rows are
-- today_booking (Phase 2 behavior). Additive, idempotent.
alter table public.tms_route_optimization
  add column if not exists mode text not null default 'today_booking'
  check (mode in ('today_booking','permanent'));
