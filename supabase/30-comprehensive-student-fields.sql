-- Comprehensive Student Fields Migration
-- This migration adds all the missing fields needed for complete student data storage

-- Add comprehensive student fields that are missing from the current schema
DO $$ 
BEGIN
    -- Academic Information Fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'department_name') THEN
        ALTER TABLE students ADD COLUMN department_name VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'institution_name') THEN
        ALTER TABLE students ADD COLUMN institution_name VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'program_name') THEN
        ALTER TABLE students ADD COLUMN program_name VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'degree_name') THEN
        ALTER TABLE students ADD COLUMN degree_name VARCHAR(255);
    END IF;
    
    -- Address Information Fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'address_street') THEN
        ALTER TABLE students ADD COLUMN address_street TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'address_district') THEN
        ALTER TABLE students ADD COLUMN address_district VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'address_state') THEN
        ALTER TABLE students ADD COLUMN address_state VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'address_pin_code') THEN
        ALTER TABLE students ADD COLUMN address_pin_code VARCHAR(10);
    END IF;
    
    -- Profile and Status Fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'is_profile_complete') THEN
        ALTER TABLE students ADD COLUMN is_profile_complete BOOLEAN DEFAULT false;
    END IF;
    
    -- Transport Related Fields (Direct on students table for legacy compatibility)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'allocated_route_id') THEN
        ALTER TABLE students ADD COLUMN allocated_route_id UUID REFERENCES routes(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'boarding_point') THEN
        ALTER TABLE students ADD COLUMN boarding_point VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'transport_status') THEN
        ALTER TABLE students ADD COLUMN transport_status transport_status DEFAULT 'inactive';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'payment_status') THEN
        ALTER TABLE students ADD COLUMN payment_status payment_status DEFAULT 'current';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'total_fines') THEN
        ALTER TABLE students ADD COLUMN total_fines DECIMAL(10,2) DEFAULT 0.00;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'outstanding_amount') THEN
        ALTER TABLE students ADD COLUMN outstanding_amount DECIMAL(10,2) DEFAULT 0.00;
    END IF;
    
    -- External System Fields (these should already exist from enrollment system, but ensuring)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'external_id') THEN
        ALTER TABLE students ADD COLUMN external_id VARCHAR(100);
    END IF;
    
    -- Password and Authentication Fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'first_login_completed') THEN
        ALTER TABLE students ADD COLUMN first_login_completed BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'last_login') THEN
        ALTER TABLE students ADD COLUMN last_login TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Update existing records to have proper defaults
    UPDATE students SET 
        is_profile_complete = COALESCE(is_profile_complete, false),
        transport_status = COALESCE(transport_status, 'inactive'),
        payment_status = COALESCE(payment_status, 'current'),
        total_fines = COALESCE(total_fines, 0.00),
        outstanding_amount = COALESCE(outstanding_amount, 0.00),
        first_login_completed = COALESCE(first_login_completed, false)
    WHERE 
        is_profile_complete IS NULL OR 
        transport_status IS NULL OR 
        payment_status IS NULL OR 
        total_fines IS NULL OR 
        outstanding_amount IS NULL OR
        first_login_completed IS NULL;
        
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_students_department_name ON students(department_name);
CREATE INDEX IF NOT EXISTS idx_students_institution_name ON students(institution_name);
CREATE INDEX IF NOT EXISTS idx_students_allocated_route ON students(allocated_route_id);
CREATE INDEX IF NOT EXISTS idx_students_transport_status ON students(transport_status);
CREATE INDEX IF NOT EXISTS idx_students_payment_status ON students(payment_status);
CREATE INDEX IF NOT EXISTS idx_students_external_id ON students(external_id);

-- Create a function to update comprehensive student data (for use in approval process)
CREATE OR REPLACE FUNCTION update_comprehensive_student_data(
    p_student_id UUID,
    p_external_data JSONB,
    p_external_student_id VARCHAR(100) DEFAULT NULL,
    p_external_roll_number VARCHAR(100) DEFAULT NULL,
    p_department_name VARCHAR(255) DEFAULT NULL,
    p_institution_name VARCHAR(255) DEFAULT NULL,
    p_program_name VARCHAR(255) DEFAULT NULL,
    p_degree_name VARCHAR(255) DEFAULT NULL,
    p_father_name VARCHAR(255) DEFAULT NULL,
    p_mother_name VARCHAR(255) DEFAULT NULL,
    p_parent_mobile VARCHAR(20) DEFAULT NULL,
    p_date_of_birth DATE DEFAULT NULL,
    p_gender VARCHAR(10) DEFAULT NULL,
    p_emergency_contact_name VARCHAR(255) DEFAULT NULL,
    p_emergency_contact_phone VARCHAR(20) DEFAULT NULL,
    p_address_street TEXT DEFAULT NULL,
    p_address_district VARCHAR(255) DEFAULT NULL,
    p_address_state VARCHAR(255) DEFAULT NULL,
    p_address_pin_code VARCHAR(10) DEFAULT NULL,
    p_is_profile_complete BOOLEAN DEFAULT NULL,
    p_auth_source auth_source DEFAULT 'external_api'
)
RETURNS JSONB AS $$
BEGIN
    UPDATE students 
    SET 
        external_student_id = COALESCE(p_external_student_id, external_student_id),
        external_roll_number = COALESCE(p_external_roll_number, external_roll_number),
        external_data = COALESCE(p_external_data, external_data),
        auth_source = COALESCE(p_auth_source, auth_source),
        department_name = COALESCE(p_department_name, department_name),
        institution_name = COALESCE(p_institution_name, institution_name),
        program_name = COALESCE(p_program_name, program_name),
        degree_name = COALESCE(p_degree_name, degree_name),
        father_name = COALESCE(p_father_name, father_name),
        mother_name = COALESCE(p_mother_name, mother_name),
        parent_mobile = COALESCE(p_parent_mobile, parent_mobile),
        date_of_birth = COALESCE(p_date_of_birth, date_of_birth),
        gender = COALESCE(p_gender, gender),
        emergency_contact_name = COALESCE(p_emergency_contact_name, emergency_contact_name),
        emergency_contact_phone = COALESCE(p_emergency_contact_phone, emergency_contact_phone),
        address_street = COALESCE(p_address_street, address_street),
        address_district = COALESCE(p_address_district, address_district),
        address_state = COALESCE(p_address_state, address_state),
        address_pin_code = COALESCE(p_address_pin_code, address_pin_code),
        is_profile_complete = COALESCE(p_is_profile_complete, is_profile_complete),
        updated_at = NOW()
    WHERE id = p_student_id;
    
    RETURN jsonb_build_object('success', true, 'message', 'Student data updated successfully');
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION update_comprehensive_student_data TO authenticated; 