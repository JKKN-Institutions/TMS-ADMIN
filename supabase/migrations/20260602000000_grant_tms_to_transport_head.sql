-- ─────────────────────────────────────────────────────────────────────────────
-- Grant FULL TMS access to the existing `transport_head` role
--
-- Adds the complete set of tms.* permission keys to public.custom_roles for
-- role_key = 'transport_head', turning it into a full Transport Management System
-- administrator: routes, vehicles, drivers, schedules, bookings, attendance,
-- tracking, grievances, reports, settings and enrollment — view/create/edit/delete.
-- (This is the same permission set the transport_manager role was designed to
-- carry in 20260527000000_add_tms_permission_keys.sql, applied to transport_head
-- instead because that role already exists and is used in MyJKKN.)
--
-- WHY: as of 2026-06-02 NO custom role holds any tms.* key, so ONLY super_admins
-- can enter TMS — the gate in proxy.ts / app/auth/callback requires either
-- is_super_admin OR tms.dashboard.view. This grant lets anyone assigned the
-- transport_head role pass that gate and use TMS.
--
-- ⚠️ ROLE ASSIGNMENT IS A MyJKKN CONCERN. This migration only PERMISSIONS the
-- role; it does not assign it to anyone. A user gains access only when they HOLD
-- transport_head in MyJKKN (permissions are resolved as the UNION of a user's
-- roles via get_user_merged_permissions()).
--
-- Target: shared MyJKKN Supabase project (project ref: kvizhngldtiuufknvehv).
-- Additive & non-destructive: MERGES keys into the existing permissions JSONB
-- (jsonb `||`), so other modules' keys (transport_head already has 3
-- service_requests.* keys) and the role's institution_scope are left untouched.
-- Apply via the MyJKKN migration pipeline / Supabase dashboard / MCP.
--
-- NOTE on module_scopes: intentionally NOT modified. Live data shows MyJKKN uses
-- scope values like "all_institutions" / "own_records"; the value "own_institution"
-- from the original seed draft is non-standard. TMS gates purely on the permission
-- keys below (and uses the service-role client for data, bypassing RLS), so no
-- module_scopes entry is required for TMS to work.
--
-- Idempotent: re-running simply re-asserts the same keys (self-healing — it will
-- also fill in any single key that is later found missing).
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
    "tms.grievances.view": true,
    "tms.grievances.manage": true,
    "tms.reports.view": true,
    "tms.reports.export": true,
    "tms.settings.view": true,
    "tms.settings.manage": true,
    "tms.enrollment.view": true,
    "tms.enrollment.manage": true
  }'::jsonb,
  updated_at = now()
where role_key = 'transport_head';

-- ── Verification (run separately after applying) ─────────────────────────────
-- Confirms the 33 tms.* keys are present on the role:
--
--   select role_key,
--          (select count(*) from jsonb_object_keys(permissions) k where k like 'tms.%') as tms_key_count,
--          (select count(*) from jsonb_object_keys(permissions))                        as total_keys,
--          permissions ? 'tms.dashboard.view'  as can_enter_tms
--   from public.custom_roles
--   where role_key = 'transport_head';
--
-- Expect: tms_key_count = 33, total_keys = 36 (33 tms + 3 existing service_requests),
--         can_enter_tms = true.
