-- ─────────────────────────────────────────────────────────────────────────────
-- Pin the vacate approval/cancel action to EXACTLY two identities:
--   • super_admin    — bypasses permission checks in code (proxy.ts:167,
--                      requirePerm's `if (auth.isSuperAdmin) return true`, and
--                      usePermissions' `can()`). Super admins hold NO custom_role,
--                      so they need — and must not be given — a grant here.
--   • transport_head — the designated approver, granted below.
-- Nobody else may approve a vacate (i.e. cancel a learner's transport bills).
--
-- WHY THIS EXISTS: the original seed (20260717120100) was data-driven —
--   view   → every role holding tms.dashboard.view
--   manage → every role holding tms.settings.manage
-- Those were a PROXY for the intent, not the intent. They resolve to exactly
-- transport_head today, so the outcome was correct — but by coincidence. The day
-- any other role is granted tms.settings.manage, that rule would hand it the power
-- to CANCEL LEARNERS' BILLS, silently. This migration encodes the real requirement.
--
-- Target: shared MyJKKN project (ref: kvizhngldtiuufknvehv). Idempotent + self-healing:
-- re-running re-asserts transport_head's keys and strips them from anyone else.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. transport_head holds both vacate keys (explicit, not inferred from a parent key).
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb)
                  || '{"tms.vacate.view": true, "tms.vacate.manage": true}'::jsonb,
    updated_at = now()
where role_key = 'transport_head';

-- 2. Strip the vacate keys from every OTHER role. A no-op on 2026-07-17 (only
--    transport_head holds them), but it makes the two-role rule enforceable rather
--    than incidental, and self-heals any future drift from the old parent-key rule.
update public.custom_roles
set permissions = (coalesce(permissions, '{}'::jsonb) - 'tms.vacate.view') - 'tms.vacate.manage',
    updated_at = now()
where role_key <> 'transport_head'
  and (permissions ? 'tms.vacate.view' or permissions ? 'tms.vacate.manage');

-- ── Verification (run separately after applying) ─────────────────────────────
--   -- Expect EXACTLY one row: transport_head / true / true
--   select role_key,
--          permissions ? 'tms.vacate.view'   as vacate_view,
--          permissions ? 'tms.vacate.manage' as vacate_manage
--   from public.custom_roles
--   where permissions ? 'tms.vacate.view' or permissions ? 'tms.vacate.manage'
--   order by role_key;
--
--   -- Approvers = the 12 super admins + transport_head holders, and nobody else:
--   select p.email, p.is_super_admin, p.role
--   from public.tms_users_with_permission('tms.vacate.manage') as u(id)
--   join public.profiles p on p.id = u.id
--   order by p.is_super_admin desc, p.email;
