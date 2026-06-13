-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Fees Structure module — schema
--
-- A fee structure is a CONDITION row (institution/degree/department/programme/
-- semester/quota + transport year + audience) carrying a total amount, split into
-- N terms (tms_fee_structure_term), each with its own amount + due date.
--
-- Generation (manual, idempotent) resolves the applicable population and, for
-- LEARNERS, writes real charges into MyJKKN's shared billing_student_bills; every
-- person+term is recorded in tms_fee_bill (the coverage + idempotency ledger).
-- Staff are recorded as 'staff_deferred' in v1 (no billing target for staff yet).
--
-- TMS conventions: tms_ prefix, RLS enabled with NO policies (service-role only),
-- audit columns created_by/updated_by (soft refs to profiles.id, no FK),
-- update_updated_at_column() touch trigger (already exists in this DB).
-- Master-data dimension columns (institution_id, degree_id, …) are soft uuid refs
-- to MyJKKN-owned tables — intentionally NO FK (TMS reads master data, and a
-- NULL dimension means "any", mirroring learners_profiles which stores them the
-- same way). transport_year_id IS FK'd (same module).
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Parent / condition row ----------------------------------------------------
create table if not exists public.tms_fee_structure (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  transport_year_id  uuid not null references public.tms_transport_year(id),
  audience           text not null default 'student' check (audience in ('student','staff')),
  -- condition dimensions; NULL = "any" (no filter on that dimension)
  institution_id     uuid,
  degree_id          uuid,
  department_id      uuid,
  programme_id       uuid,   -- maps to learners_profiles.program_id
  semester_id        uuid,
  quota_id           uuid,
  staff_role_keys    text[], -- audience='staff' only; NULL = all staff roles
  total_amount       numeric(12,2) not null check (total_amount >= 0),
  split_count        int not null default 1 check (split_count >= 1),
  status             text not null default 'draft' check (status in ('draft','active','archived')),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  updated_by         uuid
);

comment on table public.tms_fee_structure is
  'TMS transport fee structures (condition + total + split). Service-role access only; no RLS policies by design.';

create index if not exists idx_tms_fee_structure_year   on public.tms_fee_structure (transport_year_id);
create index if not exists idx_tms_fee_structure_status on public.tms_fee_structure (status);

drop trigger if exists trg_tms_fee_structure_updated_at on public.tms_fee_structure;
create trigger trg_tms_fee_structure_updated_at
  before update on public.tms_fee_structure
  for each row execute function public.update_updated_at_column();

-- 2. Term / installment layer (net-new vs MyJKKN admission) --------------------
create table if not exists public.tms_fee_structure_term (
  id                uuid primary key default gen_random_uuid(),
  fee_structure_id  uuid not null references public.tms_fee_structure(id) on delete cascade,
  term_no           int not null,
  term_label        text,
  amount            numeric(12,2) not null check (amount >= 0),
  due_date          date not null,
  created_at        timestamptz not null default now(),
  constraint tms_fee_structure_term_unique unique (fee_structure_id, term_no)
);
create index if not exists idx_tms_fee_structure_term_fs on public.tms_fee_structure_term (fee_structure_id);

-- 3. Generation run header (audit of each manual trigger) ----------------------
create table if not exists public.tms_fee_generation_run (
  id                    uuid primary key default gen_random_uuid(),
  fee_structure_id      uuid not null references public.tms_fee_structure(id) on delete cascade,
  transport_year_id     uuid not null references public.tms_transport_year(id),
  mode                  text not null default 'generate' check (mode in ('dry_run','generate')),
  status                text not null default 'completed' check (status in ('completed','partial','failed')),
  applicable_count      int not null default 0,
  learner_billed_count  int not null default 0,
  staff_deferred_count  int not null default 0,
  skipped_count         int not null default 0,
  notes                 text,
  triggered_by          uuid,
  triggered_at          timestamptz not null default now()
);
create index if not exists idx_tms_fee_generation_run_fs on public.tms_fee_generation_run (fee_structure_id);

-- 4. Per-person-per-term ledger (coverage source + idempotency + traceability) --
create table if not exists public.tms_fee_bill (
  id                       uuid primary key default gen_random_uuid(),
  generation_run_id        uuid references public.tms_fee_generation_run(id) on delete set null,
  fee_structure_id         uuid not null references public.tms_fee_structure(id) on delete cascade,
  transport_year_id        uuid not null references public.tms_transport_year(id),
  person_id                uuid not null,            -- learners_profiles.id (v1) / staff.id (phase 2)
  person_type              text not null check (person_type in ('learner','staff')),
  term_no                  int not null,
  amount                   numeric(12,2) not null,
  due_date                 date not null,
  billing_category_id      uuid,                     -- transport billing category used
  billing_student_bill_id  uuid,                     -- soft ref to billing_student_bills.id (NULL for staff/dry-run); no FK (cross-app)
  status                   text not null default 'generated' check (status in ('generated','staff_deferred','error')),
  created_at               timestamptz not null default now(),
  -- idempotency: one ledger row per (structure, person, term, year)
  constraint tms_fee_bill_idem_unique unique (fee_structure_id, person_id, term_no, transport_year_id)
);
create index if not exists idx_tms_fee_bill_year      on public.tms_fee_bill (transport_year_id);
create index if not exists idx_tms_fee_bill_structure on public.tms_fee_bill (fee_structure_id);
create index if not exists idx_tms_fee_bill_person    on public.tms_fee_bill (person_id);

-- RLS: enable, NO policies (deny-all for anon/authenticated; service-role bypasses)
alter table public.tms_fee_structure      enable row level security;
alter table public.tms_fee_structure_term enable row level security;
alter table public.tms_fee_generation_run enable row level security;
alter table public.tms_fee_bill           enable row level security;
