-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Fees: per-year-of-study amount tiers (year bands) + per-structure lifecycle
--
-- Adds an OPTIONAL tiered mode to a fee structure. A FLAT structure (every
-- existing one) is unchanged: fee_mode defaults 'flat', it has no bands, and its
-- terms hang off the structure exactly as before. A TIERED structure carries N
-- year-bands; each band = a set of study-years + its own total + term split, and
-- its terms hang off the band (tms_fee_structure_term.year_band_id).
--
-- Also adds a per-structure lifecycle_statuses filter. NULL/empty => ['active'],
-- so every existing structure keeps billing only 'active' learners. This lets ONE
-- structure (e.g. Arts Self) additionally bill pre-enrollment 'reserved' learners
-- WITHOUT changing the rule for any other college.
--
-- TMS conventions: tms_ prefix, RLS enabled with NO policies (service-role only).
-- The band table has no updated_at (insert/replace only), so no touch trigger.
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Structure: tiered-mode flag + per-structure lifecycle target --------------
alter table public.tms_fee_structure
  add column if not exists fee_mode text not null default 'flat'
    check (fee_mode in ('flat','tiered')),
  add column if not exists lifecycle_statuses text[];   -- NULL/empty => ['active']

-- 2. Year-band tier table ------------------------------------------------------
create table if not exists public.tms_fee_structure_year_band (
  id               uuid primary key default gen_random_uuid(),
  fee_structure_id uuid not null references public.tms_fee_structure(id) on delete cascade,
  band_order       int  not null default 1,
  label            text,                                 -- e.g. "First year", "Years 2-3"
  study_years      int[] not null,                       -- {1} or {2,3}; non-empty
  total_amount     numeric(12,2) not null check (total_amount >= 0),
  split_count      int not null default 1 check (split_count >= 1),
  created_at       timestamptz not null default now(),
  constraint tms_fee_year_band_years_nonempty check (cardinality(study_years) >= 1)
);
create index if not exists idx_tms_fee_year_band_fs
  on public.tms_fee_structure_year_band (fee_structure_id);

comment on table public.tms_fee_structure_year_band is
  'Per-year-of-study amount tiers for a tiered tms_fee_structure. Service-role only; no RLS policies by design.';

-- 3. Terms can belong to a band (tiered) OR the structure (flat) ---------------
alter table public.tms_fee_structure_term
  add column if not exists year_band_id uuid
    references public.tms_fee_structure_year_band(id) on delete cascade;

-- The old unique(fee_structure_id, term_no) blocks bands reusing term_no 1,2,….
-- Replace it with two PARTIAL unique indexes: flat terms unique per structure,
-- band terms unique per band.
alter table public.tms_fee_structure_term
  drop constraint if exists tms_fee_structure_term_unique;
create unique index if not exists tms_fee_term_flat_unique
  on public.tms_fee_structure_term (fee_structure_id, term_no)
  where year_band_id is null;
create unique index if not exists tms_fee_term_band_unique
  on public.tms_fee_structure_term (year_band_id, term_no)
  where year_band_id is not null;

-- 4. RLS: enable, no policies (service-role only), matching the module ----------
alter table public.tms_fee_structure_year_band enable row level security;
