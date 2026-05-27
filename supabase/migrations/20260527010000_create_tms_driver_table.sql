-- tms_driver: TMS-owned extension table for driver-role staff.
-- MyJKKN owns `staff`; TMS owns operational driver details here, linked 1:1 by staff_id.
-- APPLIED to shared project kvizhngldtiuufknvehv on 2026-05-27 via MCP.
create table if not exists public.tms_driver (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null unique references public.staff(id) on delete cascade,
  license_number text,
  license_expiry date,
  experience_years integer not null default 0,
  rating numeric(2,1) not null default 0,
  total_trips integer not null default 0,
  driver_status text not null default 'active' check (driver_status in ('active','inactive','on_leave')),
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  aadhar_number text,
  medical_certificate_expiry date,
  location_sharing_enabled boolean not null default false,
  assigned_route_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create index if not exists idx_tms_driver_staff_id on public.tms_driver(staff_id);

create or replace function public.set_tms_driver_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tms_driver_updated_at on public.tms_driver;
create trigger trg_tms_driver_updated_at
  before update on public.tms_driver
  for each row execute function public.set_tms_driver_updated_at();

alter table public.tms_driver enable row level security;

create policy tms_driver_select on public.tms_driver
  for select using (
    public.is_super_admin() or public.user_has_permission('tms.drivers.view')
  );

create policy tms_driver_insert on public.tms_driver
  for insert with check (
    public.is_super_admin() or public.user_has_permission('tms.drivers.manage')
  );

create policy tms_driver_update on public.tms_driver
  for update using (
    public.is_super_admin() or public.user_has_permission('tms.drivers.manage')
  ) with check (
    public.is_super_admin() or public.user_has_permission('tms.drivers.manage')
  );

create policy tms_driver_delete on public.tms_driver
  for delete using (
    public.is_super_admin() or public.user_has_permission('tms.drivers.manage')
  );
