-- Stop pins on the live-tracking maps need a location a PERSON has confirmed.
--
-- tms_route_stop.latitude / longitude already exist, but their only writer so far is
-- the Route Optimization "Find stop locations" name lookup, and a name lookup is wrong
-- far more often than right for these stops. Measured 2026-11-10 on route 31 against
-- where the bus actually drove: 2 of 22 stops within 1.5 km, four wrong by 29-68 km.
-- The 14 coordinates stored today include two "COLLEGE" stops placed in Chennai,
-- 330 km from campus. Coordinates alone therefore cannot be shown to learners.
--
-- location_confirmed_at marks a pin that a person placed (or accepted) in
-- Routes -> Stop locations. The tracking maps read ONLY confirmed rows.
--
-- Nothing is deleted or rewritten: existing coordinates stay exactly as they are,
-- unconfirmed, so they are never drawn on a tracking map. Route Optimization keeps
-- reading latitude/longitude as before.
--
-- Additive and idempotent. Rollback:
--   alter table public.tms_route_stop
--     drop column if exists location_confirmed_at,
--     drop column if exists location_confirmed_by;

alter table public.tms_route_stop
  add column if not exists location_confirmed_at timestamptz,
  add column if not exists location_confirmed_by uuid;

comment on column public.tms_route_stop.location_confirmed_at is
  'When a person confirmed this stop''s latitude/longitude on the map (Routes -> Stop locations). NULL = not confirmed; the live-tracking maps do not draw the stop.';

comment on column public.tms_route_stop.location_confirmed_by is
  'profiles.id of the person who confirmed the stop''s map location.';
