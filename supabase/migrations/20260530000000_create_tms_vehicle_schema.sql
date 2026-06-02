-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Vehicle schema: tms_vehicle
--
-- TMS owns the transport vehicle fleet. This table backs app/(admin)/vehicles
-- and the app/api/admin/vehicles endpoints. Until now the code referenced an
-- unprefixed `vehicles` table that never existed in the database (the vehicles
-- API silently swallowed Postgres 42P01 and returned an empty list); this
-- migration creates it under the tms_ convention (same as tms_driver / tms_route)
-- and the app code is refactored to query `tms_vehicle`.
--
-- Target: shared MyJKKN Supabase project (project ref: kvizhngldtiuufknvehv).
-- Additive only — does not touch existing MyJKKN tables.
-- Apply via the Supabase MCP / dashboard (DDL).
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Shared updated_at trigger fn (also created by the tms_route migration; re-create is safe).
create or replace function public.tms_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── tms_vehicle ──────────────────────────────────────────────────────────────
create table if not exists public.tms_vehicle (
  id uuid primary key default gen_random_uuid(),
  registration_number text not null unique,
  model text not null,
  capacity integer not null default 0 check (capacity >= 0),
  fuel_type text not null default 'diesel' check (fuel_type in ('diesel','petrol','electric','cng')),
  status text not null default 'active' check (status in ('active','maintenance','retired')),
  insurance_expiry date,
  fitness_expiry date,
  last_maintenance date,
  next_maintenance date,
  mileage numeric(8,2) not null default 0,
  purchase_date date,
  chassis_number text,
  engine_number text,
  gps_device_id uuid,            -- loose ref to a GPS device (separate module; no hard FK)
  live_tracking_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create index if not exists idx_tms_vehicle_status on public.tms_vehicle(status);
create index if not exists idx_tms_vehicle_gps_device_id on public.tms_vehicle(gps_device_id);

drop trigger if exists trg_tms_vehicle_updated_at on public.tms_vehicle;
create trigger trg_tms_vehicle_updated_at
  before update on public.tms_vehicle
  for each row execute function public.tms_set_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────
-- The admin server uses the service-role key (bypasses RLS) and enforces the
-- tms.vehicles.* permission checks in the API handlers. These policies protect
-- direct anon/authenticated access, gated by the existing tms.vehicles.* keys
-- from 20260527000000_add_tms_permission_keys.sql.
alter table public.tms_vehicle enable row level security;

drop policy if exists tms_vehicle_select on public.tms_vehicle;
create policy tms_vehicle_select on public.tms_vehicle
  for select using (
    public.is_super_admin() or public.user_has_permission('tms.vehicles.view')
  );

drop policy if exists tms_vehicle_insert on public.tms_vehicle;
create policy tms_vehicle_insert on public.tms_vehicle
  for insert with check (
    public.is_super_admin() or public.user_has_permission('tms.vehicles.create')
  );

drop policy if exists tms_vehicle_update on public.tms_vehicle;
create policy tms_vehicle_update on public.tms_vehicle
  for update using (
    public.is_super_admin() or public.user_has_permission('tms.vehicles.edit')
  ) with check (
    public.is_super_admin() or public.user_has_permission('tms.vehicles.edit')
  );

drop policy if exists tms_vehicle_delete on public.tms_vehicle;
create policy tms_vehicle_delete on public.tms_vehicle
  for delete using (
    public.is_super_admin() or public.user_has_permission('tms.vehicles.delete')
  );
