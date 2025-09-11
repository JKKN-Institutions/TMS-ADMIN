-- Debug Schedule Availability Query
-- This helps identify why schedules aren't showing on passenger side

-- Step 1: Check if new columns exist (from 7 PM cutoff migration)
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'schedules' 
  AND column_name IN ('booking_enabled', 'admin_scheduling_enabled', 'booking_deadline')
ORDER BY column_name;

-- Step 2: Check if booking_availability table exists
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'booking_availability') 
    THEN 'booking_availability table EXISTS' 
    ELSE 'booking_availability table MISSING - Need to run migration!' 
  END as table_status;

-- Step 3: Check current schedules and their settings
SELECT 
  s.id,
  s.schedule_date,
  s.departure_time,
  s.available_seats,
  s.booked_seats,
  s.status,
  -- Check if new columns exist, if not they'll show as NULL
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'booking_enabled')
    THEN s.booking_enabled::text
    ELSE 'COLUMN_MISSING'
  END as booking_enabled,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'admin_scheduling_enabled')
    THEN s.admin_scheduling_enabled::text
    ELSE 'COLUMN_MISSING'
  END as admin_scheduling_enabled,
  r.route_name,
  r.route_number
FROM schedules s
JOIN routes r ON s.route_id = r.id
WHERE s.schedule_date >= CURRENT_DATE
ORDER BY s.schedule_date, s.departure_time
LIMIT 10;

-- Step 4: Check student route allocation (why passenger might not see schedules)
SELECT 
  st.student_name,
  st.roll_number,
  sra.route_id,
  r.route_name,
  r.route_number,
  sra.is_active as allocation_active
FROM students st
LEFT JOIN student_route_allocations sra ON st.id = sra.student_id
LEFT JOIN routes r ON sra.route_id = r.id
WHERE st.email = 'valarmathi@example.com' -- Replace with actual student email
   OR st.student_name LIKE '%VALARMATHI%'
LIMIT 5;

-- Step 5: Show what the passenger API should be looking for
SELECT 
  'PASSENGER REQUIREMENTS' as check_type,
  'Student must have route allocation' as requirement_1,
  'Schedules must exist for allocated route' as requirement_2,
  'admin_scheduling_enabled must be true (if column exists)' as requirement_3,
  'booking_enabled must be true (if column exists)' as requirement_4,
  'Current time must be within booking window' as requirement_5;

-- Step 6: Check if there are any schedules for Route 05 (from the screenshot)
SELECT 
  s.*,
  'Route 05 Schedules' as note
FROM schedules s
JOIN routes r ON s.route_id = r.id
WHERE r.route_number = '05'
  AND s.schedule_date >= CURRENT_DATE
ORDER BY s.schedule_date; 