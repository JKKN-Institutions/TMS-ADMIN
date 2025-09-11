-- Transport Enrollment System Database Schema
-- This migration adds support for external API authentication and transport enrollment requests

-- Add new enum types for enrollment system
DO $$ 
BEGIN
    -- Transport request status enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transport_request_status') THEN
        CREATE TYPE transport_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
    END IF;
    
    -- Transport request type enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transport_request_type') THEN
        CREATE TYPE transport_request_type AS ENUM ('new_enrollment', 'route_change', 'stop_change');
    END IF;
    
    -- Authentication source enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_source') THEN
        CREATE TYPE auth_source AS ENUM ('external_api', 'admin_created');
    END IF;
END $$;

-- Add external API and enrollment fields to students table
DO $$ 
BEGIN
    -- External API integration fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'external_student_id') THEN
        ALTER TABLE students ADD COLUMN external_student_id VARCHAR(100);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'external_roll_number') THEN
        ALTER TABLE students ADD COLUMN external_roll_number VARCHAR(100);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'external_data') THEN
        ALTER TABLE students ADD COLUMN external_data JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'auth_source') THEN
        ALTER TABLE students ADD COLUMN auth_source auth_source DEFAULT 'external_api';
    END IF;
    
    -- Transport enrollment status fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'transport_enrolled') THEN
        ALTER TABLE students ADD COLUMN transport_enrolled BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'enrollment_status') THEN
        ALTER TABLE students ADD COLUMN enrollment_status transport_request_status DEFAULT 'pending';
    END IF;
    
    -- Additional contact fields for enrollment
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'parent_mobile') THEN
        ALTER TABLE students ADD COLUMN parent_mobile VARCHAR(20);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'father_name') THEN
        ALTER TABLE students ADD COLUMN father_name VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'mother_name') THEN
        ALTER TABLE students ADD COLUMN mother_name VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'date_of_birth') THEN
        ALTER TABLE students ADD COLUMN date_of_birth DATE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'students' AND column_name = 'gender') THEN
        ALTER TABLE students ADD COLUMN gender VARCHAR(10);
    END IF;
END $$;

-- Create transport enrollment requests table
CREATE TABLE IF NOT EXISTS transport_enrollment_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    preferred_route_id UUID REFERENCES routes(id),
    preferred_stop_id UUID REFERENCES route_stops(id),
    request_status transport_request_status DEFAULT 'pending',
    request_type transport_request_type DEFAULT 'new_enrollment',
    semester_id VARCHAR(20),
    academic_year VARCHAR(20),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES admin_users(id),
    rejection_reason TEXT,
    admin_notes TEXT,
    parent_mobile VARCHAR(20),
    emergency_contact VARCHAR(20),
    special_requirements TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create transport enrollment request activities table for tracking
CREATE TABLE IF NOT EXISTS transport_enrollment_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID REFERENCES transport_enrollment_requests(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL, -- 'created', 'approved', 'rejected', 'modified'
    activity_description TEXT,
    performed_by UUID REFERENCES admin_users(id),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_students_external_student_id ON students(external_student_id);
CREATE INDEX IF NOT EXISTS idx_students_external_roll_number ON students(external_roll_number);
CREATE INDEX IF NOT EXISTS idx_students_transport_enrolled ON students(transport_enrolled);
CREATE INDEX IF NOT EXISTS idx_students_enrollment_status ON students(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_transport_enrollment_requests_status ON transport_enrollment_requests(request_status);
CREATE INDEX IF NOT EXISTS idx_transport_enrollment_requests_student ON transport_enrollment_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_transport_enrollment_requests_route ON transport_enrollment_requests(preferred_route_id);
CREATE INDEX IF NOT EXISTS idx_transport_enrollment_activities_request ON transport_enrollment_activities(request_id);

-- Create triggers for updating timestamps
CREATE OR REPLACE FUNCTION update_transport_enrollment_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_transport_enrollment_requests_updated_at ON transport_enrollment_requests;
CREATE TRIGGER trigger_update_transport_enrollment_requests_updated_at
    BEFORE UPDATE ON transport_enrollment_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_transport_enrollment_request_updated_at();

-- Add RLS policies for transport enrollment requests
ALTER TABLE transport_enrollment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_enrollment_activities ENABLE ROW LEVEL SECURITY;

-- Students can only see their own enrollment requests
CREATE POLICY "Students can view their own enrollment requests"
    ON transport_enrollment_requests FOR SELECT
    USING (student_id = auth.uid()::uuid);

-- Students can create their own enrollment requests
CREATE POLICY "Students can create their own enrollment requests"
    ON transport_enrollment_requests FOR INSERT
    WITH CHECK (student_id = auth.uid()::uuid);

-- Students can update their own pending requests
CREATE POLICY "Students can update their own pending requests"
    ON transport_enrollment_requests FOR UPDATE
    USING (student_id = auth.uid()::uuid AND request_status = 'pending')
    WITH CHECK (student_id = auth.uid()::uuid AND request_status = 'pending');

-- Admin policies for enrollment requests
CREATE POLICY "Admins can view all enrollment requests"
    ON transport_enrollment_requests FOR SELECT
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()::uuid));

CREATE POLICY "Admins can update enrollment requests"
    ON transport_enrollment_requests FOR UPDATE
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()::uuid));

-- Activity policies
CREATE POLICY "Students can view activities for their requests"
    ON transport_enrollment_activities FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM transport_enrollment_requests 
        WHERE id = request_id AND student_id = auth.uid()::uuid
    ));

CREATE POLICY "Admins can view and create activities"
    ON transport_enrollment_activities FOR ALL
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()::uuid));

-- Create function to handle enrollment request approval
CREATE OR REPLACE FUNCTION approve_transport_enrollment_request(
    request_id UUID,
    approver_id UUID,
    route_id UUID,
    stop_id UUID,
    admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    request_record transport_enrollment_requests%ROWTYPE;
    student_record students%ROWTYPE;
    result JSONB;
BEGIN
    -- Get the request
    SELECT * INTO request_record FROM transport_enrollment_requests WHERE id = request_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found');
    END IF;
    
    -- Check if request is still pending
    IF request_record.request_status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request is not pending');
    END IF;
    
    -- Get student record
    SELECT * INTO student_record FROM students WHERE id = request_record.student_id;
    
    -- Update request status
    UPDATE transport_enrollment_requests 
    SET request_status = 'approved',
        approved_at = NOW(),
        approved_by = approver_id,
        admin_notes = admin_notes,
        updated_at = NOW()
    WHERE id = request_id;
    
    -- Update student transport enrollment status
    UPDATE students 
    SET transport_enrolled = true,
        enrollment_status = 'approved',
        updated_at = NOW()
    WHERE id = request_record.student_id;
    
    -- Create or update transport profile
    INSERT INTO student_transport_profiles (student_id, transport_status, created_at, updated_at)
    VALUES (request_record.student_id, 'active', NOW(), NOW())
    ON CONFLICT (student_id) DO UPDATE SET
        transport_status = 'active',
        updated_at = NOW();
    
    -- Create route allocation
    INSERT INTO student_route_allocations (student_id, route_id, boarding_stop_id, allocated_at, is_active)
    VALUES (request_record.student_id, route_id, stop_id, NOW(), true)
    ON CONFLICT (student_id, route_id) DO UPDATE SET
        boarding_stop_id = stop_id,
        allocated_at = NOW(),
        is_active = true;
    
    -- Create activity log
    INSERT INTO transport_enrollment_activities (request_id, activity_type, activity_description, performed_by, metadata)
    VALUES (request_id, 'approved', 'Enrollment request approved', approver_id, 
            jsonb_build_object('route_id', route_id, 'stop_id', stop_id, 'admin_notes', admin_notes));
    
    RETURN jsonb_build_object('success', true, 'message', 'Enrollment request approved successfully');
END;
$$ LANGUAGE plpgsql;

-- Create function to handle enrollment request rejection
CREATE OR REPLACE FUNCTION reject_transport_enrollment_request(
    request_id UUID,
    approver_id UUID,
    rejection_reason TEXT,
    admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    request_record transport_enrollment_requests%ROWTYPE;
    result JSONB;
BEGIN
    -- Get the request
    SELECT * INTO request_record FROM transport_enrollment_requests WHERE id = request_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found');
    END IF;
    
    -- Check if request is still pending
    IF request_record.request_status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request is not pending');
    END IF;
    
    -- Update request status
    UPDATE transport_enrollment_requests 
    SET request_status = 'rejected',
        approved_at = NOW(),
        approved_by = approver_id,
        rejection_reason = rejection_reason,
        admin_notes = admin_notes,
        updated_at = NOW()
    WHERE id = request_id;
    
    -- Update student enrollment status
    UPDATE students 
    SET enrollment_status = 'rejected',
        updated_at = NOW()
    WHERE id = request_record.student_id;
    
    -- Create activity log
    INSERT INTO transport_enrollment_activities (request_id, activity_type, activity_description, performed_by, metadata)
    VALUES (request_id, 'rejected', 'Enrollment request rejected', approver_id, 
            jsonb_build_object('rejection_reason', rejection_reason, 'admin_notes', admin_notes));
    
    RETURN jsonb_build_object('success', true, 'message', 'Enrollment request rejected');
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON transport_enrollment_requests TO authenticated;
GRANT SELECT, INSERT ON transport_enrollment_activities TO authenticated;
GRANT EXECUTE ON FUNCTION approve_transport_enrollment_request TO authenticated;
GRANT EXECUTE ON FUNCTION reject_transport_enrollment_request TO authenticated; 