-- Quick Fix: Enable All Future Schedules for Booking
-- This makes existing schedules visible to passengers

-- Step 1: Enable admin scheduling for all future schedules
UPDATE schedules 
SET 
  admin_scheduling_enabled = true,
  booking_enabled = true,
  booking_deadline = (schedule_date - INTERVAL '1 day') + TIME '19:00:00'
WHERE schedule_date >= CURRENT_DATE
  AND (admin_scheduling_enabled IS NULL OR admin_scheduling_enabled = false);

-- Step 2: Create booking availability records for active routes
INSERT INTO booking_availability (
  route_id, 
  availability_date, 
  is_booking_enabled, 
  admin_enabled, 
  cutoff_time, 
  booking_start_time,
  requires_admin_approval
)
SELECT DISTINCT
  s.route_id,
  s.schedule_date,
  true,
  true, -- Admin enabled
  TIME '19:00:00', -- 7 PM cutoff
  TIME '06:00:00', -- 6 AM start
  true
FROM schedules s
JOIN routes r ON s.route_id = r.id
WHERE s.schedule_date >= CURRENT_DATE
  AND r.status = 'active'
ON CONFLICT (route_id, availability_date) 
DO UPDATE SET
  admin_enabled = true,
  is_booking_enabled = true;

-- Step 3: Check results
SELECT 
  'ENABLED SCHEDULES' as status,
  COUNT(*) as total_enabled,
  MIN(schedule_date) as earliest_date,
  MAX(schedule_date) as latest_date
FROM schedules 
WHERE schedule_date >= CURRENT_DATE 
  AND admin_scheduling_enabled = true;

-- Step 4: Show schedules for Route 05 specifically
SELECT 
  s.schedule_date,
  s.departure_time,
  s.admin_scheduling_enabled,
  s.booking_enabled,
  r.route_number,
  r.route_name
FROM schedules s
JOIN routes r ON s.route_id = r.id
WHERE r.route_number = '05'
  AND s.schedule_date >= CURRENT_DATE
ORDER BY s.schedule_date; 