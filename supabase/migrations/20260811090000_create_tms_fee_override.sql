-- Per-person exceptions to a transport fee structure's amounts.
--
-- WHY: a fee structure prices a COHORT. Individuals sometimes owe something else --
-- a scholarship, a negotiated concession. Until now TMS had no way to express that:
-- lib/fees/resolve-terms.ts derives every amount from structure config alone, and
-- learners_profiles.scholarship_type is referenced by ZERO lines of application code.
--
-- Scoped to (person, transport year, term) and deliberately NOT to fee_structure_id.
-- A person is billed by exactly one structure per transport year -- the generator
-- already treats a second one as a conflict -- so adding the structure would be
-- redundant, and would let an override silently miss if the person moved structures.

create table if not exists public.tms_fee_override (
  id                uuid primary key default gen_random_uuid(),

  -- No FK: person_id points at learners_profiles OR staff depending on
  -- person_type, exactly as tms_fee_bill.person_id does.
  person_id         uuid not null,
  person_type       text not null default 'learner'
                    check (person_type in ('learner', 'staff')),

  transport_year_id uuid not null
                    references public.tms_transport_year(id) on delete cascade,
  term_no           integer not null check (term_no > 0),

  -- false = this term is not charged at all; the generator drops it entirely.
  billable          boolean not null default true,
  -- Rupees for this ONE term. NULL exactly when billable is false.
  amount            numeric(12,2),

  -- NOT NULL on purpose: this table quietly reduces what someone owes, so every
  -- row must record why. An unexplained override is an unauditable discount.
  reason            text not null,

  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz,
  updated_by        uuid,

  constraint tms_fee_override_amount_ck check (
    (billable and amount is not null and amount >= 0)
    or (not billable and amount is null)
  ),
  constraint tms_fee_override_unique
    unique (person_id, transport_year_id, term_no)
);

-- Service-role only, matching every other tms_ table: RLS on, no policies.
alter table public.tms_fee_override enable row level security;

-- The generator loads overrides by year alone (never by a large person-id list,
-- which overflows the Supabase gateway), so this is the query it runs.
create index if not exists tms_fee_override_year_idx
  on public.tms_fee_override (transport_year_id, person_type);

comment on table public.tms_fee_override is
  'Per-person exceptions to a fee structure amount, applied by lib/fees/overrides.ts at generation time.';
