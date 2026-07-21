-- Stop-wise transport fees (Arts Aided).
--
-- Adds fee_mode 'stop_wise': the annual amount is chosen by the student's
-- BOARDING STOP (learners_profiles.transport_stop_id -> tms_route_stop.id),
-- then split across a shared percentage-based instalment schedule.
--
-- The rate hangs off the FEE STRUCTURE, not off tms_route_stop, because Aided
-- and Self students board the same physical stops and must be priced
-- differently. No existing table's columns change.

-- 1. Additive CHECK value. Verified constraint name/definition on 2026-07-21:
--    tms_fee_structure_fee_mode_check CHECK (fee_mode = ANY (ARRAY['flat','tiered']))
alter table public.tms_fee_structure
  drop constraint if exists tms_fee_structure_fee_mode_check;
alter table public.tms_fee_structure
  add constraint tms_fee_structure_fee_mode_check
  check (fee_mode in ('flat', 'tiered', 'stop_wise'));

-- 2. Per-stop annual rate.
--    stop_id ONLY: the route is derived via tms_route_stop.route_id, so a
--    denormalised route_id cannot drift out of sync with the stop.
create table if not exists public.tms_fee_structure_stop_rate (
  id               uuid primary key default gen_random_uuid(),
  fee_structure_id uuid not null references public.tms_fee_structure(id) on delete cascade,
  stop_id          uuid not null references public.tms_route_stop(id)    on delete cascade,
  annual_amount    numeric(12,2) not null check (annual_amount >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint tms_fee_stop_rate_unique unique (fee_structure_id, stop_id)
);

create index if not exists idx_tms_fee_stop_rate_structure
  on public.tms_fee_structure_stop_rate (fee_structure_id);

-- 3. The shared instalment schedule for stop_wise structures.
--    Stores a percentage SHARE, not a rupee amount: the rupee value is unknown
--    until the student's stop is known. That is why this does not reuse
--    tms_fee_structure_term, whose `amount` column is meaningless here.
create table if not exists public.tms_fee_structure_stop_term (
  id               uuid primary key default gen_random_uuid(),
  fee_structure_id uuid not null references public.tms_fee_structure(id) on delete cascade,
  term_no          int  not null,
  term_label       text,
  due_date         date not null,
  share_percent    numeric(5,2) not null check (share_percent > 0 and share_percent <= 100),
  created_at       timestamptz not null default now(),
  constraint tms_fee_stop_term_unique unique (fee_structure_id, term_no)
);

create index if not exists idx_tms_fee_stop_term_structure
  on public.tms_fee_structure_stop_term (fee_structure_id);

comment on table public.tms_fee_structure_stop_rate is
  'Per-boarding-stop annual transport fee for a stop_wise fee structure.';
comment on table public.tms_fee_structure_stop_term is
  'Instalment schedule for a stop_wise structure. share_percent across all terms of one structure must sum to 100 (enforced in the API).';
