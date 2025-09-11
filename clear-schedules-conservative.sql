-- Conservative Schedule Clearing Script
-- This script removes only schedules and directly related booking data
-- Preserves: Routes, Students, Drivers, Vehicles, and their profiles

-- Step 1: Show current data before deletion
SELECT 
  'BEFORE DELETION' as status,
  (SELECT COUNT(*) FROM bookings) as bookings,
  (SELECT COUNT(*) FROM schedules) as schedules,
  (SELECT COUNT(*) FROM booking_availability) as booking_availability,
  (SELECT COUNT(*) FROM attendance) as attendance;

-- Step 2: Delete in correct order to respect foreign keys

-- Delete attendance records that reference schedules
DELETE FROM attendance WHERE schedule_id IN (SELECT id FROM schedules);

-- Delete all bookings (they reference schedules)
DELETE FROM bookings;

-- Delete booking availability records
DELETE FROM booking_availability;

-- Delete all schedules
DELETE FROM schedules;

-- Step 3: Reset route passenger counts only
UPDATE routes SET current_passengers = 0;

-- Step 4: Show results after deletion
SELECT 
  'AFTER DELETION' as status,
  (SELECT COUNT(*) FROM bookings) as bookings,
  (SELECT COUNT(*) FROM schedules) as schedules,
  (SELECT COUNT(*) FROM booking_availability) as booking_availability,
  (SELECT COUNT(*) FROM attendance) as attendance;

-- Step 5: Show preserved data
SELECT 
  'PRESERVED DATA' as status,
  (SELECT COUNT(*) FROM routes) as routes,
  (SELECT COUNT(*) FROM students) as students,
  (SELECT COUNT(*) FROM drivers) as drivers,
  (SELECT COUNT(*) FROM vehicles) as vehicles,
  (SELECT COUNT(*) FROM student_transport_profiles) as student_profiles;

SELECT 'Schedules cleared successfully! Routes, students, drivers, and vehicles preserved.' as result; 