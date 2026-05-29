-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Route schema: tms_route + tms_route_stop + tms_route_possible_stop
--
-- TMS owns transport routes. These tables back app/(admin)/routes and the
-- app/api/admin/routes/** endpoints. Until now they were referenced in code as
-- unprefixed `routes`/`route_stops`/`route_possible_stops` but never existed in
-- the database; this migration creates them under the tms_ convention (same as
-- public.tms_driver) and the app code is refactored to match these names.
--
-- Target: shared MyJKKN Supabase project (project ref: kvizhngldtiuufknvehv).
-- Additive only — does not touch existing MyJKKN tables.
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Shared updated_at trigger for TMS route tables.
create or replace function public.tms_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── tms_route ────────────────────────────────────────────────────────────────
create table if not exists public.tms_route (
  id uuid primary key default gen_random_uuid(),
  route_number text not null unique,
  route_name text not null,
  route_code text,   -- optional/legacy code, read by search-stops; nullable
  start_location text not null,
  end_location text not null,
  start_latitude numeric(10,6) check (start_latitude is null or (start_latitude between -90 and 90)),
  start_longitude numeric(10,6) check (start_longitude is null or (start_longitude between -180 and 180)),
  end_latitude numeric(10,6) check (end_latitude is null or (end_latitude between -90 and 90)),
  end_longitude numeric(10,6) check (end_longitude is null or (end_longitude between -180 and 180)),
  departure_time time not null,
  arrival_time time not null,
  distance numeric(10,2) not null,
  duration text not null,
  total_capacity integer not null default 0,
  current_passengers integer not null default 0,
  fare numeric(10,2) not null default 0,
  status text not null default 'active' check (status in ('active','inactive','maintenance')),
  driver_id uuid,   -- loose ref to a driver (no hard FK, matching tms_driver.assigned_route_id)
  vehicle_id uuid,  -- loose ref to a vehicle
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

-- route_code column may be missing if an older version of this table was created.
alter table public.tms_route add column if not exists route_code text;

create index if not exists idx_tms_route_status on public.tms_route(status);
create index if not exists idx_tms_route_driver_id on public.tms_route(driver_id);
create index if not exists idx_tms_route_vehicle_id on public.tms_route(vehicle_id);

drop trigger if exists trg_tms_route_updated_at on public.tms_route;
create trigger trg_tms_route_updated_at
  before update on public.tms_route
  for each row execute function public.tms_set_updated_at();

-- ── tms_route_stop ───────────────────────────────────────────────────────────
create table if not exists public.tms_route_stop (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.tms_route(id) on delete cascade,
  stop_name text not null,
  stop_time time not null,
  sequence_order integer not null,
  latitude numeric(10,6) check (latitude is null or (latitude between -90 and 90)),
  longitude numeric(10,6) check (longitude is null or (longitude between -180 and 180)),
  is_major_stop boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- NOTE: sequence_order is intentionally NOT uniquely constrained per route.
-- The stops API reorders by issuing per-row `update sequence_order = sequence_order + 1`
-- in ascending order across separate auto-commit statements; a unique constraint
-- would throw mid-reorder. Application logic owns ordering; this is a plain index.
create index if not exists idx_tms_route_stop_route_id on public.tms_route_stop(route_id);
create index if not exists idx_tms_route_stop_sequence on public.tms_route_stop(route_id, sequence_order);

drop trigger if exists trg_tms_route_stop_updated_at on public.tms_route_stop;
create trigger trg_tms_route_stop_updated_at
  before update on public.tms_route_stop
  for each row execute function public.tms_set_updated_at();

-- ── tms_route_possible_stop ──────────────────────────────────────────────────
-- "Borrowed" stops: stops from another route (source_route_id) offered as
-- possible pickup/drop points on this route. Backs app/api/admin/routes/[routeId]/possible-stops.
create table if not exists public.tms_route_possible_stop (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.tms_route(id) on delete cascade,
  source_route_id uuid not null references public.tms_route(id) on delete cascade,
  stop_name text not null,
  stop_time time not null,
  sequence_order integer not null,
  latitude numeric(10,6) check (latitude is null or (latitude between -90 and 90)),
  longitude numeric(10,6) check (longitude is null or (longitude between -180 and 180)),
  is_major_stop boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Matches the duplicate-detection + 23505 handling in the possible-stops API.
  unique (route_id, stop_name, source_route_id)
);

create index if not exists idx_tms_route_possible_stop_route_id on public.tms_route_possible_stop(route_id);
create index if not exists idx_tms_route_possible_stop_source on public.tms_route_possible_stop(source_route_id);

drop trigger if exists trg_tms_route_possible_stop_updated_at on public.tms_route_possible_stop;
create trigger trg_tms_route_possible_stop_updated_at
  before update on public.tms_route_possible_stop
  for each row execute function public.tms_set_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────
-- The admin server uses the service-role key (bypasses RLS). These policies
-- protect direct anon/authenticated API access, gated by the existing TMS
-- permission keys (tms.routes.view/create/edit/delete) from
-- 20260527000000_add_tms_permission_keys.sql.

alter table public.tms_route enable row level security;

drop policy if exists tms_route_select on public.tms_route;
create policy tms_route_select on public.tms_route
  for select using (
    public.is_super_admin() or public.user_has_permission('tms.routes.view')
  );

drop policy if exists tms_route_insert on public.tms_route;
create policy tms_route_insert on public.tms_route
  for insert with check (
    public.is_super_admin() or public.user_has_permission('tms.routes.create')
  );

drop policy if exists tms_route_update on public.tms_route;
create policy tms_route_update on public.tms_route
  for update using (
    public.is_super_admin() or public.user_has_permission('tms.routes.edit')
  ) with check (
    public.is_super_admin() or public.user_has_permission('tms.routes.edit')
  );

drop policy if exists tms_route_delete on public.tms_route;
create policy tms_route_delete on public.tms_route
  for delete using (
    public.is_super_admin() or public.user_has_permission('tms.routes.delete')
  );

alter table public.tms_route_stop enable row level security;

drop policy if exists tms_route_stop_select on public.tms_route_stop;
create policy tms_route_stop_select on public.tms_route_stop
  for select using (
    public.is_super_admin() or public.user_has_permission('tms.routes.view')
  );

drop policy if exists tms_route_stop_insert on public.tms_route_stop;
create policy tms_route_stop_insert on public.tms_route_stop
  for insert with check (
    public.is_super_admin()
    or public.user_has_permission('tms.routes.create')
    or public.user_has_permission('tms.routes.edit')
  );

drop policy if exists tms_route_stop_update on public.tms_route_stop;
create policy tms_route_stop_update on public.tms_route_stop
  for update using (
    public.is_super_admin() or public.user_has_permission('tms.routes.edit')
  ) with check (
    public.is_super_admin() or public.user_has_permission('tms.routes.edit')
  );

drop policy if exists tms_route_stop_delete on public.tms_route_stop;
create policy tms_route_stop_delete on public.tms_route_stop
  for delete using (
    public.is_super_admin()
    or public.user_has_permission('tms.routes.edit')
    or public.user_has_permission('tms.routes.delete')
  );

alter table public.tms_route_possible_stop enable row level security;

drop policy if exists tms_route_possible_stop_select on public.tms_route_possible_stop;
create policy tms_route_possible_stop_select on public.tms_route_possible_stop
  for select using (
    public.is_super_admin() or public.user_has_permission('tms.routes.view')
  );

drop policy if exists tms_route_possible_stop_insert on public.tms_route_possible_stop;
create policy tms_route_possible_stop_insert on public.tms_route_possible_stop
  for insert with check (
    public.is_super_admin()
    or public.user_has_permission('tms.routes.create')
    or public.user_has_permission('tms.routes.edit')
  );

drop policy if exists tms_route_possible_stop_update on public.tms_route_possible_stop;
create policy tms_route_possible_stop_update on public.tms_route_possible_stop
  for update using (
    public.is_super_admin() or public.user_has_permission('tms.routes.edit')
  ) with check (
    public.is_super_admin() or public.user_has_permission('tms.routes.edit')
  );

drop policy if exists tms_route_possible_stop_delete on public.tms_route_possible_stop;
create policy tms_route_possible_stop_delete on public.tms_route_possible_stop
  for delete using (
    public.is_super_admin()
    or public.user_has_permission('tms.routes.edit')
    or public.user_has_permission('tms.routes.delete')
  );
