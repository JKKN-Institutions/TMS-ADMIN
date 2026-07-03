-- ─────────────────────────────────────────────────────────────────────────────
-- Seed the three TMS notification permission keys into the custom_roles catalog.
--
--   tms.notifications.view    — see the admin notifications list/detail
--   tms.notifications.send    — compose & broadcast a notification
--   tms.notifications.manage  — delete / expire a notification
--
-- Data-driven & self-targeting (no hardcoded role_keys):
--   • VIEW is granted to every role that can already enter the admin dashboard
--     (holds tms.dashboard.view) — the admin operators who should see the module.
--   • SEND + MANAGE are granted to every role that can manage transport settings
--     (holds tms.settings.manage) — the operators trusted to broadcast.
-- transport_head / super-admin-equivalent roles hold both, so they get all three.
-- Super admins bypass permission checks entirely (auth.isSuperAdmin) regardless.
--
-- Consumers (learner/driver/boarding) need NO permission to read their own inbox —
-- that path is guarded by own-row RLS on tms_notification_recipient.
--
-- Same contract as the other tms permission migrations: target shared MyJKKN
-- project (kvizhngldtiuufknvehv); additive jsonb `||` merge; idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- VIEW → admin-dashboard roles
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb) || '{"tms.notifications.view": true}'::jsonb,
    updated_at = now()
where coalesce((permissions ->> 'tms.dashboard.view')::boolean, false) = true;

-- SEND + MANAGE → transport-settings-managing roles
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb)
                  || '{"tms.notifications.send": true, "tms.notifications.manage": true}'::jsonb,
    updated_at = now()
where coalesce((permissions ->> 'tms.settings.manage')::boolean, false) = true;

-- ── Verification (run separately after applying) ─────────────────────────────
--   select role_key,
--          permissions ? 'tms.notifications.view'   as can_view,
--          permissions ? 'tms.notifications.send'   as can_send,
--          permissions ? 'tms.notifications.manage' as can_manage
--   from public.custom_roles
--   where permissions ? 'tms.notifications.view'
--   order by role_key;
