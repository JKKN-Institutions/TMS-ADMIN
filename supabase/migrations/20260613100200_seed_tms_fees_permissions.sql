-- ─────────────────────────────────────────────────────────────────────────────
-- Fees module permission keys.
--
-- Seeds tms.fees.* into the transport_head custom role via additive jsonb merge
-- (same contract as the transport-years wiring migration; super admins bypass
-- permission checks anyway). Checked at runtime via the user_has_permission RPC.
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

update public.custom_roles
set
  permissions = coalesce(permissions, '{}'::jsonb) || '{
    "tms.fees.view": true,
    "tms.fees.create": true,
    "tms.fees.edit": true,
    "tms.fees.delete": true,
    "tms.fees.generate": true
  }'::jsonb,
  updated_at = now()
where role_key = 'transport_head';
