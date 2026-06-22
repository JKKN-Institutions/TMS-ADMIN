-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Activity Log — admin action audit trail
--
-- Records every admin mutation (create/update/delete/import/assign/scan…)
-- performed through TMS API routes. Written EXCLUSIVELY via the service-role
-- client from lib/activity/log.ts; the actor comes from app auth context
-- (withAuth) because service-role writes make auth.uid() unusable in triggers.
--
-- actor_id is a SOFT reference to profiles.id (no FK) so log rows survive
-- profile deletion. RLS is enabled with NO policies: anon/authenticated get
-- nothing, service-role bypasses — reads go through the permission-checked
-- /api/admin/activity-log route (tms.activity.view).
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tms_activity_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid,          -- profiles.id; null = system/unattributed
  actor_email  text,
  actor_role   text,
  module       text not null, -- 'drivers' | 'vehicles' | 'routes' | ...
  action       text not null, -- 'create' | 'update' | 'delete' | ...
  entity_type  text,          -- e.g. 'tms_vehicle'
  entity_id    text,          -- stringified PK of the affected row
  entity_label text,          -- human label, e.g. registration number
  description  text,
  changes      jsonb,         -- { before: {...}, after: {...} } when available
  metadata     jsonb,
  ip_address   text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

comment on table public.tms_activity_log is
  'TMS admin action audit trail. Service-role writes only (lib/activity/log.ts); read via /api/admin/activity-log gated on tms.activity.view.';

create index if not exists idx_tms_activity_log_created_at
  on public.tms_activity_log (created_at desc);
create index if not exists idx_tms_activity_log_module
  on public.tms_activity_log (module);
create index if not exists idx_tms_activity_log_actor
  on public.tms_activity_log (actor_id);
create index if not exists idx_tms_activity_log_entity
  on public.tms_activity_log (entity_type, entity_id);

alter table public.tms_activity_log enable row level security;
-- Intentionally NO policies: deny-all for anon/authenticated; service-role bypasses.

-- New permission key gating the Activity Log module; grant to transport_head
-- (same additive-merge contract as 20260612000000).
update public.custom_roles
set
  permissions = coalesce(permissions, '{}'::jsonb) || '{"tms.activity.view": true}'::jsonb,
  updated_at = now()
where role_key = 'transport_head';
