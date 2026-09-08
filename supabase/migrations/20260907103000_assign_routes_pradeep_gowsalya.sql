-- Route/stop assignment for two learners, requested by the transport office
-- on 2026-09-07. Applied to the live DB the same day; recorded here so the
-- change is auditable and reproducible.
--
-- Prior state for BOTH: transport_route_id = NULL, transport_stop_id = NULL.
-- To revert, set both columns back to NULL for the two ids below.
--
-- Neither assignment creates a charge: both learners already hold a generated
-- 5,500 transport bill for 2026-2027, so the auto-bill-on-transport-entry
-- nudge finds nothing to raise. Verified after the update (1 bill each, no
-- duplicates).
--
-- The `transport_route_id is null` guard makes this idempotent and stops it
-- from clobbering a newer assignment if it is ever replayed.

-- PRADEEP KUMAR V <pradeepkumarv26lengg@jkkn.ac.in> -> route 23, stop
-- ELAMPILLAI BUS STAND. The office wrote "illampillai"; the catalogue spells
-- it ELAMPILLAI (PALL PANNAI). The stop came in a follow-up message, so the
-- live change was two statements; they are merged here into the one update
-- that reproduces the final state.
update learners_profiles
set transport_route_id = '1ddecd6b-1135-479c-8843-fcbece30f97b',
    transport_stop_id  = '0a8d2085-a787-4f39-8f38-c76da468f2c5',  -- ELAMPILLAI BUS STAND, seq 10
    updated_at = now()
where id = '041a590c-fa9f-45a3-9d1d-3d94012d1959'
  and transport_route_id is null;

-- GOWSALYA E.M <gowsalyaem26mba@jkkn.ac.in> -> route 18, stop R N PUTHUR.
-- The office wrote "RN pudur"; the catalogue spells it "R N PUTHUR"
-- (sequence 26, pickup 08:32, evening drop 17:07).
update learners_profiles
set transport_route_id = '8e2a240a-6f16-405b-8d88-b1852c8c1450',
    transport_stop_id  = '12980614-b5f7-4660-8684-9c09e1d77d00',
    updated_at = now()
where id = '62ea5a79-198e-47c9-a016-0c4a886a5150'
  and transport_route_id is null;
