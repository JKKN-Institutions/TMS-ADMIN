-- Route optimization: support vehicle-swap items alongside passenger moves.
-- Adds a discriminator `kind` plus from/to vehicle ids, and relaxes the
-- passenger-only NOT NULLs so a vehicle_swap row can omit learner/travel_date.
-- Additive + idempotent.

alter table public.tms_route_optimization_item
  add column if not exists kind text not null default 'passenger_move',
  add column if not exists from_vehicle_id uuid,
  add column if not exists to_vehicle_id uuid;

alter table public.tms_route_optimization_item
  alter column learner_id drop not null,
  alter column travel_date drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tms_route_optimization_item_kind_check'
  ) then
    alter table public.tms_route_optimization_item
      add constraint tms_route_optimization_item_kind_check
      check (kind in ('passenger_move', 'vehicle_swap'));
  end if;
end $$;
