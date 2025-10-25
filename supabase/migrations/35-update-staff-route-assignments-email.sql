-- Migration: Update Staff Route Assignments to Store Email
-- Description: Change from staff_id (UUID) to staff_email (VARCHAR) for flexible assignment
-- Created: 2025-10-25

-- Drop existing constraints and indexes
DROP INDEX IF EXISTS idx_staff_route_assignments_staff_id;
ALTER TABLE staff_route_assignments DROP CONSTRAINT IF EXISTS staff_route_assignments_staff_id_fkey;

-- Add staff_email column
ALTER TABLE staff_route_assignments ADD COLUMN IF NOT EXISTS staff_email VARCHAR(255);

-- Copy existing staff emails to new column (if any data exists)
UPDATE staff_route_assignments
SET staff_email = admin_users.email
FROM admin_users
WHERE staff_route_assignments.staff_id = admin_users.id
AND staff_route_assignments.staff_email IS NULL;

-- Make staff_email NOT NULL after data migration
ALTER TABLE staff_route_assignments ALTER COLUMN staff_email SET NOT NULL;

-- Drop old staff_id column
ALTER TABLE staff_route_assignments DROP COLUMN IF EXISTS staff_id;

-- Create new index on staff_email
CREATE INDEX idx_staff_route_assignments_staff_email ON staff_route_assignments(staff_email);

-- Update unique constraint to use email instead of staff_id
ALTER TABLE staff_route_assignments DROP CONSTRAINT IF EXISTS staff_route_assignments_staff_id_route_id_is_active_key;
-- Note: We'll check duplicates in application logic instead of database constraint
-- This allows the same email to be assigned to the same route multiple times if needed

-- Update comments
COMMENT ON COLUMN staff_route_assignments.staff_email IS 'Email address of the staff member assigned to this route';
COMMENT ON TABLE staff_route_assignments IS 'Stores route assignments for staff members using email addresses (no FK validation)';
