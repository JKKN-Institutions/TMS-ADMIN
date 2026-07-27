-- Return the JALAKANDAPURAM BUS STOP learners to route 24.
--
-- The previous migration (20260727140000) pulled JALAKANDAPURAM BUS STOP onto route 01
-- and moved its 12 learners with it. Those learners are to stay on route 24 after all,
-- so this reverses that part: the 12 learners and their upcoming bookings go back to
-- route 24, and the stop is removed from route 01 entirely.
--
--   route 24:  49 -> 61 learners / 60 seats  (1 over; was 90 before today)
--   route 01:  42 -> 30 learners / 60 seats
--
-- The rest of the 2026-07-27 rebalance stands: the other 29 learners stay on route 01.
-- Route 01 reverts to 10 stops beginning at JALAKANDAPURAM SANTHAPETTAI 07:42, exactly
-- as migration 20260727120000 left it. Route 24 is unchanged and still serves the stop
-- at 07:40, so nobody's physical boarding point moves.
--
-- Design doc: docs/superpowers/specs/2026-07-27-route-01-jalakandapuram-stops-design.md

-- Route 01 JALAKANDAPURAM              87217217-1cea-408b-a786-941778bf54ef
-- Route 24 MECHERI (VIA NANGAVALLI)    79f0ff06-b3d4-4373-b27c-debb69502ba4
-- route 01 JALAKANDAPURAM BUS STOP     449fe855-e2f6-4585-a179-f27f08cb81a2  (to be removed)
-- route 24 JALAKANDAPURAM BUS STOP     7b001010-43be-40cb-9888-ec0c74e685ba  (the destination)

-- ---------------------------------------------------------------------------
-- Step 1. Learners back to route 24's stop of the same name.
-- ---------------------------------------------------------------------------
UPDATE learners_profiles
SET transport_route_id = '79f0ff06-b3d4-4373-b27c-debb69502ba4',
    transport_stop_id  = '7b001010-43be-40cb-9888-ec0c74e685ba'
WHERE transport_stop_id = '449fe855-e2f6-4585-a179-f27f08cb81a2';

-- ---------------------------------------------------------------------------
-- Step 2. Their upcoming bookings follow. Every booking on the route 01 copy of
--         this stop was created by this morning's re-point (it had no bookings of
--         its own -- it was inserted today), so all of them move back.
-- ---------------------------------------------------------------------------
UPDATE tms_booking
SET route_id = '79f0ff06-b3d4-4373-b27c-debb69502ba4',
    stop_id  = '7b001010-43be-40cb-9888-ec0c74e685ba'
WHERE stop_id = '449fe855-e2f6-4585-a179-f27f08cb81a2';

-- ---------------------------------------------------------------------------
-- Step 3. Guard, then drop the stop from route 01.
--         Deleting a tms_route_stop CASCADEs to tms_fee_structure_stop_rate, so the
--         2 fare rows created for this copy go with it -- correct, since route 01 no
--         longer calls here and route 24 keeps its own rows. The guard makes sure no
--         learner, booking, attendance or staff row is still pointing at it, so the
--         CASCADE is the only thing that happens.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_refs text;
BEGIN
  SELECT concat_ws(', ',
           nullif('learners='   || (SELECT count(*) FROM learners_profiles WHERE transport_stop_id = '449fe855-e2f6-4585-a179-f27f08cb81a2'), 'learners=0'),
           nullif('bookings='   || (SELECT count(*) FROM tms_booking       WHERE stop_id           = '449fe855-e2f6-4585-a179-f27f08cb81a2'), 'bookings=0'),
           nullif('attendance=' || (SELECT count(*) FROM tms_attendance    WHERE stop_id           = '449fe855-e2f6-4585-a179-f27f08cb81a2'), 'attendance=0'),
           nullif('staff='      || (SELECT count(*) FROM staff             WHERE transport_stop_id = '449fe855-e2f6-4585-a179-f27f08cb81a2'), 'staff=0')
         )
    INTO v_refs;

  IF v_refs <> '' THEN
    RAISE EXCEPTION
      'Aborting: route 01 JALAKANDAPURAM BUS STOP is still referenced (%)', v_refs;
  END IF;
END $$;

DELETE FROM tms_route_stop WHERE id = '449fe855-e2f6-4585-a179-f27f08cb81a2';

-- ---------------------------------------------------------------------------
-- Step 4. Re-sequence route 01 back to 10 stops. SANTHAPETTAI is the origin again,
--         so it regains is_major_stop.
-- ---------------------------------------------------------------------------
UPDATE tms_route_stop s
SET sequence_order = t.seq,
    is_major_stop  = t.major,
    updated_at     = now()
FROM (VALUES
  ('JALAKANDAPURAM SANTHAPETTAI',      1, true),
  ('JALAKANDAPURAM MUNIYAPPAN KOVIL',  2, false),
  ('KATTINAYAKKAN PATTI',              3, false),
  ('KATTINAYAKKAN PATTI EARIE',        4, false),
  ('COLLOUR PATTI',                    5, false),
  ('IRUPPALI MOOLAKARAI',              6, false),
  ('VELAMMA VALASU',                   7, false),
  ('KALLUKADAI',                       8, false),
  ('KUPPANOOR',                        9, false),
  ('COLLEGE',                         10, true)
) AS t(nm, seq, major)
WHERE s.route_id  = '87217217-1cea-408b-a786-941778bf54ef'
  AND s.stop_name = t.nm;

-- ---------------------------------------------------------------------------
-- Step 5. Route 01 header back to starting at SANTHAPETTAI, 07:42.
-- ---------------------------------------------------------------------------
UPDATE tms_route
SET start_location = 'JALAKANDAPURAM SANTHAPETTAI',
    departure_time = '07:42',
    updated_at     = now()
WHERE id = '87217217-1cea-408b-a786-941778bf54ef';
