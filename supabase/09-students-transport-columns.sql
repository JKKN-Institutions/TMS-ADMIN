-- Add transport-related columns to students table
-- Run this migration in your Supabase SQL editor

-- Add columns if they don't exist
DO $$ 
BEGIN
    -- External API linking
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'external_id') THEN
        ALTER TABLE students ADD COLUMN external_id TEXT;
        CREATE INDEX IF NOT EXISTS idx_students_external_id ON students(external_id);
    END IF;

    -- Transport assignment columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'allocated_route_id') THEN
        ALTER TABLE students ADD COLUMN allocated_route_id UUID REFERENCES routes(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'boarding_point') THEN
        ALTER TABLE students ADD COLUMN boarding_point TEXT;
    END IF;

    -- Status columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'transport_status') THEN
        ALTER TABLE students ADD COLUMN transport_status TEXT DEFAULT 'active' 
                     CHECK (transport_status IN ('active', 'inactive', 'suspended'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'payment_status') THEN
        ALTER TABLE students ADD COLUMN payment_status TEXT DEFAULT 'current' 
                     CHECK (payment_status IN ('current', 'overdue', 'suspended'));
    END IF;

    -- Financial columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'total_fines') THEN
        ALTER TABLE students ADD COLUMN total_fines NUMERIC DEFAULT 0 CHECK (total_fines >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'outstanding_amount') THEN
        ALTER TABLE students ADD COLUMN outstanding_amount NUMERIC DEFAULT 0 CHECK (outstanding_amount >= 0);
    END IF;

    -- Additional student info columns from external API
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'department_name') THEN
        ALTER TABLE students ADD COLUMN department_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'institution_name') THEN
        ALTER TABLE students ADD COLUMN institution_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'program_name') THEN
        ALTER TABLE students ADD COLUMN program_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'degree_name') THEN
        ALTER TABLE students ADD COLUMN degree_name TEXT;
    END IF;

    -- Family info
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'father_name') THEN
        ALTER TABLE students ADD COLUMN father_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'mother_name') THEN
        ALTER TABLE students ADD COLUMN mother_name TEXT;
    END IF;

    -- Personal info
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'date_of_birth') THEN
        ALTER TABLE students ADD COLUMN date_of_birth DATE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'gender') THEN
        ALTER TABLE students ADD COLUMN gender TEXT;
    END IF;

    -- Address info
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'address_street') THEN
        ALTER TABLE students ADD COLUMN address_street TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'address_district') THEN
        ALTER TABLE students ADD COLUMN address_district TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'address_state') THEN
        ALTER TABLE students ADD COLUMN address_state TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'address_pin_code') THEN
        ALTER TABLE students ADD COLUMN address_pin_code TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'is_profile_complete') THEN
        ALTER TABLE students ADD COLUMN is_profile_complete BOOLEAN DEFAULT false;
    END IF;

END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_students_transport_status ON students(transport_status);
CREATE INDEX IF NOT EXISTS idx_students_payment_status ON students(payment_status);
CREATE INDEX IF NOT EXISTS idx_students_allocated_route ON students(allocated_route_id);
CREATE INDEX IF NOT EXISTS idx_students_boarding_point ON students(boarding_point);

-- Add helpful comments
COMMENT ON COLUMN students.external_id IS 'ID from external student management API';
COMMENT ON COLUMN students.allocated_route_id IS 'Route assigned to student for transport';
COMMENT ON COLUMN students.boarding_point IS 'Stop name where student boards the bus';
COMMENT ON COLUMN students.transport_status IS 'Active transport status: active, inactive, suspended';
COMMENT ON COLUMN students.payment_status IS 'Payment status: current, overdue, suspended';
COMMENT ON COLUMN students.total_fines IS 'Total fines accumulated by student';
COMMENT ON COLUMN students.outstanding_amount IS 'Outstanding payment amount';

-- Create a view for easy querying of transport students
CREATE OR REPLACE VIEW students_with_transport AS
SELECT 
    s.*,
    r.route_name,
    r.route_number,
    r.start_location,
    r.end_location,
    r.departure_time,
    r.arrival_time,
    r.fare
FROM students s
LEFT JOIN routes r ON s.allocated_route_id = r.id
WHERE s.allocated_route_id IS NOT NULL;

COMMENT ON VIEW students_with_transport IS 'Students who have been assigned to transport routes';

-- Grant necessary permissions (adjust as needed for your RLS policies)
-- GRANT SELECT, INSERT, UPDATE ON students TO authenticated;
-- GRANT SELECT ON students_with_transport TO authenticated; 