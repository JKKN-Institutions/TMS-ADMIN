-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Staff ↔ Route assignment schema: tms_staff_route_assignment
--
-- Backs app/(admin)/staff-route-assignments and the
-- app/api/admin/staff-route-assignments endpoints. Lets an admin assign a staff
-- member (by email) to a route for monitoring/management.
--
-- Until now the code referenced an unprefixed `staff_route_assignments` table
-- that NEVER EXISTED in the database (every read 500'd / every write failed),
-- and the POST validated routes against the empty legacy `routes` table while
-- the route dropdown was already populated from `tms_route`. This migration
-- creates the table under the tms_ convention (same as tms_route / tms_vehicle /
-- tms_driver) with a real FK to tms_route, and the app code is refactored to
-- query `tms_staff_route_assignment`.
--
-- Target: shared MyJKKN Supabase project (project ref: kvizhngldtiuufknvehv).
-- Additive only — does not touch existing MyJKKN tables.
-- Apply via the Supabase MCP / dashboard (DDL).
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Shared updated_at trigger fn (also created by the tms_route / tms_vehicle
-- migrations; re-create is safe).
create or replace function public.tms_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── tms_staff_route_assignment ───────────────────────────────────────────────
create table if not exists public.tms_staff_route_assignment (
  id uuid primary key default gen_random_uuid(),
  staff_email text not null,
  route_id uuid not null references public.tms_route(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid,                       -- profiles.id of the admin who assigned
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One active assignment per (email, route). A removed assignment (is_active=false)
-- does not block re-assigning the same pair later. Mirrors the API's duplicate check.
create unique index if not exists uq_tms_sra_email_route_active
  on public.tms_staff_route_assignment(staff_email, route_id)
  where is_active;

create index if not exists idx_tms_sra_route_id on public.tms_staff_route_assignment(route_id);
create index if not exists idx_tms_sra_staff_email on public.tms_staff_route_assignment(staff_email);

drop trigger if exists trg_tms_sra_updated_at on public.tms_staff_route_assignment;
create trigger trg_tms_sra_updated_at
  before update on public.tms_staff_route_assignment
  for each row execute function public.tms_set_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────
-- The admin server uses the service-role key (bypasses RLS) and enforces the
-- tms.drivers.assign permission in the API handlers. These policies protect
-- direct anon/authenticated access, gated by the existing tms.drivers.* keys
-- from 20260527000000_add_tms_permission_keys.sql.
alter table public.tms_staff_route_assignment enable row level security;

drop policy if exists tms_sra_select on public.tms_staff_route_assignment;
create policy tms_sra_select on public.tms_staff_route_assignment
  for select using (
    public.is_super_admin()
    or public.user_has_permission('tms.drivers.view')
    or public.user_has_permission('tms.drivers.assign')
  );

drop policy if exists tms_sra_insert on public.tms_staff_route_assignment;
create policy tms_sra_insert on public.tms_staff_route_assignment
  for insert with check (
    public.is_super_admin() or public.user_has_permission('tms.drivers.assign')
  );

drop policy if exists tms_sra_update on public.tms_staff_route_assignment;
create policy tms_sra_update on public.tms_staff_route_assignment
  for update using (
    public.is_super_admin() or public.user_has_permission('tms.drivers.assign')
  ) with check (
    public.is_super_admin() or public.user_has_permission('tms.drivers.assign')
  );

drop policy if exists tms_sra_delete on public.tms_staff_route_assignment;
create policy tms_sra_delete on public.tms_staff_route_assignment
  for delete using (
    public.is_super_admin() or public.user_has_permission('tms.drivers.assign')
  );
