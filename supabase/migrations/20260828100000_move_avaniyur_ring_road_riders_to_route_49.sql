-- Move route 22 "AVANIYUR RING ROAD" riders to route 49 "BOODINAYAKKAN PATTI",
-- then retire the AVANIYUR RING ROAD stop.
-- Cross-route move: BOTH transport_route_id and transport_stop_id must be written,
-- otherwise the learner points at a stop that is not on their route.
-- The neighbouring stop "AVANIYUR" (seq 22) is deliberately untouched.

BEGIN;

-- 1. Repoint the 12 learners to route 49 / BOODINAYAKKAN PATTI.
UPDATE learners_profiles
SET transport_route_id = '87217217-1cea-408b-a786-941778bf54ef',
    transport_stop_id  = '627bbc30-08dd-493e-a1db-06c0b2777173',
    updated_at = now()
WHERE transport_stop_id = 'cd86953a-bc5e-4464-96ad-97cbd2ad056b';

-- 2. Same for any staff (none at time of writing, guarded for replay).
UPDATE staff
SET transport_route_id = '87217217-1cea-408b-a786-941778bf54ef',
    transport_stop_id  = '627bbc30-08dd-493e-a1db-06c0b2777173',
    updated_at = now()
WHERE transport_stop_id = 'cd86953a-bc5e-4464-96ad-97cbd2ad056b';

-- 3. Repoint FUTURE bookings only; history stays on the old stop for audit.
UPDATE tms_booking
SET route_id = '87217217-1cea-408b-a786-941778bf54ef',
    stop_id  = '627bbc30-08dd-493e-a1db-06c0b2777173'
WHERE stop_id = 'cd86953a-bc5e-4464-96ad-97cbd2ad056b'
  AND travel_date >= current_date;

-- 4. Retire AVANIYUR RING ROAD (never DELETE: past bookings + attendance rows
--    reference it, and tms_booking.stop_id is ON DELETE NO ACTION).
UPDATE tms_route_stop
SET is_active = false,
    sequence_order = 90 + sequence_order,
    updated_at = now()
WHERE id = 'cd86953a-bc5e-4464-96ad-97cbd2ad056b';

COMMIT;
