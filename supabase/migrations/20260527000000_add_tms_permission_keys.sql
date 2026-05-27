-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Permission Keys + transport_manager role
--
-- ⚠️  ARTIFACT ONLY — NOT YET APPLIED.
-- This migration is written against the SHARED MyJKKN Supabase project
-- (project ref: kvizhngldtiuufknvehv). Applying it grants TMS access to existing
-- roles across the live MyJKKN database. Review carefully, then apply via the
-- MyJKKN migration pipeline or `mcp__supabase__apply_migration`.
--
-- Until this is applied, only super_admins (is_super_admin = true) pass the TMS
-- permission gate in proxy.ts / the auth callback.
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Create the transport_manager role (full TMS access, institution-scoped).
INSERT INTO custom_roles (
  id, role_key, role_name, description,
  is_system_role, is_active, institution_scope, module_scopes, permissions,
  created_at, updated_at
)
SELECT
  gen_random_uuid(),
  'transport_manager',
  'Transport Manager',
  'Full access to the Transport Management System (TMS): routes, vehicles, drivers, schedules, enrollments, and reports.',
  true,   -- is_system_role
  true,   -- is_active
  'own',  -- institution_scope
  '{"tms": "own_institution"}'::jsonb,
  '{
    "tms.dashboard.view": true,
    "tms.routes.view": true,
    "tms.routes.create": true,
    "tms.routes.edit": true,
    "tms.routes.delete": true,
    "tms.vehicles.view": true,
    "tms.vehicles.create": true,
    "tms.vehicles.edit": true,
    "tms.vehicles.delete": true,
    "tms.drivers.view": true,
    "tms.drivers.assign": true,
    "tms.drivers.manage": true,
    "tms.schedules.view": true,
    "tms.schedules.create": true,
    "tms.schedules.edit": true,
    "tms.schedules.delete": true,
    "tms.bookings.view": true,
    "tms.bookings.view_all": true,
    "tms.bookings.create": true,
    "tms.bookings.manage": true,
    "tms.attendance.view": true,
    "tms.attendance.scan": true,
    "tms.attendance.manage": true,
    "tms.tracking.view": true,
    "tms.tracking.share": true,
    "tms.grievances.view": true,
    "tms.grievances.manage": true,
    "tms.reports.view": true,
    "tms.reports.export": true,
    "tms.settings.view": true,
    "tms.settings.manage": true,
    "tms.enrollment.view": true,
    "tms.enrollment.manage": true
  }'::jsonb,
  NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM custom_roles WHERE role_key = 'transport_manager'
);

-- Step 2: Grant student-facing TMS permissions to the existing student role.
UPDATE custom_roles
SET permissions = permissions || '{
  "tms.dashboard.view": true,
  "tms.routes.view": true,
  "tms.schedules.view": true,
  "tms.bookings.view": true,
  "tms.bookings.create": true,
  "tms.attendance.view": true,
  "tms.tracking.view": true,
  "tms.grievances.submit": true,
  "tms.grievances.view": true,
  "tms.enrollment.view": true
}'::jsonb,
    updated_at = NOW()
WHERE role_key = 'student'
  AND NOT (permissions ? 'tms.dashboard.view');

-- Step 3: Grant driver-facing TMS permissions to the existing driver role.
UPDATE custom_roles
SET permissions = permissions || '{
  "tms.dashboard.view": true,
  "tms.routes.view": true,
  "tms.schedules.view": true,
  "tms.attendance.view": true,
  "tms.attendance.scan": true,
  "tms.tracking.view": true,
  "tms.tracking.share": true
}'::jsonb,
    updated_at = NOW()
WHERE role_key = 'driver'
  AND NOT (permissions ? 'tms.dashboard.view');

-- Step 4: Grant faculty-facing TMS view permissions to the existing faculty role.
UPDATE custom_roles
SET permissions = permissions || '{
  "tms.dashboard.view": true,
  "tms.routes.view": true,
  "tms.schedules.view": true,
  "tms.bookings.view": true,
  "tms.attendance.view": true,
  "tms.tracking.view": true
}'::jsonb,
    updated_at = NOW()
WHERE role_key = 'faculty'
  AND NOT (permissions ? 'tms.dashboard.view');
