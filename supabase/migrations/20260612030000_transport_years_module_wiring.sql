-- ─────────────────────────────────────────────────────────────────────────────
-- Transport Years module wiring
--
-- 1. Audit columns on tms_transport_year (created_by/updated_by, soft refs to
--    profiles.id — no FK so rows survive profile deletion), required by the
--    modern admin API pattern (withAuth handlers stamp them).
-- 2. Permission keys tms.transport_years.* seeded into transport_head (same
--    additive-merge contract as 20260612000000; super admins bypass anyway).
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tms_transport_year
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

update public.custom_roles
set
  permissions = coalesce(permissions, '{}'::jsonb) || '{
    "tms.transport_years.view": true,
    "tms.transport_years.create": true,
    "tms.transport_years.edit": true,
    "tms.transport_years.delete": true
  }'::jsonb,
  updated_at = now()
where role_key = 'transport_head';
