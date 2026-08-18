-- Bus in-charge monthly verdict: the two tables the reinstatement half needs.
--
-- tms_incharge_probation is the PLEDGE: a billed staffer accepts "mark every
-- service day until month end and this bill is cancelled". Accepting is what
-- reassigns them, which is what reopens the portal so they can actually mark.
--
-- tms_incharge_month_verdict is the AUDIT TRAIL: one row per person per month
-- recording exactly which days were required, which were marked, and what
-- happened to the bill. Every cancellation and every bill must be explainable
-- from this table alone.

create table if not exists tms_incharge_probation (
  id uuid primary key default gen_random_uuid(),
  staff_email text not null,
  person_id uuid,
  route_id uuid,
  assignment_id uuid,
  accepted_at timestamptz not null default now(),
  window_start date not null,
  window_end date not null,
  status text not null default 'active'
    check (status in ('active', 'passed', 'failed')),
  created_at timestamptz not null default now()
);

-- At most ONE live probation per person. This partial index -- not a
-- check-then-act guard in the route -- is what settles a double-submit race,
-- following the precedent of the active (staff_email, route_id) index on
-- tms_staff_route_assignment.
create unique index if not exists tms_incharge_probation_one_active
  on tms_incharge_probation (lower(staff_email))
  where status = 'active';

create index if not exists tms_incharge_probation_email_idx
  on tms_incharge_probation (lower(staff_email));

create table if not exists tms_incharge_month_verdict (
  id uuid primary key default gen_random_uuid(),
  staff_email text not null,
  person_id uuid,
  route_id uuid,
  month date not null,
  window_start date not null,
  window_end date not null,
  required_days int not null default 0,
  marked_days int not null default 0,
  missed_dates date[] not null default '{}',
  outcome text not null check (outcome in ('passed', 'failed')),
  bill_action text check (bill_action in ('cancelled', 'generated', 'none')),
  was_probation boolean not null default false,
  mode text not null check (mode in ('shadow', 'enforce')),
  decided_at timestamptz not null default now()
);

-- One verdict per person per month makes a re-run idempotent via upsert.
-- Plain columns (not lower(staff_email)) because a later task upserts this
-- table with PostgREST onConflict: 'staff_email,month', which resolves
-- against a unique index on those exact columns and cannot target an
-- expression index.
create unique index if not exists tms_incharge_month_verdict_person_month
  on tms_incharge_month_verdict (staff_email, month);
