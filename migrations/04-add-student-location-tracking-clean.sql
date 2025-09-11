-- Migration: Add Student Location Tracking (Clean Version)
-- Description: Adds location tracking columns to the students table for live location sharing

-- Add location tracking columns to students table
DO $$ 
BEGIN
    -- Add current location coordinates
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'current_latitude') THEN
        ALTER TABLE students ADD COLUMN current_latitude DECIMAL(10,8);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'current_longitude') THEN
        ALTER TABLE students ADD COLUMN current_longitude DECIMAL(11,8);
    END IF;

    -- Add location tracking metadata
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'location_accuracy') THEN
        ALTER TABLE students ADD COLUMN location_accuracy INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'location_timestamp') THEN
        ALTER TABLE students ADD COLUMN location_timestamp TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'location_enabled') THEN
        ALTER TABLE students ADD COLUMN location_enabled BOOLEAN DEFAULT false;
    END IF;

    -- Add location sharing settings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'location_sharing_enabled') THEN
        ALTER TABLE students ADD COLUMN location_sharing_enabled BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'last_location_update') THEN
        ALTER TABLE students ADD COLUMN last_location_update TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Add indexes for location queries
CREATE INDEX IF NOT EXISTS idx_students_location_enabled ON students(location_enabled) WHERE location_enabled = true;
CREATE INDEX IF NOT EXISTS idx_students_location_sharing ON students(location_sharing_enabled) WHERE location_sharing_enabled = true;
CREATE INDEX IF NOT EXISTS idx_students_location_timestamp ON students(location_timestamp) WHERE location_timestamp IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN students.current_latitude IS 'Current latitude coordinate of the student';
COMMENT ON COLUMN students.current_longitude IS 'Current longitude coordinate of the student';
COMMENT ON COLUMN students.location_accuracy IS 'GPS accuracy in meters';
COMMENT ON COLUMN students.location_timestamp IS 'Timestamp when location was recorded';
COMMENT ON COLUMN students.location_enabled IS 'Whether live location tracking is enabled';
COMMENT ON COLUMN students.location_sharing_enabled IS 'Whether location sharing is enabled';
COMMENT ON COLUMN students.last_location_update IS 'Timestamp of last location update to server';

-- Create a function to update location with validation
CREATE OR REPLACE FUNCTION update_student_location(
    p_student_id UUID,
    p_latitude DECIMAL(10,8),
    p_longitude DECIMAL(11,8),
    p_accuracy INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate coordinates
    IF p_latitude < -90 OR p_latitude > 90 THEN
        RAISE EXCEPTION 'Invalid latitude value: %', p_latitude;
    END IF;
    
    IF p_longitude < -180 OR p_longitude > 180 THEN
        RAISE EXCEPTION 'Invalid longitude value: %', p_longitude;
    END IF;
    
    -- Update student location
    UPDATE students 
    SET 
        current_latitude = p_latitude,
        current_longitude = p_longitude,
        location_accuracy = p_accuracy,
        location_timestamp = NOW(),
        last_location_update = NOW()
    WHERE id = p_student_id 
    AND location_sharing_enabled = true;
    
    RETURN FOUND;
END;
$$;

-- Create a function to get students with recent location updates
CREATE OR REPLACE FUNCTION get_students_with_location(
    p_minutes_ago INTEGER DEFAULT 30
)
RETURNS TABLE(
    student_id UUID,
    student_name TEXT,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    accuracy INTEGER,
    last_update TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.student_name,
        s.current_latitude,
        s.current_longitude,
        s.location_accuracy,
        s.last_location_update
    FROM students s
    WHERE s.location_sharing_enabled = true
    AND s.location_enabled = true
    AND s.last_location_update IS NOT NULL
    AND s.last_location_update > NOW() - INTERVAL '1 minute' * p_minutes_ago
    ORDER BY s.last_location_update DESC;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION update_student_location(UUID, DECIMAL, DECIMAL, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_students_with_location(INTEGER) TO authenticated;

-- Create a view for location data (for admin access)
CREATE OR REPLACE VIEW student_locations AS
SELECT 
    s.id,
    s.external_id,
    s.student_name,
    s.current_latitude,
    s.current_longitude,
    s.location_accuracy,
    s.location_timestamp,
    s.last_location_update,
    s.location_enabled,
    s.location_sharing_enabled,
    s.allocated_route_id,
    s.boarding_point,
    s.transport_status,
    s.payment_status,
    s.transport_enrolled,
    s.enrollment_status
FROM students s
WHERE s.location_sharing_enabled = true;

-- Grant access to the view
GRANT SELECT ON student_locations TO authenticated;

-- Add RLS policies for location data (with proper error handling)
DO $$
BEGIN
    -- Policy for students to update their own location
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'students' 
        AND policyname = 'Students can update their own location'
    ) THEN
        CREATE POLICY "Students can update their own location" ON students
            FOR UPDATE USING (auth.uid()::text = external_id)
            WITH CHECK (auth.uid()::text = external_id);
    END IF;

    -- Policy for admins to view location data
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'students' 
        AND policyname = 'Admins can view student locations'
    ) THEN
        CREATE POLICY "Admins can view student locations" ON students
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM admin_users au 
                    WHERE au.id = auth.uid() 
                    AND au.role IN ('super_admin', 'operations_admin', 'data_entry')
                )
            );
    END IF;

    -- Policy for students to view their own location settings
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'students' 
        AND policyname = 'Students can view their own location settings'
    ) THEN
        CREATE POLICY "Students can view their own location settings" ON students
            FOR SELECT USING (auth.uid()::text = external_id);
    END IF;
END $$; 