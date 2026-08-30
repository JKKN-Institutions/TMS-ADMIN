-- Route 49 "JALAKANDAPURAM" re-route from the 2026-08-28 sheet (7 boarding stops + COLLEGE).
-- Survivors UPDATEd in place to preserve bookings / attendance / fee + fine rates / riders.
-- Dropped stops retired (is_active=false, sequence_order 90+), never DELETEd:
-- tms_booking.stop_id is ON DELETE NO ACTION and the rider FKs are ON DELETE SET NULL.
-- COLLEGE is retained as the terminus; the sheet lists boarding stops only.

BEGIN;

-- 1. Retire the 6 stops absent from the new sheet (BEFORE renumbering).
UPDATE tms_route_stop SET is_active = false, sequence_order = 90 + sequence_order, updated_at = now()
WHERE route_id = '87217217-1cea-408b-a786-941778bf54ef'
  AND stop_name IN (
    'JALAKANDAPURAM MUNIYAPPAN KOVIL', -- 0 riders
    'KATTINAYAKKAN PATTI',             -- 8 learners, 65 bookings -> reassign
    'IRUPPALI MOOLAKARAI',             -- 5 learners             -> reassign
    'VELAMMA VALASU',                  -- 3 learners             -> reassign
    'KALLUKADAI',                      -- 1 staff                -> reassign
    'KUPPANOOR'                        -- 3 learners + 1 staff   -> reassign
  );

-- 2. Rename / retime / renumber the 4 survivors (incl. the COLLEGE terminus).
UPDATE tms_route_stop AS s
SET stop_name      = v.stop_name,
    stop_time      = v.stop_time::time,
    evening_time   = v.evening_time::time,
    sequence_order = v.seq,
    is_active      = true,
    updated_at     = now()
FROM (VALUES
  ('JALAKANDAPURAM SANTHAPETTAI','SANTHAPETTAI',                   '07:50','18:05',2),
  ('KATTINAYAKKAN PATTI EARIE',  'KATTINAYAKKAN PATTI (EARIKARAI)','07:55','18:00',3),
  ('COLLOUR PATTI',              'COLOR PATTI',                    '08:05','17:45',5),
  ('COLLEGE',                    'COLLEGE',                        '08:55','16:45',8)
) AS v(old_name, stop_name, stop_time, evening_time, seq)
WHERE s.route_id = '87217217-1cea-408b-a786-941778bf54ef'
  AND s.stop_name = v.old_name;

-- 3. Insert the 4 new stops. All start UNPRICED in
--    tms_fee_structure_stop_rate and tms_fine_stop_rate.
INSERT INTO tms_route_stop (id, route_id, stop_name, stop_time, evening_time, sequence_order, is_major_stop, is_active)
SELECT gen_random_uuid(),'87217217-1cea-408b-a786-941778bf54ef', v.stop_name, v.stop_time::time, v.evening_time::time, v.seq, false, true
FROM (VALUES
  ('NACHIYAR',            '07:45','18:10',1),
  ('AALAMARAM',           '08:00','17:50',4),
  ('VETERINARY HOSPITAL', '08:10','17:40',6),
  ('BOODINAYAKKAN PATTI', '08:20','17:30',7)
) AS v(stop_name, stop_time, evening_time, seq)
WHERE NOT EXISTS (
  SELECT 1 FROM tms_route_stop x
  WHERE x.route_id = '87217217-1cea-408b-a786-941778bf54ef' AND x.stop_name = v.stop_name
);

-- 4. Route header: first boarding stop is now 07:45 (was 07:42).
UPDATE tms_route SET departure_time = '07:45', arrival_time = '08:55', updated_at = now()
WHERE id = '87217217-1cea-408b-a786-941778bf54ef';

COMMIT;
