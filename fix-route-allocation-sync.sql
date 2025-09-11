-- Fix Route Allocation Data Synchronization
-- This script syncs data between legacy (students table) and new (student_route_allocations table) systems

-- First, let's check the current state of Valarmathi's data
SELECT 
    s.student_name,
    s.roll_number,
    s.allocated_route_id as legacy_route_id,
    s.boarding_point as legacy_boarding_point,
    sra.route_id as new_route_id,
    sra.is_active as new_allocation_active,
    r1.route_number as legacy_route_number,
    r2.route_number as new_route_number
FROM students s
LEFT JOIN student_route_allocations sra ON s.id = sra.student_id AND sra.is_active = true
LEFT JOIN routes r1 ON s.allocated_route_id = r1.id
LEFT JOIN routes r2 ON sra.route_id = r2.id
WHERE s.student_name LIKE '%valarmathi%' OR s.student_name LIKE '%Valarmathi%' OR s.student_name LIKE '%VALARMATHI%';

-- Step 1: Find all students with route assignments in legacy system but not in new system
SELECT 
    s.id as student_id,
    s.student_name,
    s.roll_number,
    s.allocated_route_id,
    s.boarding_point,
    r.route_number,
    r.route_name
FROM students s
JOIN routes r ON s.allocated_route_id = r.id
LEFT JOIN student_route_allocations sra ON s.id = sra.student_id AND sra.is_active = true
WHERE s.allocated_route_id IS NOT NULL
  AND sra.student_id IS NULL;

-- Step 2: Sync data from legacy to new system
-- First, deactivate any existing allocations that might conflict
UPDATE student_route_allocations 
SET is_active = false, 
    updated_at = NOW()
WHERE student_id IN (
    SELECT s.id 
    FROM students s 
    WHERE s.allocated_route_id IS NOT NULL
);

-- Step 3: Insert new allocations based on legacy data
-- (Using MERGE or INSERT with WHERE NOT EXISTS for better compatibility)
INSERT INTO student_route_allocations (student_id, route_id, is_active, boarding_stop_id, allocated_at)
SELECT 
    s.id as student_id,
    s.allocated_route_id as route_id,
    true as is_active,
    rs.id as boarding_stop_id,
    NOW() as allocated_at
FROM students s
JOIN routes r ON s.allocated_route_id = r.id
LEFT JOIN route_stops rs ON r.id = rs.route_id AND rs.stop_name = s.boarding_point
WHERE s.allocated_route_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM student_route_allocations sra 
    WHERE sra.student_id = s.id AND sra.route_id = s.allocated_route_id
  );

-- Step 4: Verify the sync worked
SELECT 
    s.student_name,
    s.roll_number,
    s.allocated_route_id as legacy_route_id,
    s.boarding_point as legacy_boarding_point,
    sra.route_id as new_route_id,
    sra.is_active as new_allocation_active,
    r1.route_number as legacy_route_number,
    r2.route_number as new_route_number,
    CASE 
        WHEN s.allocated_route_id = sra.route_id THEN 'SYNCED'
        ELSE 'MISMATCH'
    END as sync_status
FROM students s
LEFT JOIN student_route_allocations sra ON s.id = sra.student_id AND sra.is_active = true
LEFT JOIN routes r1 ON s.allocated_route_id = r1.id
LEFT JOIN routes r2 ON sra.route_id = r2.id
WHERE s.allocated_route_id IS NOT NULL
ORDER BY s.student_name;

-- Step 5: Check Valarmathi's data specifically
SELECT 
    s.student_name,
    s.roll_number,
    s.allocated_route_id as legacy_route_id,
    s.boarding_point as legacy_boarding_point,
    sra.route_id as new_route_id,
    sra.is_active as new_allocation_active,
    r1.route_number as legacy_route_number,
    r2.route_number as new_route_number,
    rs.stop_name as boarding_stop_name
FROM students s
LEFT JOIN student_route_allocations sra ON s.id = sra.student_id AND sra.is_active = true
LEFT JOIN routes r1 ON s.allocated_route_id = r1.id
LEFT JOIN routes r2 ON sra.route_id = r2.id
LEFT JOIN route_stops rs ON sra.boarding_stop_id = rs.id
WHERE s.student_name LIKE '%valarmathi%' OR s.student_name LIKE '%Valarmathi%' OR s.student_name LIKE '%VALARMATHI%';

-- Step 6: Create a view to always show synchronized data
-- Drop and recreate for better compatibility
DROP VIEW IF EXISTS students_with_current_allocation;
GO

CREATE VIEW students_with_current_allocation AS
SELECT 
    s.*,
    COALESCE(sra.route_id, s.allocated_route_id) as current_route_id,
    COALESCE(rs.stop_name, s.boarding_point) as current_boarding_point,
    r.route_number,
    r.route_name,
    r.departure_time,
    r.arrival_time,
    r.fare,
    sra.is_active as allocation_active,
    sra.allocated_at
FROM students s
LEFT JOIN student_route_allocations sra ON s.id = sra.student_id AND sra.is_active = true
LEFT JOIN route_stops rs ON sra.boarding_stop_id = rs.id
LEFT JOIN routes r ON COALESCE(sra.route_id, s.allocated_route_id) = r.id;

-- Grant permissions for the view
GRANT SELECT ON students_with_current_allocation TO authenticated;

-- View shows students with their current route allocation, preferring new system over legacy 