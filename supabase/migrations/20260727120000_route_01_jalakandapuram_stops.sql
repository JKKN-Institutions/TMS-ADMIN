-- Route 01 JALAKANDAPURAM — build out the SANTHAPETTAI -> COLLEGE corridor.
--
-- Route 01 was a 2-stop stub (MECHERI, JALAKANDAPURAM) ending at "Kumarapalayam"
-- with no evening_time at all, so it had no return leg and was not bookable.
-- Route 24 (MECHERI VIA NANGAVALLI) already runs the correct corridor as its
-- stops 13-22, fully timed both ways and fully priced. This migration copies
-- that corridor onto route 01. Route 24's stop list is NOT changed; the only
-- edit to route 24 is a one-word spelling correction (step 6).
--
-- The MECHERI stop is repurposed IN PLACE rather than deleted, because it is
-- referenced by 2 bookings under a NO ACTION foreign key (a DELETE would abort)
-- and by 2 fee-rate rows under a CASCADE foreign key (a DELETE would silently
-- destroy them). Keeping the UUID preserves the bookings, both fee rates and the
-- attached learner's boarding point. Its existing rate (Rs 20,900) is already
-- the correct SANTHAPETTAI amount on route 24, so no fee edit is needed for it.
--
-- Idempotent: stops are matched by name, so re-running converges instead of
-- duplicating. Stop UUIDs are preserved across re-runs, which keeps fee rates
-- and bookings attached.
--
-- Design doc: docs/superpowers/specs/2026-07-27-route-01-jalakandapuram-stops-design.md

-- Route 01 JALAKANDAPURAM
-- 87217217-1cea-408b-a786-941778bf54ef
-- Route 24 MECHERI (VIA NANGAVALLI)
-- 79f0ff06-b3d4-4373-b27c-debb69502ba4

DROP TABLE IF EXISTS _r01_target;
CREATE TEMP TABLE _r01_target (
  sequence_order integer NOT NULL,
  stop_name      text    NOT NULL,
  stop_time      time    NOT NULL,
  evening_time   time    NOT NULL,
  is_major_stop  boolean NOT NULL,
  annual_amount  numeric          -- NULL = unpriced (COLLEGE, the destination)
);

INSERT INTO _r01_target VALUES
  ( 1, 'JALAKANDAPURAM SANTHAPETTAI',     '07:42', '17:42', true,  20900),
  ( 2, 'JALAKANDAPURAM MUNIYAPPAN KOVIL', '07:45', '17:40', false,  7150),
  ( 3, 'KATTINAYAKKAN PATTI',             '07:47', '17:37', false, 20000),
  ( 4, 'KATTINAYAKKAN PATTI EARIE',       '07:50', '17:35', false, 20000),
  ( 5, 'COLLOUR PATTI',                   '07:55', '17:30', false, 20000),
  ( 6, 'IRUPPALI MOOLAKARAI',             '08:00', '17:25', false, 20000),
  ( 7, 'VELAMMA VALASU',                  '08:10', '17:20', false, 20000),
  ( 8, 'KALLUKADAI',                      '08:20', '17:15', false, 20000),
  ( 9, 'KUPPANOOR',                       '08:40', '17:00', false,  7150),
  (10, 'COLLEGE',                         '08:55', '16:45', true,   NULL);

-- ---------------------------------------------------------------------------
-- Step 1. Repurpose the MECHERI row in place -> JALAKANDAPURAM SANTHAPETTAI.
--         Targeted by id, so this is naturally idempotent.
-- ---------------------------------------------------------------------------
UPDATE tms_route_stop
SET stop_name     = 'JALAKANDAPURAM SANTHAPETTAI',
    sequence_order = 1,
    stop_time      = '07:42',
    evening_time   = '17:42',
    is_major_stop  = true,
    updated_at     = now()
WHERE id = 'bb2fb601-4e5c-4149-be07-3631f1623791'
  AND route_id = '87217217-1cea-408b-a786-941778bf54ef';

-- ---------------------------------------------------------------------------
-- Step 2. Guard, then drop route 01 stops that are not part of the target list.
--         Fails loudly if any such stop is referenced by real usage, rather
--         than orphaning a learner or losing a booking. Fee rates are excluded
--         from the guard because step 4 recreates them deterministically.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_blocked text;
BEGIN
  SELECT string_agg(format('%s (%s)', s.stop_name, s.id), '; ')
    INTO v_blocked
  FROM tms_route_stop s
  WHERE s.route_id = '87217217-1cea-408b-a786-941778bf54ef'
    AND s.stop_name NOT IN (SELECT stop_name FROM _r01_target)
    AND (
         EXISTS (SELECT 1 FROM tms_booking        b  WHERE b.stop_id           = s.id)
      OR EXISTS (SELECT 1 FROM tms_attendance     a  WHERE a.stop_id           = s.id)
      OR EXISTS (SELECT 1 FROM learners_profiles  l  WHERE l.transport_stop_id = s.id)
      OR EXISTS (SELECT 1 FROM staff              st WHERE st.transport_stop_id = s.id)
    );

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION
      'Aborting: route 01 stop(s) slated for removal are still referenced: %', v_blocked;
  END IF;
END $$;

DELETE FROM tms_route_stop
WHERE route_id = '87217217-1cea-408b-a786-941778bf54ef'
  AND stop_name NOT IN (SELECT stop_name FROM _r01_target);

-- ---------------------------------------------------------------------------
-- Step 3. Upsert the target stops by name. Existing rows keep their UUID.
-- ---------------------------------------------------------------------------
UPDATE tms_route_stop s
SET sequence_order = t.sequence_order,
    stop_time      = t.stop_time,
    evening_time   = t.evening_time,
    is_major_stop  = t.is_major_stop,
    updated_at     = now()
FROM _r01_target t
WHERE s.route_id = '87217217-1cea-408b-a786-941778bf54ef'
  AND s.stop_name = t.stop_name;

INSERT INTO tms_route_stop
  (route_id, stop_name, stop_time, evening_time, sequence_order, is_major_stop)
SELECT '87217217-1cea-408b-a786-941778bf54ef',
       t.stop_name, t.stop_time, t.evening_time, t.sequence_order, t.is_major_stop
FROM _r01_target t
WHERE NOT EXISTS (
  SELECT 1 FROM tms_route_stop s
  WHERE s.route_id = '87217217-1cea-408b-a786-941778bf54ef'
    AND s.stop_name = t.stop_name
);

-- ---------------------------------------------------------------------------
-- Step 4. Price every stop except COLLEGE, in both current-year fee structures.
--         Amounts mirror route 24. DO NOTHING on conflict so an existing fare
--         is never silently overwritten by a re-run.
-- ---------------------------------------------------------------------------
INSERT INTO tms_fee_structure_stop_rate (fee_structure_id, stop_id, annual_amount)
SELECT fs.id, s.id, t.annual_amount
FROM _r01_target t
JOIN tms_route_stop s
  ON s.route_id = '87217217-1cea-408b-a786-941778bf54ef'
 AND s.stop_name = t.stop_name
CROSS JOIN (VALUES
  ('9f8f5153-d45a-4fbf-85f2-c399292c201b'::uuid),  -- 2026-2027 (Arts Aided)
  ('1cff2da9-565b-4618-9c21-68fb66c52aad'::uuid)   -- 2026-2027 (Staff - All Colleges)
) AS fs(id)
WHERE t.annual_amount IS NOT NULL
ON CONFLICT (fee_structure_id, stop_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Step 5. Route 01 header: it now ends at COLLEGE, and is bookable.
-- ---------------------------------------------------------------------------
UPDATE tms_route
SET start_location = 'JALAKANDAPURAM SANTHAPETTAI',
    end_location   = 'COLLEGE',
    departure_time = '07:42',
    arrival_time   = '08:55',
    status         = 'active',
    updated_at     = now()
WHERE id = '87217217-1cea-408b-a786-941778bf54ef';

-- ---------------------------------------------------------------------------
-- Step 6. Spelling correction on route 24: JALAKANDAPIRSM -> JALAKANDAPURAM.
--         Name only; sequence, times and fees are untouched.
-- ---------------------------------------------------------------------------
UPDATE tms_route_stop
SET stop_name  = 'JALAKANDAPURAM MUNIYAPPAN KOVIL',
    updated_at = now()
WHERE route_id = '79f0ff06-b3d4-4373-b27c-debb69502ba4'
  AND stop_name = 'JALAKANDAPIRSM MUNIYAPPAN KOVIL';

DROP TABLE IF EXISTS _r01_target;
