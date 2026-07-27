-- Move the Jalakandapuram-corridor learners from route 24 to route 01.
--
-- Route 24 (bus TN34MB5991, 60 seats) was carrying 90 learners. Route 01 now runs
-- the same Jalakandapuram -> college corridor on bus TN30BH1040 (60 seats) but was
-- carrying 1. This rebalances by moving the 41 learners who board in the shared
-- corridor onto route 01:
--
--   route 24:  90 -> 49 learners / 60 seats
--   route 01:   1 -> 42 learners / 60 seats
--
-- Route 24 keeps all 22 of its stops and still serves this corridor -- this is a
-- reallocation of passengers, not a withdrawal of service. The 3 staff who board at
-- these stops are deliberately left on route 24 for that reason.
--
-- Billing is unaffected: billing_student_bills carries no route_id or stop_id, and
-- route 01's per-stop fares were copied from route 24 in the previous migration, so
-- the amounts are identical either way.
--
-- Idempotent: stops are upserted by name, and the learner/booking moves are scoped by
-- "still on route 24", so a re-run is a no-op.
--
-- Design doc: docs/superpowers/specs/2026-07-27-route-01-jalakandapuram-stops-design.md

-- Route 01 JALAKANDAPURAM              87217217-1cea-408b-a786-941778bf54ef
-- Route 24 MECHERI (VIA NANGAVALLI)    79f0ff06-b3d4-4373-b27c-debb69502ba4

DROP TABLE IF EXISTS _r01_target;
CREATE TEMP TABLE _r01_target (
  sequence_order integer NOT NULL,
  stop_name      text    NOT NULL,
  stop_time      time    NOT NULL,
  evening_time   time    NOT NULL,
  is_major_stop  boolean NOT NULL,
  annual_amount  numeric          -- NULL = unpriced (COLLEGE, the destination)
);

-- JALAKANDAPURAM BUS STOP joins as the new origin, so it takes is_major_stop and
-- SANTHAPETTAI (previously the origin) drops to an ordinary stop.
INSERT INTO _r01_target VALUES
  ( 1, 'JALAKANDAPURAM BUS STOP',        '07:40', '17:48', true,  20900),
  ( 2, 'JALAKANDAPURAM SANTHAPETTAI',    '07:42', '17:42', false, 20900),
  ( 3, 'JALAKANDAPURAM MUNIYAPPAN KOVIL','07:45', '17:40', false,  7150),
  ( 4, 'KATTINAYAKKAN PATTI',            '07:47', '17:37', false, 20000),
  ( 5, 'KATTINAYAKKAN PATTI EARIE',      '07:50', '17:35', false, 20000),
  ( 6, 'COLLOUR PATTI',                  '07:55', '17:30', false, 20000),
  ( 7, 'IRUPPALI MOOLAKARAI',            '08:00', '17:25', false, 20000),
  ( 8, 'VELAMMA VALASU',                 '08:10', '17:20', false, 20000),
  ( 9, 'KALLUKADAI',                     '08:20', '17:15', false, 20000),
  (10, 'KUPPANOOR',                      '08:40', '17:00', false,  7150),
  (11, 'COLLEGE',                        '08:55', '16:45', true,   NULL);

-- ---------------------------------------------------------------------------
-- Step 1. Add JALAKANDAPURAM BUS STOP and re-sequence route 01 to 11 stops.
--         Matching by name preserves existing stop UUIDs, so the fee rates and
--         bookings already attached to them stay attached.
-- ---------------------------------------------------------------------------
UPDATE tms_route_stop s
SET sequence_order = t.sequence_order,
    stop_time      = t.stop_time,
    evening_time   = t.evening_time,
    is_major_stop  = t.is_major_stop,
    updated_at     = now()
FROM _r01_target t
WHERE s.route_id  = '87217217-1cea-408b-a786-941778bf54ef'
  AND s.stop_name = t.stop_name;

INSERT INTO tms_route_stop
  (route_id, stop_name, stop_time, evening_time, sequence_order, is_major_stop)
SELECT '87217217-1cea-408b-a786-941778bf54ef',
       t.stop_name, t.stop_time, t.evening_time, t.sequence_order, t.is_major_stop
FROM _r01_target t
WHERE NOT EXISTS (
  SELECT 1 FROM tms_route_stop s
  WHERE s.route_id  = '87217217-1cea-408b-a786-941778bf54ef'
    AND s.stop_name = t.stop_name
);

-- ---------------------------------------------------------------------------
-- Step 2. Price the new stop in both current-year fee structures. A stop with no
--         rate row has no fare and its learners cannot be billed.
-- ---------------------------------------------------------------------------
INSERT INTO tms_fee_structure_stop_rate (fee_structure_id, stop_id, annual_amount)
SELECT fs.id, s.id, t.annual_amount
FROM _r01_target t
JOIN tms_route_stop s
  ON s.route_id  = '87217217-1cea-408b-a786-941778bf54ef'
 AND s.stop_name = t.stop_name
CROSS JOIN (VALUES
  ('9f8f5153-d45a-4fbf-85f2-c399292c201b'::uuid),  -- 2026-2027 (Arts Aided)
  ('1cff2da9-565b-4618-9c21-68fb66c52aad'::uuid)   -- 2026-2027 (Staff - All Colleges)
) AS fs(id)
WHERE t.annual_amount IS NOT NULL
ON CONFLICT (fee_structure_id, stop_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Step 3. Route 01 header now starts at the bus stop, two minutes earlier.
-- ---------------------------------------------------------------------------
UPDATE tms_route
SET start_location = 'JALAKANDAPURAM BUS STOP',
    departure_time = '07:40',
    updated_at     = now()
WHERE id = '87217217-1cea-408b-a786-941778bf54ef';

-- ---------------------------------------------------------------------------
-- Step 4. Move the learners. Each one lands on route 01's stop of the same name,
--         so nobody's boarding point changes in the real world -- only the bus.
--         Guarded: aborts if any corridor stop has no same-named counterpart on
--         route 01, rather than moving a learner to a NULL stop.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_unmapped text;
BEGIN
  SELECT string_agg(DISTINCT s24.stop_name, '; ')
    INTO v_unmapped
  FROM learners_profiles l
  JOIN tms_route_stop s24 ON s24.id = l.transport_stop_id
  WHERE l.transport_route_id = '79f0ff06-b3d4-4373-b27c-debb69502ba4'
    AND s24.sequence_order BETWEEN 12 AND 22
    AND NOT EXISTS (
      SELECT 1 FROM tms_route_stop s01
      WHERE s01.route_id  = '87217217-1cea-408b-a786-941778bf54ef'
        AND s01.stop_name = s24.stop_name
    );

  IF v_unmapped IS NOT NULL THEN
    RAISE EXCEPTION
      'Aborting: corridor stop(s) have no route 01 counterpart: %', v_unmapped;
  END IF;
END $$;

UPDATE learners_profiles l
SET transport_route_id = '87217217-1cea-408b-a786-941778bf54ef',
    transport_stop_id  = s01.id
FROM tms_route_stop s24
JOIN tms_route_stop s01
  ON s01.route_id  = '87217217-1cea-408b-a786-941778bf54ef'
 AND s01.stop_name = s24.stop_name
WHERE s24.id = l.transport_stop_id
  AND s24.route_id = '79f0ff06-b3d4-4373-b27c-debb69502ba4'
  AND s24.sequence_order BETWEEN 12 AND 22
  AND l.transport_route_id = '79f0ff06-b3d4-4373-b27c-debb69502ba4';

-- ---------------------------------------------------------------------------
-- Step 5. Re-point their upcoming bookings so the seat follows the learner.
--         Past bookings are left alone -- they are a record of travel that
--         actually happened on route 24. The cutover date is fixed rather than
--         current_date so a replay reproduces exactly this split.
--         tms_booking's primary key is (learner_id, travel_date), so changing
--         route_id/stop_id cannot collide.
-- ---------------------------------------------------------------------------
UPDATE tms_booking b
SET route_id = '87217217-1cea-408b-a786-941778bf54ef',
    stop_id  = s01.id
FROM tms_route_stop s24
JOIN tms_route_stop s01
  ON s01.route_id  = '87217217-1cea-408b-a786-941778bf54ef'
 AND s01.stop_name = s24.stop_name
WHERE s24.id = b.stop_id
  AND s24.route_id = '79f0ff06-b3d4-4373-b27c-debb69502ba4'
  AND s24.sequence_order BETWEEN 12 AND 22
  AND b.route_id = '79f0ff06-b3d4-4373-b27c-debb69502ba4'
  AND b.travel_date >= DATE '2026-07-27';

DROP TABLE IF EXISTS _r01_target;
