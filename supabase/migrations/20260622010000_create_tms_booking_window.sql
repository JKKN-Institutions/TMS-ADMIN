-- tms_booking_window: per-route-day admin override of the default booking rule.
-- No row for a (route, date) => the default fixed 6 PM-day-before window applies.
create table if not exists public.tms_booking_window (
  id                uuid primary key default gen_random_uuid(),
  route_id          uuid not null references public.tms_route(id) on delete cascade,
  travel_date       date not null,
  booking_enabled   boolean not null default true,
  deadline          timestamptz,            -- override default cutoff; null = default
  capacity_override integer,                -- cap below vehicle/route capacity; null = default
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid,
  unique (route_id, travel_date)
);
create index if not exists idx_booking_window_route_date
  on public.tms_booking_window (route_id, travel_date);

drop trigger if exists trg_tms_booking_window_updated_at on public.tms_booking_window;
create trigger trg_tms_booking_window_updated_at
  before update on public.tms_booking_window
  for each row execute function public.tms_set_updated_at();

alter table public.tms_booking_window enable row level security;
-- service-role only (admin API + student gate read); no learner-facing policy.
