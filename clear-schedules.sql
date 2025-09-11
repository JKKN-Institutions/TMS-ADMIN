-- Clear All Scheduling Data
-- This script will remove all scheduling-related data from the database
-- Tables are cleared in the correct order to avoid foreign key constraint errors

-- 1. Clear attendance records (references schedules)
DELETE FROM attendance;

-- 2. Clear payments related to bookings (references bookings)
DELETE FROM payments WHERE booking_id IS NOT NULL;

-- 3. Clear bookings (references schedules)
DELETE FROM bookings;

-- 4. Clear schedules (main scheduling table)
DELETE FROM schedules;

-- 5. Reset route passenger counts
UPDATE routes SET current_passengers = 0;

-- 6. Clear schedule-related notifications (optional)
DELETE FROM notifications WHERE category = 'transport' AND (
    message LIKE '%schedule%' OR 
    message LIKE '%booking%' OR 
    title LIKE '%Schedule%' OR 
    title LIKE '%Booking%'
);

-- Reset auto-increment sequences if needed (PostgreSQL)
-- Note: This is optional and only needed if you want to reset ID sequences
-- ALTER SEQUENCE schedules_id_seq RESTART WITH 1;
-- ALTER SEQUENCE bookings_id_seq RESTART WITH 1;
-- ALTER SEQUENCE attendance_id_seq RESTART WITH 1;

-- Summary of cleared data
SELECT 
    'Schedules' as table_name, 
    COUNT(*) as remaining_records 
FROM schedules
UNION ALL
SELECT 
    'Bookings' as table_name, 
    COUNT(*) as remaining_records 
FROM bookings
UNION ALL
SELECT 
    'Attendance' as table_name, 
    COUNT(*) as remaining_records 
FROM attendance
UNION ALL
SELECT 
    'Payments (booking-related)' as table_name, 
    COUNT(*) as remaining_records 
FROM payments 
WHERE booking_id IS NOT NULL;

-- Display completion message
SELECT 'All scheduling data has been cleared successfully!' as status; 