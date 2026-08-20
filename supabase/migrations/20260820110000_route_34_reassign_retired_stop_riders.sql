-- Route 34 re-import follow-up: move the riders stranded on retired stops.
--
-- The 20260820100000 migration retired 5 stops that the printed timetable drops.
-- Their rows were kept (is_active = false) so bookings and fee rates survived,
-- but the people pointing at them can no longer book. This migration repoints
-- two of those groups, per the transport office:
--
--   KOKKARAYANPETTAI PETROL BUNK -> KOKKARAYANPETTAI   (same route 34)
--   M G R MEDU                   -> MGR NAGAR          (CROSS-ROUTE, 34 -> 31)
--
-- MGR NAGAR only exists on route 31 (THIRUCHENGODU NO 31), at 08:44 / 16:52 —
-- effectively the same pickup slot as route 34's M G R MEDU (08:44 / 16:55),
-- which is what identifies them as the same physical stop. A cross-route move
-- must write transport_route_id AND transport_stop_id together; writing only the
-- stop leaves the rider on a route that doesn't serve it, and the roster and the
-- boarding screen then disagree about where they belong.
--
-- transport_fee is deliberately NOT touched: it is null/0 for every affected
-- learner, so the live fare comes from tms_fee_structure_stop_rate via the stop.
-- Writing a number here would invent a fare override that did not exist before.
--
-- OTTAMETHAI is NOT handled here — it was also flagged for route 31, but route 31
-- has no OTTAMETHAI stop and no destination was named. Its 1 learner stays put
-- pending that decision.

do $$
declare
  v_r34 uuid;
  v_r31 uuid;
  v_petrol_bunk uuid;
  v_kokkarayanpettai uuid;
  v_mgr_medu uuid;
  v_mgr_nagar uuid;
  n int;
begin
  select id into strict v_r34 from tms_route where route_code = 'KOKKARAYAN PETTAI NO 34';
  select id into strict v_r31 from tms_route where route_code = 'THIRUCHENGODU NO 31';

  select id into strict v_petrol_bunk      from tms_route_stop
    where route_id = v_r34 and stop_name = 'KOKKARAYANPETTAI PETROL BUNK';
  select id into strict v_kokkarayanpettai from tms_route_stop
    where route_id = v_r34 and stop_name = 'KOKKARAYANPETTAI';
  select id into strict v_mgr_medu         from tms_route_stop
    where route_id = v_r34 and stop_name = 'M G R MEDU';
  select id into strict v_mgr_nagar        from tms_route_stop
    where route_id = v_r31 and stop_name = 'MGR NAGAR';

  -- ── 1. PETROL BUNK -> KOKKARAYANPETTAI (route unchanged) ───────────────────
  -- Both stops price at Rs 15,600 in every current fee structure, so no rider's
  -- fare moves and no bill needs restating.
  update learners_profiles set transport_stop_id = v_kokkarayanpettai
   where transport_stop_id = v_petrol_bunk;
  get diagnostics n = row_count; raise notice 'petrol bunk -> kokkarayanpettai: % learners', n;

  update staff set transport_stop_id = v_kokkarayanpettai
   where transport_stop_id = v_petrol_bunk;
  get diagnostics n = row_count; raise notice 'petrol bunk -> kokkarayanpettai: % staff', n;

  -- ── 2. M G R MEDU -> MGR NAGAR (route 34 -> 31) ────────────────────────────
  -- Fare drops Rs 9,600 -> Rs 6,600/yr. Existing bills are NOT rewritten here;
  -- restating money is a separate, explicitly-authorised step.
  update learners_profiles
     set transport_stop_id = v_mgr_nagar, transport_route_id = v_r31
   where transport_stop_id = v_mgr_medu;
  get diagnostics n = row_count; raise notice 'mgr medu -> mgr nagar: % learners', n;

  update staff
     set transport_stop_id = v_mgr_nagar, transport_route_id = v_r31
   where transport_stop_id = v_mgr_medu;
  get diagnostics n = row_count; raise notice 'mgr medu -> mgr nagar: % staff', n;
end $$;
