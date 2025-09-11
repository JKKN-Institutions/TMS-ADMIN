-- Clear All Schedules Script
-- This script safely removes all schedule data and related records
-- WARNING: This will permanently delete all scheduling data!

-- Step 1: Show current counts before deletion
SELECT 
  (SELECT COUNT(*) FROM bookings) as total_bookings,
  (SELECT COUNT(*) FROM schedules) as total_schedules,
  (SELECT COUNT(*) FROM booking_availability) as total_booking_availability;

-- Step 2: Delete dependent records first (to avoid foreign key violations)

-- Delete all attendance records (references schedules)
DELETE FROM attendance WHERE schedule_id IS NOT NULL;

-- Delete all bookings (references schedules)
DELETE FROM bookings;

-- Delete all booking availability records
DELETE FROM booking_availability;

-- Step 3: Delete all schedules
DELETE FROM schedules;

-- Step 4: Reset any sequence counters (optional)
-- This ensures IDs start fresh if needed
-- Note: Supabase uses UUIDs by default, so this may not be necessary

-- Step 5: Update route passenger counts to zero
UPDATE routes SET current_passengers = 0;

-- Step 6: Reset student transport status if needed
UPDATE student_transport_profiles SET 
  transport_status = 'inactive',
  outstanding_amount = 0.00;

-- Step 7: Show final counts after deletion
SELECT 
  (SELECT COUNT(*) FROM bookings) as remaining_bookings,
  (SELECT COUNT(*) FROM schedules) as remaining_schedules,
  (SELECT COUNT(*) FROM booking_availability) as remaining_booking_availability,
  (SELECT COUNT(*) FROM attendance) as remaining_attendance;

-- Step 8: Optional - Reset any cached schedule data in system_settings
DELETE FROM system_settings WHERE setting_key LIKE '%schedule%' OR setting_key LIKE '%booking%';

-- Success message
SELECT 'All schedules and related data have been successfully cleared!' as result; 