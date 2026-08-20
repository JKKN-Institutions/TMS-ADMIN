-- Manual, stop-wise transport FINES.
--
-- Two tables, and one deliberate absence: fines do NOT go into tms_fee_bill.
--   1. tms_fee_bill carries UNIQUE (fee_structure_id, person_id, term_no,
--      transport_year_id) — repeat fines for one learner in one year cannot
--      exist there without inventing fake term numbers.
--   2. tms_student_transport_access (SECURITY DEFINER, live) counts every
--      tms_fee_bill row with status='generated' and a past due_date as overdue,
--      and reads term_no=1 to decide term1_paid. A fine in that table would lock
--      learners out of the student portal and could corrupt the Term-1 gate.
-- Keeping fines in their own ledger means that RPC needs no change at all.

-- 1. The fine sheet: one amount per stop per TRANSPORT YEAR (not per fee
--    structure) — every learner has a stop regardless of which structure bills
--    them, so one sheet prices flat, tiered and stop_wise cohorts alike.
create table if not exists public.tms_fine_stop_rate (
  id                uuid primary key default gen_random_uuid(),
  transport_year_id uuid not null references public.tms_transport_year(id) on delete cascade,
  stop_id           uuid not null references public.tms_route_stop(id)     on delete cascade,
  fine_amount       numeric(12,2) not null check (fine_amount >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid,
  constraint tms_fine_stop_rate_unique unique (transport_year_id, stop_id)
);

create index if not exists idx_tms_fine_stop_rate_year
  on public.tms_fine_stop_rate (transport_year_id);

-- 2. The fine ledger. stop_id/route_id are SNAPSHOTS: a learner who changes
--    stop later must not retroactively change what an issued fine was priced
--    from. source_bill_id is provenance only (which Bill Management row was
--    ticked) and is ON DELETE SET NULL so fee-bill cleanup can never
--    cascade-delete money history.
--
--    status holds only what TMS decides: generated | cancelled. Whether a fine
--    is PAID is owned by the money row (billing_student_bills), because
--    collection happens in MyJKKN and TMS never observes the payment event.
--    A second 'paid' flag here would be a source of truth nothing keeps in sync.
create table if not exists public.tms_fee_fine (
  id                      uuid primary key default gen_random_uuid(),
  transport_year_id       uuid not null references public.tms_transport_year(id),
  person_id               uuid not null,
  person_type             text not null default 'learner'
                            check (person_type = 'learner'),
  stop_id                 uuid references public.tms_route_stop(id) on delete set null,
  route_id                uuid references public.tms_route(id)      on delete set null,
  fine_amount             numeric(12,2) not null check (fine_amount > 0),
  due_date                date not null,
  reason                  text not null,
  source_bill_id          uuid references public.tms_fee_bill(id) on delete set null,
  billing_student_bill_id uuid references public.billing_student_bills(id) on delete cascade,
  status                  text not null default 'generated'
                            check (status in ('generated', 'cancelled')),
  idempotency_key         text not null,
  created_at              timestamptz not null default now(),
  created_by              uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  cancel_reason           text,
  constraint tms_fee_fine_idem_unique unique (idempotency_key)
);

create index if not exists idx_tms_fee_fine_year_person
  on public.tms_fee_fine (transport_year_id, person_id);
create index if not exists idx_tms_fee_fine_year_status
  on public.tms_fee_fine (transport_year_id, status);

-- RLS enabled with NO policies: deny-all for anon/authenticated, service-role
-- bypasses. Matches every sibling tms_fee_* table.
alter table public.tms_fine_stop_rate enable row level security;
alter table public.tms_fee_fine       enable row level security;

comment on table public.tms_fine_stop_rate is
  'Per-boarding-stop fine amount for one transport year. Priced independently of the fee stop rates.';
comment on table public.tms_fee_fine is
  'Manual transport fine ledger. Deliberately separate from tms_fee_bill so fines cannot affect the portal access gate or the fee reconciliation invariant.';
