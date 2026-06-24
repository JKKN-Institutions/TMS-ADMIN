-- Driver-phone live tracking: duty-session state on tms_driver, a source marker on the
-- ping log, and the share permission for the driver role.
-- Spec: docs/superpowers/specs/2026-06-24-driver-phone-live-tracking-design.md

-- 1. Duty-session state. active_route_id follows the loose-ref convention used by
--    tms_route.driver_id / tms_driver.assigned_route_id (plain uuid, no FK).
alter table public.tms_driver
  add column if not exists active_route_id uuid,
  add column if not exists location_sharing_started_at timestamptz;

-- 2. Distinguish a phone fix from a hardware/Mercyda device fix on the ping log.
alter table public.gps_location_history
  add column if not exists source text;

-- 3. Grant the (already-defined-but-unapplied) share permission to the driver role.
--    Permissions live in custom_roles.permissions JSONB keyed by role_key; merging the
--    single 'driver' row grants every profiles.role='driver' user (user_has_permission
--    falls back to profiles.role = role_key). Additive + idempotent.
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(
      'tms.tracking.share', true
    ),
    updated_at = now()
where role_key = 'driver';
