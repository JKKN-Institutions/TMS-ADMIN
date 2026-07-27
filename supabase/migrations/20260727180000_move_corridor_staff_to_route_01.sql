-- Move the remaining corridor staff from route 24 to route 01.
--
-- After the 2026-07-27 rebalance, route 24's stops 13-21 (JALAKANDAPURAM SANTHAPETTAI
-- through KUPPANOOR) carry ZERO learners -- route 01 serves that corridor now. Only 3
-- staff were still bound to those stops. Moving them leaves nobody at all boarding
-- route 24 between stops 13 and 21, so the driver skips that stretch in practice.
--
--   buvaneswari.g@jkkn.ac.in       COLLOUR PATTI
--   faculty@jkkn.ac.in             COLLOUR PATTI
--   vignesh_sasikumar@jkkn.a.c.in  KUPPANOOR
--
-- The stop ROWS on route 24 are deliberately left in place. They cannot be deleted --
-- 172 historical bookings (25 Jun - 25 Jul) reference them under a NO ACTION foreign
-- key, so a DELETE aborts -- and they should not be, because those bookings plus 62
-- attendance rows are the record that students really did board there. Deleting would
-- also CASCADE away 18 fee-rate rows. tms_route_stop has no is_active/deleted_at
-- column, so "served" vs "not served" is not expressible in the schema today; leaving
-- the rows with nobody assigned is the honest representation.
--
-- Each staff member lands on route 01's stop of the SAME NAME, so no physical boarding
-- point changes -- only which bus collects them.
--
-- Design doc: docs/superpowers/specs/2026-07-27-route-01-jalakandapuram-stops-design.md

-- Route 01 JALAKANDAPURAM              87217217-1cea-408b-a786-941778bf54ef
-- Route 24 MECHERI (VIA NANGAVALLI)    79f0ff06-b3d4-4373-b27c-debb69502ba4

-- Guard: every corridor stop holding staff must have a same-named counterpart on
-- route 01, otherwise the move would null out someone's boarding point.
DO $$
DECLARE
  v_unmapped text;
BEGIN
  SELECT string_agg(DISTINCT s24.stop_name, '; ')
    INTO v_unmapped
  FROM staff st
  JOIN tms_route_stop s24 ON s24.id = st.transport_stop_id
  WHERE st.transport_route_id = '79f0ff06-b3d4-4373-b27c-debb69502ba4'
    AND s24.sequence_order BETWEEN 13 AND 21
    AND NOT EXISTS (
      SELECT 1 FROM tms_route_stop s01
      WHERE s01.route_id  = '87217217-1cea-408b-a786-941778bf54ef'
        AND s01.stop_name = s24.stop_name
    );

  IF v_unmapped IS NOT NULL THEN
    RAISE EXCEPTION
      'Aborting: corridor stop(s) holding staff have no route 01 counterpart: %', v_unmapped;
  END IF;
END $$;

UPDATE staff st
SET transport_route_id = '87217217-1cea-408b-a786-941778bf54ef',
    transport_stop_id  = s01.id
FROM tms_route_stop s24
JOIN tms_route_stop s01
  ON s01.route_id  = '87217217-1cea-408b-a786-941778bf54ef'
 AND s01.stop_name = s24.stop_name
WHERE s24.id = st.transport_stop_id
  AND s24.route_id = '79f0ff06-b3d4-4373-b27c-debb69502ba4'
  AND s24.sequence_order BETWEEN 13 AND 21
  AND st.transport_route_id = '79f0ff06-b3d4-4373-b27c-debb69502ba4';
