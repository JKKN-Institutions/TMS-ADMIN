-- Fix for Transport Enrollment Functions - Column Ambiguity Issue
-- Run this SQL directly in the Supabase SQL editor

-- Drop and recreate the approve function with fixed parameter names
DROP FUNCTION IF EXISTS approve_transport_enrollment_request(UUID, UUID, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION approve_transport_enrollment_request(
    p_request_id UUID,
    p_approver_id UUID,
    p_route_id UUID,
    p_stop_id UUID,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    request_record transport_enrollment_requests%ROWTYPE;
    student_record students%ROWTYPE;
    result JSONB;
BEGIN
    -- Get the request
    SELECT * INTO request_record FROM transport_enrollment_requests WHERE id = p_request_id;
    
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
        approved_by = p_approver_id,
        admin_notes = p_admin_notes,
        updated_at = NOW()
    WHERE id = p_request_id;
    
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
    VALUES (request_record.student_id, p_route_id, p_stop_id, NOW(), true)
    ON CONFLICT (student_id, route_id) DO UPDATE SET
        boarding_stop_id = p_stop_id,
        allocated_at = NOW(),
        is_active = true;
    
    -- Create activity log
    INSERT INTO transport_enrollment_activities (request_id, activity_type, activity_description, performed_by, metadata)
    VALUES (p_request_id, 'approved', 'Enrollment request approved', p_approver_id, 
            jsonb_build_object('route_id', p_route_id, 'stop_id', p_stop_id, 'admin_notes', p_admin_notes));
    
    RETURN jsonb_build_object('success', true, 'message', 'Enrollment request approved successfully');
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate the reject function with fixed parameter names
DROP FUNCTION IF EXISTS reject_transport_enrollment_request(UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION reject_transport_enrollment_request(
    p_request_id UUID,
    p_approver_id UUID,
    p_rejection_reason TEXT,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    request_record transport_enrollment_requests%ROWTYPE;
    result JSONB;
BEGIN
    -- Get the request
    SELECT * INTO request_record FROM transport_enrollment_requests WHERE id = p_request_id;
    
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
        approved_by = p_approver_id,
        rejection_reason = p_rejection_reason,
        admin_notes = p_admin_notes,
        updated_at = NOW()
    WHERE id = p_request_id;
    
    -- Update student enrollment status
    UPDATE students 
    SET enrollment_status = 'rejected',
        updated_at = NOW()
    WHERE id = request_record.student_id;
    
    -- Create activity log
    INSERT INTO transport_enrollment_activities (request_id, activity_type, activity_description, performed_by, metadata)
    VALUES (p_request_id, 'rejected', 'Enrollment request rejected', p_approver_id, 
            jsonb_build_object('rejection_reason', p_rejection_reason, 'admin_notes', p_admin_notes));
    
    RETURN jsonb_build_object('success', true, 'message', 'Enrollment request rejected');
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION approve_transport_enrollment_request TO authenticated;
GRANT EXECUTE ON FUNCTION reject_transport_enrollment_request TO authenticated; 