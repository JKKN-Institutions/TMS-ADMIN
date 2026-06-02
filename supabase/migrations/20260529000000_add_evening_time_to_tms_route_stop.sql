-- ─────────────────────────────────────────────────────────────────────────────
-- Add evening_time to tms_route_stop
--
-- The JKKN bus-timing source data lists TWO times per stop: a MORNING (inbound,
-- to-college pickup) time and an EVENING (outbound, from-college drop) time.
-- tms_route_stop previously stored only one time column (stop_time). To preserve
-- the full schedule, stop_time now holds the inbound/morning time and this new
-- column holds the outbound/evening time.
--
-- Additive + idempotent: nullable column, existing rows untouched. Matches the
-- tms_ convention from 20260528000000_create_tms_route_schema.sql.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tms_route_stop
  add column if not exists evening_time time;

comment on column public.tms_route_stop.evening_time is
  'Outbound (from-college) drop time. stop_time holds the inbound (morning) pickup time. Nullable: a stop is kept even when its evening time is missing/unparseable in the source.';
