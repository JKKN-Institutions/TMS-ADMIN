-- ─────────────────────────────────────────────────────────────────────────────
-- Pin the attendance-override power to EXACTLY two identities:
--   • super_admin    — bypasses permission checks in code (requirePerm's
--                      `if (auth.isSuperAdmin) return true`). Super admins hold
--                      NO custom_role, so they need — and must not be given — a
--                      grant here.
--   • transport_head — the designated corrector, granted below.
-- Nobody else may change another staff member's attendance mark.
--
-- WHY A NEW KEY: tms.attendance.manage cannot express this. Measured 2026-07-29,
-- BOTH roles hold it —
--     transport_boarding : scan ✓  manage ✓   (the 98 boarding staff)
--     transport_head     : view ✓  scan ✓  manage ✓
-- and transport_boarding is exactly the population the lock exists to constrain.
-- Gating the override on .manage would hand it straight back to all 98.
--
-- Target: shared MyJKKN project (ref: kvizhngldtiuufknvehv). Idempotent and
-- self-healing: re-running re-asserts transport_head's key and strips any drift.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. transport_head holds the override key.
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb)
                  || '{"tms.attendance.override": true}'::jsonb,
    updated_at = now()
where role_key = 'transport_head';

-- 2. Strip it from every OTHER role, so the two-identity rule is ENFORCED rather
--    than incidental. A no-op on 2026-07-29 (the key is brand new), but it makes
--    a future accidental grant self-heal on the next migration run.
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb) - 'tms.attendance.override',
    updated_at = now()
where role_key <> 'transport_head'
  and permissions ? 'tms.attendance.override';

-- ── Verification (run separately after applying) ─────────────────────────────
--   -- Expect EXACTLY one row: transport_head / true
--   select role_key, permissions ? 'tms.attendance.override' as can_override
--   from public.custom_roles
--   where permissions ? 'tms.attendance.override'
--   order by role_key;
