-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Fees: institution-only conditions + multi-institution targeting
--
-- The fee structure's only academic condition is now INSTITUTION, and it is
-- multi-valued (institution_ids uuid[]). The previous single institution_id is
-- folded into the array; the unused academic dimensions (degree / department /
-- programme / semester / quota) are removed entirely. Audience (student|staff)
-- and staff_role_keys are unchanged.
--
-- A NULL / empty institution_ids means "any institution" — same "NULL = any"
-- semantics the single column had.
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. New multi-institution column ---------------------------------------------
alter table public.tms_fee_structure
  add column if not exists institution_ids uuid[];

-- 2. Backfill from the single column (preserve existing targeting) -------------
update public.tms_fee_structure
   set institution_ids = array[institution_id]
 where institution_id is not null
   and (institution_ids is null or cardinality(institution_ids) = 0);

-- 3. Drop the removed condition columns ----------------------------------------
alter table public.tms_fee_structure
  drop column if exists institution_id,
  drop column if exists degree_id,
  drop column if exists department_id,
  drop column if exists programme_id,
  drop column if exists semester_id,
  drop column if exists quota_id;
