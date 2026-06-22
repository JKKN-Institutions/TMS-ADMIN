-- Staff↔route assignments. Matches the existing (modern but tableless)
-- staff-route-assignments admin module — keyed by staff_email, soft-delete via
-- is_active. Activating this table makes that module work, AND designates who the
-- boarding scanners are (a staff with an active assignment scans their routes).
create table if not exists public.tms_staff_route_assignment (
  id uuid primary key default gen_random_uuid(),
  staff_email text not null,
  route_id    uuid not null references public.tms_route(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  notes       text,
  is_active   boolean not null default true,
  assigned_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create unique index if not exists uq_tms_sra_email_route_active
  on public.tms_staff_route_assignment(staff_email, route_id) where is_active;
create index if not exists idx_tms_sra_email on public.tms_staff_route_assignment(staff_email) where is_active;
create index if not exists idx_tms_sra_route on public.tms_staff_route_assignment(route_id) where is_active;

alter table public.tms_staff_route_assignment enable row level security;
-- A staff may read their OWN assignments (admin module + boarding API use service-role).
create policy tms_sra_staff_select on public.tms_staff_route_assignment
  for select using (
    lower(staff_email) = lower((select email from public.profiles where id = auth.uid()))
  );
