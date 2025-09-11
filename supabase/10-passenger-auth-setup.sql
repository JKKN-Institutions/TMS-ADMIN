-- Passenger Authentication Setup
-- This migration adds support for student/passenger authentication using DOB for first-time login

-- Add first_login_completed and password reset fields to students table if not exists
DO $$ 
BEGIN
    -- Track if student has completed first login and changed password
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'first_login_completed') THEN
        ALTER TABLE students ADD COLUMN first_login_completed BOOLEAN DEFAULT false;
    END IF;

    -- Track password reset requests
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'password_reset_token') THEN
        ALTER TABLE students ADD COLUMN password_reset_token TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'password_reset_expires') THEN
        ALTER TABLE students ADD COLUMN password_reset_expires TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Track last login
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'last_login') THEN
        ALTER TABLE students ADD COLUMN last_login TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Track login attempts (for security)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'failed_login_attempts') THEN
        ALTER TABLE students ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'account_locked_until') THEN
        ALTER TABLE students ADD COLUMN account_locked_until TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Ensure password_hash field exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'password_hash') THEN
        ALTER TABLE students ADD COLUMN password_hash TEXT;
    END IF;

    -- Ensure date_of_birth field exists (already added in 09-students-transport-columns.sql)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'date_of_birth') THEN
        ALTER TABLE students ADD COLUMN date_of_birth DATE;
    END IF;

    -- Add profile completion tracking
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'profile_completion_percentage') THEN
        ALTER TABLE students ADD COLUMN profile_completion_percentage INTEGER DEFAULT 0;
    END IF;

    -- Add RLS policies for students (they can only access their own data)
    ALTER TABLE students ENABLE ROW LEVEL SECURITY;
    ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE grievances ENABLE ROW LEVEL SECURITY;
    ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;
    ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
    ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);
CREATE INDEX IF NOT EXISTS idx_students_first_login ON students(first_login_completed);
CREATE INDEX IF NOT EXISTS idx_students_last_login ON students(last_login);
CREATE INDEX IF NOT EXISTS idx_students_password_reset_token ON students(password_reset_token);

-- Create a function to calculate profile completion percentage
CREATE OR REPLACE FUNCTION calculate_profile_completion(student_row students)
RETURNS INTEGER AS $$
DECLARE
    completion_score INTEGER := 0;
    total_fields INTEGER := 15; -- Total number of profile fields we consider
BEGIN
    -- Basic required fields (3 points each)
    IF student_row.student_name IS NOT NULL AND student_row.student_name != '' THEN
        completion_score := completion_score + 3;
    END IF;
    
    IF student_row.email IS NOT NULL AND student_row.email != '' THEN
        completion_score := completion_score + 3;
    END IF;
    
    IF student_row.mobile IS NOT NULL AND student_row.mobile != '' THEN
        completion_score := completion_score + 3;
    END IF;
    
    IF student_row.roll_number IS NOT NULL AND student_row.roll_number != '' THEN
        completion_score := completion_score + 3;
    END IF;
    
    IF student_row.date_of_birth IS NOT NULL THEN
        completion_score := completion_score + 3;
    END IF;

    -- Academic fields (2 points each)
    IF student_row.department_id IS NOT NULL THEN
        completion_score := completion_score + 2;
    END IF;
    
    IF student_row.program_id IS NOT NULL THEN
        completion_score := completion_score + 2;
    END IF;
    
    IF student_row.academic_year IS NOT NULL THEN
        completion_score := completion_score + 2;
    END IF;
    
    IF student_row.semester IS NOT NULL THEN
        completion_score := completion_score + 2;
    END IF;

    -- Optional fields (1 point each)
    IF student_row.address IS NOT NULL AND student_row.address != '' THEN
        completion_score := completion_score + 1;
    END IF;
    
    IF student_row.emergency_contact_name IS NOT NULL AND student_row.emergency_contact_name != '' THEN
        completion_score := completion_score + 1;
    END IF;
    
    IF student_row.emergency_contact_phone IS NOT NULL AND student_row.emergency_contact_phone != '' THEN
        completion_score := completion_score + 1;
    END IF;
    
    IF student_row.father_name IS NOT NULL AND student_row.father_name != '' THEN
        completion_score := completion_score + 1;
    END IF;
    
    IF student_row.mother_name IS NOT NULL AND student_row.mother_name != '' THEN
        completion_score := completion_score + 1;
    END IF;
    
    IF student_row.gender IS NOT NULL AND student_row.gender != '' THEN
        completion_score := completion_score + 1;
    END IF;

    -- Calculate percentage (max score is 30)
    RETURN LEAST(100, ROUND((completion_score * 100.0) / 30));
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update profile completion percentage
CREATE OR REPLACE FUNCTION update_profile_completion()
RETURNS TRIGGER AS $$
BEGIN
    NEW.profile_completion_percentage := calculate_profile_completion(NEW);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_profile_completion ON students;
CREATE TRIGGER trigger_update_profile_completion
    BEFORE INSERT OR UPDATE ON students
    FOR EACH ROW
    EXECUTE FUNCTION update_profile_completion();

-- Create view for student authentication
CREATE OR REPLACE VIEW student_auth_view AS
SELECT 
    id,
    student_name,
    email,
    password_hash,
    date_of_birth,
    first_login_completed,
    failed_login_attempts,
    account_locked_until,
    last_login,
    created_at
FROM students
WHERE email IS NOT NULL;

-- Policy for students to read their own data
DROP POLICY IF EXISTS "Students can view own profile" ON students;
CREATE POLICY "Students can view own profile"
    ON students FOR SELECT
    USING (auth.jwt() ->> 'email' = email);

-- Policy for students to update their own data
DROP POLICY IF EXISTS "Students can update own profile" ON students;
CREATE POLICY "Students can update own profile"
    ON students FOR UPDATE
    USING (auth.jwt() ->> 'email' = email);

-- Policy for students to view their bookings
DROP POLICY IF EXISTS "Students can view own bookings" ON bookings;
CREATE POLICY "Students can view own bookings"
    ON bookings FOR SELECT
    USING (student_id IN (
        SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
    ));

-- Policy for students to create their bookings
DROP POLICY IF EXISTS "Students can create own bookings" ON bookings;
CREATE POLICY "Students can create own bookings"
    ON bookings FOR INSERT
    WITH CHECK (student_id IN (
        SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
    ));

-- Policy for students to view their payments
DROP POLICY IF EXISTS "Students can view own payments" ON payments;
CREATE POLICY "Students can view own payments"
    ON payments FOR SELECT
    USING (student_id IN (
        SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
    ));

-- Policy for students to view their grievances
DROP POLICY IF EXISTS "Students can view own grievances" ON grievances;
CREATE POLICY "Students can view own grievances"
    ON grievances FOR SELECT
    USING (student_id IN (
        SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
    ));

-- Policy for students to create grievances
DROP POLICY IF EXISTS "Students can create grievances" ON grievances;
CREATE POLICY "Students can create grievances"
    ON grievances FOR INSERT
    WITH CHECK (student_id IN (
        SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
    ));

-- Allow students to view active routes and their details
DROP POLICY IF EXISTS "Students can view active routes" ON routes;
CREATE POLICY "Students can view active routes" 
    ON routes FOR SELECT 
    USING (status = 'active');

DROP POLICY IF EXISTS "Students can view route stops" ON route_stops;
CREATE POLICY "Students can view route stops" 
    ON route_stops FOR SELECT 
    USING (true);

-- Allow students to view schedules
DROP POLICY IF EXISTS "Students can view schedules" ON schedules;
CREATE POLICY "Students can view schedules" 
    ON schedules FOR SELECT 
    USING (status IN ('scheduled', 'in_progress'));

-- Allow students to view notifications targeted to them
DROP POLICY IF EXISTS "Students can view relevant notifications" ON notifications;
CREATE POLICY "Students can view relevant notifications"
    ON notifications FOR SELECT
    USING (
        is_active = true 
        AND (
            target_audience IN ('all', 'students')
            OR auth.jwt() ->> 'sub' = ANY(specific_users)
        )
    );

-- Comments for documentation
COMMENT ON COLUMN students.first_login_completed IS 'True if student has completed first login and changed password from DOB';
COMMENT ON COLUMN students.failed_login_attempts IS 'Number of consecutive failed login attempts';
COMMENT ON COLUMN students.account_locked_until IS 'Timestamp until which account is locked due to failed attempts';
COMMENT ON COLUMN students.profile_completion_percentage IS 'Percentage of profile fields completed (0-100)';
COMMENT ON VIEW student_auth_view IS 'View for student authentication with only necessary fields';
COMMENT ON FUNCTION calculate_profile_completion IS 'Calculates profile completion percentage based on filled fields'; 