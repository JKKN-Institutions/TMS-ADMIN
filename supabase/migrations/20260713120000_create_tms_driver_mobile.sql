-- ─────────────────────────────────────────────────────────────────────────────
-- tms_driver_mobile: mobile phones supplied to drivers.
-- Each row = one physical phone, linked to a driver via driver_staff_id, which
-- FKs to tms_driver(staff_id) — the SAME convention as tms_vehicle.assigned_driver_id
-- (staff_id is UNIQUE on tms_driver). Only staff with a tms_driver ops row are
-- assignable. Driver display names are resolved at read time from `staff`
-- (not denormalized here) so they never go stale.
--
-- Target: shared MyJKKN project (ref: kvizhngldtiuufknvehv). Additive. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- Shared updated_at trigger fn (already created by the GPS migration; re-assert
-- so this migration is self-contained and safe to run in isolation).
create or replace function public.tms_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists public.tms_driver_mobile (
  id uuid primary key default gen_random_uuid(),
  driver_staff_id uuid not null references public.tms_driver(staff_id) on delete restrict,

  -- Core device details
  brand text not null,
  model text not null,
  color text,
  imei text,
  status text not null default 'assigned'
    check (status in ('assigned','returned','damaged','lost')),
  supplied_date date,
  notes text,

  -- SIM & number
  sim_number text,
  phone_number text,
  network_provider text,

  -- Procurement
  purchase_date date,
  purchase_cost numeric(12,2),
  supplier_name text,
  invoice_number text,
  warranty_expiry date,

  -- Physical & specs
  condition text check (condition in ('new','used','refurbished')),
  storage_capacity text,
  serial_number text,
  accessories text,

  -- Audit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create index if not exists idx_tms_driver_mobile_driver on public.tms_driver_mobile(driver_staff_id);
create index if not exists idx_tms_driver_mobile_status on public.tms_driver_mobile(status);
-- One physical device (IMEI) can't be entered twice. Partial: many rows may have null IMEI.
create unique index if not exists uq_tms_driver_mobile_imei
  on public.tms_driver_mobile(imei) where imei is not null;

drop trigger if exists trg_tms_driver_mobile_updated_at on public.tms_driver_mobile;
create trigger trg_tms_driver_mobile_updated_at
  before update on public.tms_driver_mobile
  for each row execute function public.tms_set_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Admin routes use the service-role key (bypasses RLS). These policies gate any
-- direct anon/authenticated PostgREST access, keyed on the new permission keys.
alter table public.tms_driver_mobile enable row level security;

drop policy if exists tms_driver_mobile_select on public.tms_driver_mobile;
create policy tms_driver_mobile_select on public.tms_driver_mobile
  for select using (
    public.is_super_admin() or public.user_has_permission('tms.driver_mobiles.view')
  );

drop policy if exists tms_driver_mobile_insert on public.tms_driver_mobile;
create policy tms_driver_mobile_insert on public.tms_driver_mobile
  for insert with check (
    public.is_super_admin() or public.user_has_permission('tms.driver_mobiles.create')
  );

drop policy if exists tms_driver_mobile_update on public.tms_driver_mobile;
create policy tms_driver_mobile_update on public.tms_driver_mobile
  for update using (
    public.is_super_admin() or public.user_has_permission('tms.driver_mobiles.edit')
  ) with check (
    public.is_super_admin() or public.user_has_permission('tms.driver_mobiles.edit')
  );

drop policy if exists tms_driver_mobile_delete on public.tms_driver_mobile;
create policy tms_driver_mobile_delete on public.tms_driver_mobile
  for delete using (
    public.is_super_admin() or public.user_has_permission('tms.driver_mobiles.delete')
  );

-- ── Seed permission keys into the custom_roles catalog (data-driven) ─────────
-- VIEW → every role that can enter the admin dashboard (holds tms.dashboard.view).
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb) || '{"tms.driver_mobiles.view": true}'::jsonb,
    updated_at = now()
where coalesce((permissions ->> 'tms.dashboard.view')::boolean, false) = true;

-- CREATE + EDIT + DELETE → every role that can manage drivers (holds tms.drivers.manage).
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb)
                  || '{"tms.driver_mobiles.create": true, "tms.driver_mobiles.edit": true, "tms.driver_mobiles.delete": true}'::jsonb,
    updated_at = now()
where coalesce((permissions ->> 'tms.drivers.manage')::boolean, false) = true;

-- ── Verification (run separately after applying) ─────────────────────────────
--   select role_key,
--          permissions ? 'tms.driver_mobiles.view'   as can_view,
--          permissions ? 'tms.driver_mobiles.create' as can_create
--   from public.custom_roles
--   where permissions ? 'tms.driver_mobiles.view'
--   order by role_key;
