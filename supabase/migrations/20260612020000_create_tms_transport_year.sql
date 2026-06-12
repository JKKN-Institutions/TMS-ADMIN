-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Transport Year — academic-year periods for the transport module
--
-- Mirrors hostel_years (same columns minus description, single-current
-- enforcement trigger, updated_at touch trigger) but follows TMS conventions:
--   • table name tms_transport_year (singular, tms_ prefix)
--   • RLS enabled with NO policies — anon/authenticated get nothing,
--     service-role bypasses; access goes through permission-checked
--     /api/admin routes, not RLS roles like hostel_years uses.
--
-- Exactly one row may have is_current = true: the AFTER trigger demotes all
-- other rows whenever a row is inserted/updated as current.
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tms_transport_year (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,             -- e.g. '2026 - 2027'
  start_date  date not null,
  end_date    date not null,
  is_active   boolean not null default true,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tms_transport_year_name_unique unique (name),
  constraint tms_transport_year_date_order check (end_date > start_date)
);

comment on table public.tms_transport_year is
  'Transport academic years (mirrors hostel_years). Single current year enforced by trigger. Service-role access only; no RLS policies by design.';

create index if not exists idx_tms_transport_year_active
  on public.tms_transport_year (is_active, start_date desc);

-- Single-current enforcement: when a row becomes current, demote the rest.
create or replace function public.enforce_single_current_tms_transport_year()
returns trigger
language plpgsql
as $$
begin
  update public.tms_transport_year
    set is_current = false
    where id <> new.id and is_current = true;
  return new;
end;
$$;

drop trigger if exists trg_tms_transport_year_single_current on public.tms_transport_year;
create trigger trg_tms_transport_year_single_current
  after insert or update of is_current on public.tms_transport_year
  for each row when (new.is_current = true)
  execute function public.enforce_single_current_tms_transport_year();

-- updated_at touch (update_updated_at_column() already exists in this DB).
drop trigger if exists trg_tms_transport_year_updated_at on public.tms_transport_year;
create trigger trg_tms_transport_year_updated_at
  before update on public.tms_transport_year
  for each row execute function public.update_updated_at_column();

alter table public.tms_transport_year enable row level security;
-- Intentionally NO policies: deny-all for anon/authenticated; service-role bypasses.

-- Seed the current year (mirrors the live hostel_years row).
insert into public.tms_transport_year (name, start_date, end_date, is_active, is_current)
values ('2026 - 2027', '2026-06-01', '2027-05-31', true, true)
on conflict (name) do nothing;
