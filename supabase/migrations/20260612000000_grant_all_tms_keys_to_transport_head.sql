-- ─────────────────────────────────────────────────────────────────────────────
-- Transport Head = full TMS access across ALL areas (parity with super admin)
--
-- 20260602000000 granted transport_head the 33 admin-area tms.* keys. Since
-- then the passenger integration (20260609091000) introduced 5 more keys that
-- gate the non-admin areas and self-service features:
--
--   tms.passenger.self.view          ← AREA GATE for /student/* (lib/auth/areas.ts)
--   tms.driver.self.view             ← AREA GATE for /driver/*
--   tms.passenger.payment.view
--   tms.passenger.enrollment.request
--   tms.grievances.submit
--
-- Without these, proxy.ts redirects a transport_head user out of the student /
-- driver portals (only super admins bypass area gates). This migration merges
-- the COMPLETE 38-key catalog (lib/constants/tms-permissions.ts) into the role
-- so Transport Head can enter every area and module, same as a super admin.
--
-- Same contract as 20260602000000:
--   • Target: shared MyJKKN Supabase project (kvizhngldtiuufknvehv).
--   • Additive & non-destructive: jsonb `||` merge; non-TMS keys and
--     institution_scope untouched. Role assignment stays a MyJKKN concern.
--   • Idempotent & self-healing: re-running re-asserts the full key set.
-- ─────────────────────────────────────────────────────────────────────────────

update public.custom_roles
set
  permissions = coalesce(permissions, '{}'::jsonb) || '{
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
    "tms.grievances.submit": true,
    "tms.grievances.view": true,
    "tms.grievances.manage": true,
    "tms.reports.view": true,
    "tms.reports.export": true,
    "tms.settings.view": true,
    "tms.settings.manage": true,
    "tms.enrollment.view": true,
    "tms.enrollment.manage": true,
    "tms.passenger.self.view": true,
    "tms.passenger.payment.view": true,
    "tms.passenger.enrollment.request": true,
    "tms.driver.self.view": true
  }'::jsonb,
  updated_at = now()
where role_key = 'transport_head';

-- ── Verification (run separately after applying) ─────────────────────────────
--   select role_key,
--          (select count(*) from jsonb_object_keys(permissions) k where k like 'tms.%') as tms_key_count,
--          permissions ? 'tms.passenger.self.view' as can_enter_student_area,
--          permissions ? 'tms.driver.self.view'    as can_enter_driver_area
--   from public.custom_roles
--   where role_key = 'transport_head';
--
-- Expect: tms_key_count = 38, both area flags = true.
