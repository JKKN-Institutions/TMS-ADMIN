-- ─────────────────────────────────────────────────────────────────────────────
-- Seed the two TMS vacate permission keys into the custom_roles catalog.
--
--   tms.vacate.view    — see the admin vacate-requests queue
--   tms.vacate.manage  — approve / reject a vacate (cancels the bill)
--
-- Data-driven (no hardcoded role_keys), matching the notification/driver-mobile
-- seed migrations:
--   • VIEW   → every role that can enter the admin dashboard (tms.dashboard.view).
--   • MANAGE → every role that can manage transport settings (tms.settings.manage).
-- transport_head holds BOTH parents (see 20260602000000), so it is the intended
-- approver and gains both keys. Super admins bypass permission checks entirely.
--
-- Learners need NO permission to submit — the student route is self-scoped.
-- Additive jsonb `||` merge; idempotent. Target: kvizhngldtiuufknvehv.
-- ─────────────────────────────────────────────────────────────────────────────

-- VIEW → admin-dashboard roles
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb) || '{"tms.vacate.view": true}'::jsonb,
    updated_at = now()
where coalesce((permissions ->> 'tms.dashboard.view')::boolean, false) = true;

-- MANAGE → transport-settings-managing roles (incl. transport_head)
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb) || '{"tms.vacate.manage": true}'::jsonb,
    updated_at = now()
where coalesce((permissions ->> 'tms.settings.manage')::boolean, false) = true;
