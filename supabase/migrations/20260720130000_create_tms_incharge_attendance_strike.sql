-- Strike ledger for the bus in-charge attendance enforcement loop.
-- One row per tms_staff_route_assignment. Doubles as (a) the audit trail of
-- exactly which dates triggered a financial action and (b) the per-day
-- idempotency guard (last_evaluated_date) so a double cron fire is a no-op.

create table if not exists public.tms_incharge_attendance_strike (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null
    references public.tms_staff_route_assignment(id) on delete cascade,
  staff_email text not null,
  route_id uuid references public.tms_route(id) on delete set null,
  consecutive_misses integer not null default 0,
  missed_dates date[] not null default '{}',
  last_evaluated_date date,
  warned_at timestamptz,
  removed_at timestamptz,
  billing_status text check (billing_status in ('billed','no_structure','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id)
);

create index if not exists idx_tms_ias_staff_email
  on public.tms_incharge_attendance_strike (staff_email);
create index if not exists idx_tms_ias_last_evaluated
  on public.tms_incharge_attendance_strike (last_evaluated_date);

alter table public.tms_incharge_attendance_strike enable row level security;
-- Service-role only (the cron). No policies = no anon/authenticated access,
-- matching the modern tms_ pattern.
