-- ─────────────────────────────────────────────────────────────────────────────
-- GPS tracking module schema: gps_devices, gps_location_history, gps_alerts,
-- gps_sync_logs  (+ live-tracking columns on tms_vehicle)
--
-- The GPS module (app/(admin)/gps-devices + app/api/admin/gps/*) was wired to
-- these tables, but they were never migrated — every GPS route 500s with
-- Postgres 42P01. The device-list page surfaces it as "Failed to fetch GPS
-- devices". This migration creates the module's tables.
--
-- Naming: the GPS module predates the tms_ convention and references the tables
-- unprefixed across 7 files; kept unprefixed to match the module's pattern.
-- GPS↔vehicle boundary is intentionally loose (cf. tms_vehicle.gps_device_id):
-- vehicle_id / route_id are loose uuid refs (no hard FK); gps_device_id is a
-- real intra-module FK so PostgREST embeds (gps_alerts → gps_devices) resolve.
--
-- Target: shared MyJKKN project (ref: kvizhngldtiuufknvehv). Additive only.
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tms_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ── gps_devices ──────────────────────────────────────────────────────────────
create table if not exists public.gps_devices (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  device_name text not null,
  device_model text,
  sim_number text,
  imei text,
  notes text,
  status text not null default 'inactive'
    check (status in ('active','inactive','offline','maintenance','error')),
  battery_level integer check (battery_level between 0 and 100),
  signal_strength integer check (signal_strength between 0 and 100),
  last_heartbeat timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gps_devices_status on public.gps_devices(status);
drop trigger if exists trg_gps_devices_updated_at on public.gps_devices;
create trigger trg_gps_devices_updated_at before update on public.gps_devices
  for each row execute function public.tms_set_updated_at();

-- ── gps_location_history ─────────────────────────────────────────────────────
create table if not exists public.gps_location_history (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid,                       -- loose ref to tms_vehicle (no hard FK)
  gps_device_id uuid references public.gps_devices(id) on delete set null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  speed numeric(6,2), heading numeric(6,2),
  accuracy numeric(8,2), altitude numeric(8,2),
  timestamp timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_gps_loc_hist_device   on public.gps_location_history(gps_device_id);
create index if not exists idx_gps_loc_hist_vehicle  on public.gps_location_history(vehicle_id);
create index if not exists idx_gps_loc_hist_ts       on public.gps_location_history(timestamp desc);

-- ── gps_alerts ───────────────────────────────────────────────────────────────
create table if not exists public.gps_alerts (
  id uuid primary key default gen_random_uuid(),
  route_id uuid,                         -- loose ref (no routes table yet)
  gps_device_id uuid references public.gps_devices(id) on delete set null,
  alert_type text not null,
  severity text not null default 'medium'
    check (severity in ('low','medium','high','critical')),
  title text not null,
  description text,
  alert_data jsonb,
  acknowledged boolean not null default false,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gps_alerts_device   on public.gps_alerts(gps_device_id);
create index if not exists idx_gps_alerts_resolved on public.gps_alerts(resolved);
create index if not exists idx_gps_alerts_created  on public.gps_alerts(created_at desc);
drop trigger if exists trg_gps_alerts_updated_at on public.gps_alerts;
create trigger trg_gps_alerts_updated_at before update on public.gps_alerts
  for each row execute function public.tms_set_updated_at();

-- ── gps_sync_logs ────────────────────────────────────────────────────────────
create table if not exists public.gps_sync_logs (
  id uuid primary key default gen_random_uuid(),
  service text not null default 'mercyda',
  status text not null check (status in ('success','error')),
  devices_updated integer not null default 0,
  error_count integer not null default 0,
  errors jsonb,
  sync_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_gps_sync_logs_ts on public.gps_sync_logs(sync_time desc);

-- ── tms_vehicle: live-tracking columns (additive, nullable) ──────────────────
alter table public.tms_vehicle add column if not exists current_latitude  numeric(10,7);
alter table public.tms_vehicle add column if not exists current_longitude numeric(10,7);
alter table public.tms_vehicle add column if not exists gps_speed         numeric(6,2);
alter table public.tms_vehicle add column if not exists gps_heading       numeric(6,2);
alter table public.tms_vehicle add column if not exists gps_accuracy      numeric(8,2);
alter table public.tms_vehicle add column if not exists last_gps_update   timestamptz;

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Admin GPS routes use the service-role key (bypasses RLS). These policies only
-- gate direct anon/authenticated PostgREST access, reusing existing tms.tracking
-- keys (view = tms.tracking.view, write = tms.settings.manage). No new keys.
do $$
declare t text;
begin
  foreach t in array array['gps_devices','gps_location_history','gps_alerts','gps_sync_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format($p$create policy %I_select on public.%I for select using (
      public.is_super_admin() or public.user_has_permission('tms.tracking.view'))$p$, t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format($p$create policy %I_write on public.%I for all using (
      public.is_super_admin() or public.user_has_permission('tms.settings.manage'))
      with check (
      public.is_super_admin() or public.user_has_permission('tms.settings.manage'))$p$, t, t);
  end loop;
end $$;
