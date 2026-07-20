-- ─────────────────────────────────────────────────────────────────────────────
-- admin_settings: typed admin settings blobs, one row per setting_type.
-- Currently used with setting_type = 'scheduling' to hold the booking cutoff
-- hour + bookable horizon read/written by app/api/admin/settings/route.ts and
-- consumed by lib/settings/scheduling.ts (loadSchedulingConfig). Without this
-- table, saves 500 and reads silently fall back to hardcoded defaults forever.
--
-- Target: shared MyJKKN project (ref: kvizhngldtiuufknvehv). Additive. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.admin_settings (
  setting_type text primary key,
  settings_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.admin_settings is
  'Typed admin settings blobs keyed by setting_type (currently only ''scheduling''). '
  'settings_data holds the raw form-shaped JSON blob for that setting type.';

-- ── Row Level Security ───────────────────────────────────────────────────────
-- All access to this table is via app/api/admin/settings/route.ts, which uses
-- the service-role client — that bypasses RLS entirely. RLS is enabled here
-- with NO policies added on purpose: with RLS on and zero policies, every
-- anon/authenticated (non-service-role) request is denied by default. Do NOT
-- "fix" this by adding permissive policies — that would open direct
-- PostgREST access to admin settings for any authenticated client.
alter table public.admin_settings enable row level security;
