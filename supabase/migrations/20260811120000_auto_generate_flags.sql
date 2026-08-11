-- Automatic bill generation: per-structure opt-in flags.
--
-- The auto_generate column already exists on the live database (migration
-- 20260724000000, applied from an abandoned branch). This migration only sets
-- the flags, and records the intent in version control so that "Testing and
-- Staff must never auto-bill" is an asserted fact rather than a convention.
--
-- The flag is the ONLY exclusion mechanism — there is deliberately no hardcoded
-- structure-id or name blocklist in the sweep (lib/fees/auto-generate.ts), because
-- ids change when a structure is recreated and names change when they are edited,
-- so a hardcoded guard would rot silently and give false confidence.
--
-- This migration is INERT on its own: the sweep is additionally gated by the
-- global `autoGenerateBills` setting, which is absent from admin_settings and so
-- parses to false. Nothing bills automatically until that switch is turned on.
--
-- Idempotent: re-running changes nothing.

-- Arts Aided (stop_wise, ~12 learners) joins the two structures already flagged.
update tms_fee_structure
   set auto_generate = true
 where name = 'Transport Fees 2026-2027 (Arts Aided)'
   and status = 'active';

-- Testing is an experiment sandbox; it must never bill anyone automatically.
update tms_fee_structure
   set auto_generate = false
 where name = 'Testing';

-- Staff has NEVER been generated (0 ledger rows). Enabling it would create ~26
-- bills and fire ~26 notifications in one unattended run. It must be generated
-- by hand once, deliberately, before automation is even considered.
update tms_fee_structure
   set auto_generate = false
 where audience = 'staff';
