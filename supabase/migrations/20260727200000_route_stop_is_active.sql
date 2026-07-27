-- Give tms_route_stop a served/retired flag, and retire route 24's Jalakandapuram corridor.
--
-- Route 01 now serves JALAKANDAPURAM SANTHAPETTAI through KUPPANOOR, and route 24 has
-- nobody boarding there. Route 24 should stop listing those 9 stops.
--
-- They cannot be DELETEd. 172 historical bookings (25 Jun - 25 Jul) reference them under
-- a NO ACTION foreign key, so a delete aborts outright; it would also SET NULL on 62
-- attendance rows and CASCADE away 18 fee-rate rows. Those bookings and attendance rows
-- record travel that actually happened and must survive a timetable edit.
--
-- Until now the table could only express "this stop exists", not "this route no longer
-- calls here". is_active adds that. Retired stops keep their id, so every historical
-- reference still resolves, while the route's current itinerary excludes them.
--
-- Consumers split along a clear line, applied in the same commit:
--   * LISTING a route's itinerary  -> filter is_active = true
--       admin stops API, lib/routes/detail.ts, student route view, boarding roster,
--       driver route view, admin stop search
--   * RESOLVING a known stop id    -> NO filter, or history stops rendering
--       student transport-context, schedules manifest, boarding passengers ordering,
--       fee stop-rates, route optimization, admin bookings list
--
-- Design doc: docs/superpowers/specs/2026-07-27-route-01-jalakandapuram-stops-design.md

ALTER TABLE tms_route_stop
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN tms_route_stop.is_active IS
  'False when the route no longer calls here. The row is kept so historical bookings and '
  'attendance still resolve. Filter on this when listing a route itinerary; do NOT filter '
  'when resolving a stop id that came from an existing booking or allocation.';

-- Partial index: itinerary queries always want the active subset.
CREATE INDEX IF NOT EXISTS idx_tms_route_stop_route_active
  ON tms_route_stop (route_id, sequence_order)
  WHERE is_active;

-- Retire route 24's stops 13-21 (JALAKANDAPURAM SANTHAPETTAI .. KUPPANOOR).
-- Stop 12 (JALAKANDAPURAM BUS STOP) stays: its 12 learners ride route 24.
-- Stop 22 (COLLEGE) stays: it is the destination.
UPDATE tms_route_stop
SET is_active  = false,
    updated_at = now()
WHERE route_id = '79f0ff06-b3d4-4373-b27c-debb69502ba4'
  AND sequence_order BETWEEN 13 AND 21;

-- Safety net: retiring a stop that someone is still allocated to would strand them.
DO $$
DECLARE
  v_stranded int;
BEGIN
  SELECT count(*) INTO v_stranded
  FROM tms_route_stop s
  WHERE s.is_active = false
    AND ( EXISTS (SELECT 1 FROM learners_profiles l WHERE l.transport_stop_id = s.id)
       OR EXISTS (SELECT 1 FROM staff            st WHERE st.transport_stop_id = s.id) );

  IF v_stranded > 0 THEN
    RAISE EXCEPTION
      'Aborting: % retired stop(s) still have a learner or staff member allocated', v_stranded;
  END IF;
END $$;
