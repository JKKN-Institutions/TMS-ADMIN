-- tms_service_calendar: admin-managed EXCEPTIONS to the default "every day is
-- bookable". One row = one blocked date, optionally scoped to a single route
-- (route_id NULL = applies to ALL routes). 'holiday' vs 'no_service' both block
-- booking; they differ only in the label shown to learners.
create table if not exists public.tms_service_calendar (
  id             uuid primary key default gen_random_uuid(),
  exception_date date not null,
  route_id       uuid references public.tms_route(id) on delete cascade,
  kind           text not null check (kind in ('holiday', 'no_service')),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid
);

-- One all-routes exception per date, and one per (date, route). Two PARTIAL
-- unique indexes because Postgres treats NULLs as distinct in a normal unique
-- constraint (which would let duplicate all-routes holidays slip in).
create unique index if not exists uq_service_calendar_allroutes
  on public.tms_service_calendar (exception_date)
  where route_id is null;
create unique index if not exists uq_service_calendar_perroute
  on public.tms_service_calendar (exception_date, route_id)
  where route_id is not null;

-- Gate lookup index (date-range scan, route filter).
create index if not exists idx_service_calendar_date_route
  on public.tms_service_calendar (exception_date, route_id);

-- Reuse the project's shared updated_at trigger fn (same one tms_booking uses).
drop trigger if exists trg_tms_service_calendar_updated_at on public.tms_service_calendar;
create trigger trg_tms_service_calendar_updated_at
  before update on public.tms_service_calendar
  for each row execute function public.tms_set_updated_at();

alter table public.tms_service_calendar enable row level security;
-- No learner-facing RLS policy: writes/reads happen via the service-role admin
-- API only; learners receive blocked dates through the student board API.
