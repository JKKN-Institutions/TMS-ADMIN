-- =====================================================
-- Grievance Progress Tracker Database Setup
-- =====================================================

-- Add missing columns to grievances table for resolution tracking
ALTER TABLE grievances 
ADD COLUMN IF NOT EXISTS resolution_rating INTEGER CHECK (resolution_rating >= 1 AND resolution_rating <= 5);

ALTER TABLE grievances 
ADD COLUMN IF NOT EXISTS resolution_feedback TEXT;

ALTER TABLE grievances 
ADD COLUMN IF NOT EXISTS rated_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_grievances_resolution_rating ON grievances(resolution_rating);
CREATE INDEX IF NOT EXISTS idx_grievances_rated_at ON grievances(rated_at);

-- Ensure grievance_activity_log table exists with proper structure
CREATE TABLE IF NOT EXISTS grievance_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grievance_id UUID NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
    activity_type activity_type NOT NULL,
    visibility activity_visibility NOT NULL DEFAULT 'public',
    actor_type VARCHAR(50) NOT NULL,
    actor_id UUID,
    actor_name VARCHAR(255),
    action_description TEXT NOT NULL,
    action_details JSONB,
    is_milestone BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for grievance_activity_log
CREATE INDEX IF NOT EXISTS idx_grievance_activity_log_grievance_id ON grievance_activity_log(grievance_id);
CREATE INDEX IF NOT EXISTS idx_grievance_activity_log_created_at ON grievance_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_grievance_activity_log_activity_type ON grievance_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_grievance_activity_log_actor_type ON grievance_activity_log(actor_type);
CREATE INDEX IF NOT EXISTS idx_grievance_activity_log_visibility ON grievance_activity_log(visibility);
CREATE INDEX IF NOT EXISTS idx_grievance_activity_log_milestone ON grievance_activity_log(is_milestone);

-- Create comprehensive activity logging function
CREATE OR REPLACE FUNCTION log_grievance_activity(
    p_grievance_id UUID,
    p_activity_type activity_type,
    p_visibility activity_visibility DEFAULT 'public',
    p_actor_type VARCHAR(50) DEFAULT 'system',
    p_actor_id UUID DEFAULT NULL,
    p_actor_name VARCHAR(255) DEFAULT 'System',
    p_action_description TEXT DEFAULT '',
    p_action_details JSONB DEFAULT '{}',
    p_is_milestone BOOLEAN DEFAULT FALSE
) RETURNS UUID AS $$
DECLARE
    v_activity_id UUID;
    v_grievance_exists BOOLEAN;
BEGIN
    -- Check if grievance exists
    SELECT EXISTS(SELECT 1 FROM grievances WHERE id = p_grievance_id) INTO v_grievance_exists;
    
    IF NOT v_grievance_exists THEN
        RAISE EXCEPTION 'Grievance with ID % does not exist', p_grievance_id;
    END IF;
    
    -- Insert activity log
    INSERT INTO grievance_activity_log (
        grievance_id,
        activity_type,
        visibility,
        actor_type,
        actor_id,
        actor_name,
        action_description,
        action_details,
        is_milestone
    ) VALUES (
        p_grievance_id,
        p_activity_type,
        p_visibility,
        p_actor_type,
        p_actor_id,
        p_actor_name,
        p_action_description,
        p_action_details,
        p_is_milestone
    ) RETURNING id INTO v_activity_id;
    
    -- Update grievance updated_at timestamp
    UPDATE grievances 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = p_grievance_id;
    
    RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to get grievance progress timeline
CREATE OR REPLACE FUNCTION get_grievance_progress_timeline(p_grievance_id UUID)
RETURNS TABLE (
    step_name VARCHAR(50),
    step_title VARCHAR(100),
    step_status VARCHAR(20),
    step_timestamp TIMESTAMP WITH TIME ZONE,
    step_description TEXT,
    step_actor VARCHAR(255),
    step_actor_role VARCHAR(100),
    step_details JSONB,
    step_icon VARCHAR(50),
    step_color VARCHAR(20),
    is_resolution BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH grievance_data AS (
        SELECT 
            g.id,
            g.status,
            g.created_at,
            g.updated_at,
            g.resolved_at,
            g.resolution,
            g.assigned_to,
            au.name as admin_name,
            au.role as admin_role
        FROM grievances g
        LEFT JOIN admin_users au ON g.assigned_to = au.id
        WHERE g.id = p_grievance_id
    ),
    timeline_activities AS (
        SELECT 
            gal.activity_type,
            gal.created_at,
            gal.action_description,
            gal.actor_name,
            gal.action_details,
            gal.is_milestone,
            ROW_NUMBER() OVER (ORDER BY gal.created_at) as rn
        FROM grievance_activity_log gal
        WHERE gal.grievance_id = p_grievance_id
        AND gal.visibility IN ('public', 'system')
        ORDER BY gal.created_at
    )
    SELECT 
        CASE 
            WHEN ta.activity_type = 'grievance_created' THEN 'submitted'
            WHEN ta.activity_type IN ('grievance_assigned', 'grievance_reassigned') THEN 'assigned'
            WHEN ta.activity_type = 'grievance_status_changed' AND ta.action_details->>'new_status' = 'in_progress' THEN 'in_progress'
            WHEN ta.activity_type = 'comment_added' THEN 'comment_' || ta.rn::text
            WHEN ta.activity_type = 'grievance_priority_changed' THEN 'priority_' || ta.rn::text
            WHEN ta.activity_type = 'admin_action_taken' THEN 'action_' || ta.rn::text
            WHEN ta.activity_type = 'grievance_resolved' THEN 'resolved'
            WHEN ta.activity_type = 'grievance_closed' THEN 'closed'
            WHEN ta.activity_type = 'resolution_rated' THEN 'rated'
            ELSE 'activity_' || ta.rn::text
        END::VARCHAR(50) as step_name,
        
        CASE 
            WHEN ta.activity_type = 'grievance_created' THEN 'GRIEVANCE SUBMITTED'
            WHEN ta.activity_type IN ('grievance_assigned', 'grievance_reassigned') THEN 'ASSIGNED TO ADMIN'
            WHEN ta.activity_type = 'grievance_status_changed' AND ta.action_details->>'new_status' = 'in_progress' THEN 'IN PROGRESS'
            WHEN ta.activity_type = 'comment_added' THEN 'ADMIN COMMENT'
            WHEN ta.activity_type = 'grievance_priority_changed' THEN 'PRIORITY UPDATED'
            WHEN ta.activity_type = 'admin_action_taken' THEN 'ADMIN ACTION'
            WHEN ta.activity_type = 'grievance_resolved' THEN 'GRIEVANCE RESOLVED'
            WHEN ta.activity_type = 'grievance_closed' THEN 'GRIEVANCE CLOSED'
            WHEN ta.activity_type = 'resolution_rated' THEN 'RESOLUTION RATED'
            ELSE 'ACTIVITY'
        END::VARCHAR(100) as step_title,
        
        'completed'::VARCHAR(20) as step_status,
        ta.created_at as step_timestamp,
        ta.action_description as step_description,
        ta.actor_name::VARCHAR(255) as step_actor,
        COALESCE(ta.action_details->>'admin_role', 'System')::VARCHAR(100) as step_actor_role,
        ta.action_details as step_details,
        
        CASE 
            WHEN ta.activity_type = 'grievance_created' THEN 'file-text'
            WHEN ta.activity_type IN ('grievance_assigned', 'grievance_reassigned') THEN 'user-check'
            WHEN ta.activity_type = 'grievance_status_changed' THEN 'refresh-cw'
            WHEN ta.activity_type = 'comment_added' THEN 'message-square'
            WHEN ta.activity_type = 'grievance_priority_changed' THEN 'flag'
            WHEN ta.activity_type = 'admin_action_taken' THEN 'settings'
            WHEN ta.activity_type = 'grievance_resolved' THEN 'star'
            WHEN ta.activity_type = 'grievance_closed' THEN 'x-circle'
            WHEN ta.activity_type = 'resolution_rated' THEN 'star'
            ELSE 'activity'
        END::VARCHAR(50) as step_icon,
        
        CASE 
            WHEN ta.activity_type = 'grievance_created' THEN 'green'
            WHEN ta.activity_type IN ('grievance_assigned', 'grievance_reassigned') THEN 'blue'
            WHEN ta.activity_type = 'grievance_status_changed' THEN 'orange'
            WHEN ta.activity_type = 'comment_added' THEN 'purple'
            WHEN ta.activity_type = 'grievance_priority_changed' THEN 'yellow'
            WHEN ta.activity_type = 'admin_action_taken' THEN 'blue'
            WHEN ta.activity_type = 'grievance_resolved' THEN 'green'
            WHEN ta.activity_type = 'grievance_closed' THEN 'gray'
            WHEN ta.activity_type = 'resolution_rated' THEN 'green'
            ELSE 'gray'
        END::VARCHAR(20) as step_color,
        
        (ta.activity_type = 'grievance_resolved')::BOOLEAN as is_resolution
        
    FROM timeline_activities ta
    ORDER BY ta.created_at;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic activity logging
CREATE OR REPLACE FUNCTION trigger_log_grievance_activity()
RETURNS TRIGGER AS $$
BEGIN
    -- Log status changes
    IF TG_OP = 'UPDATE' THEN
        -- Status change
        IF OLD.status != NEW.status THEN
            PERFORM log_grievance_activity(
                NEW.id,
                'grievance_status_changed',
                'public',
                'admin',
                NEW.assigned_to,
                'Admin',
                'Status changed from ' || OLD.status || ' to ' || NEW.status,
                jsonb_build_object(
                    'old_status', OLD.status,
                    'new_status', NEW.status,
                    'timestamp', CURRENT_TIMESTAMP
                ),
                CASE WHEN NEW.status IN ('in_progress', 'resolved', 'closed') THEN TRUE ELSE FALSE END
            );
        END IF;
        
        -- Priority change
        IF OLD.priority != NEW.priority THEN
            PERFORM log_grievance_activity(
                NEW.id,
                'grievance_priority_changed',
                'public',
                'admin',
                NEW.assigned_to,
                'Admin',
                'Priority changed from ' || OLD.priority || ' to ' || NEW.priority,
                jsonb_build_object(
                    'old_priority', OLD.priority,
                    'new_priority', NEW.priority,
                    'timestamp', CURRENT_TIMESTAMP
                ),
                FALSE
            );
        END IF;
        
        -- Assignment change
        IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
            PERFORM log_grievance_activity(
                NEW.id,
                CASE WHEN OLD.assigned_to IS NULL THEN 'grievance_assigned' ELSE 'grievance_reassigned' END,
                'public',
                'admin',
                NEW.assigned_to,
                'Admin',
                CASE WHEN OLD.assigned_to IS NULL THEN 'Grievance assigned to admin' ELSE 'Grievance reassigned to different admin' END,
                jsonb_build_object(
                    'old_assigned_to', OLD.assigned_to,
                    'new_assigned_to', NEW.assigned_to,
                    'timestamp', CURRENT_TIMESTAMP
                ),
                TRUE
            );
        END IF;
        
        -- Resolution added
        IF OLD.resolution IS NULL AND NEW.resolution IS NOT NULL THEN
            PERFORM log_grievance_activity(
                NEW.id,
                'grievance_resolved',
                'public',
                'admin',
                NEW.assigned_to,
                'Admin',
                'Resolution provided: ' || LEFT(NEW.resolution, 100) || CASE WHEN LENGTH(NEW.resolution) > 100 THEN '...' ELSE '' END,
                jsonb_build_object(
                    'resolution', NEW.resolution,
                    'resolved_at', NEW.resolved_at,
                    'timestamp', CURRENT_TIMESTAMP
                ),
                TRUE
            );
        END IF;
        
        -- Resolution rating added
        IF OLD.resolution_rating IS NULL AND NEW.resolution_rating IS NOT NULL THEN
            PERFORM log_grievance_activity(
                NEW.id,
                'resolution_rated',
                'system',
                'student',
                NEW.student_id,
                'Student',
                'Resolution rated ' || NEW.resolution_rating || ' out of 5 stars',
                jsonb_build_object(
                    'rating', NEW.resolution_rating,
                    'feedback', NEW.resolution_feedback,
                    'rated_at', NEW.rated_at,
                    'timestamp', CURRENT_TIMESTAMP
                ),
                FALSE
            );
        END IF;
        
    ELSIF TG_OP = 'INSERT' THEN
        -- Initial grievance creation
        PERFORM log_grievance_activity(
            NEW.id,
            'grievance_created',
            'public',
            'student',
            NEW.student_id,
            'Student',
            'Grievance submitted: ' || NEW.subject,
            jsonb_build_object(
                'category', NEW.category,
                'priority', NEW.priority,
                'subject', NEW.subject,
                'created_at', NEW.created_at,
                'timestamp', CURRENT_TIMESTAMP
            ),
            TRUE
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists and create new one
DROP TRIGGER IF EXISTS trigger_grievance_activity_log ON grievances;
CREATE TRIGGER trigger_grievance_activity_log
    AFTER INSERT OR UPDATE ON grievances
    FOR EACH ROW EXECUTE FUNCTION trigger_log_grievance_activity();

-- Create function to get grievance progress metrics
CREATE OR REPLACE FUNCTION get_grievance_progress_metrics(p_grievance_id UUID)
RETURNS TABLE (
    progress_percentage INTEGER,
    total_activities INTEGER,
    admin_actions INTEGER,
    student_actions INTEGER,
    system_actions INTEGER,
    milestones INTEGER,
    time_since_created_hours INTEGER,
    is_overdue BOOLEAN,
    resolution_provided BOOLEAN,
    can_rate BOOLEAN,
    estimated_completion_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    WITH grievance_data AS (
        SELECT 
            g.id,
            g.status,
            g.created_at,
            g.updated_at,
            g.expected_resolution_date,
            g.resolution,
            g.resolution_rating
        FROM grievances g
        WHERE g.id = p_grievance_id
    ),
    activity_stats AS (
        SELECT 
            COUNT(*) as total_activities,
            COUNT(*) FILTER (WHERE actor_type = 'admin') as admin_actions,
            COUNT(*) FILTER (WHERE actor_type = 'student') as student_actions,
            COUNT(*) FILTER (WHERE actor_type = 'system') as system_actions,
            COUNT(*) FILTER (WHERE is_milestone = TRUE) as milestones
        FROM grievance_activity_log
        WHERE grievance_id = p_grievance_id
    )
    SELECT 
        CASE 
            WHEN gd.status = 'closed' THEN 100
            WHEN gd.status = 'resolved' THEN 90
            WHEN gd.status = 'in_progress' THEN 60
            WHEN gd.status = 'open' THEN 20
            ELSE 0
        END::INTEGER,
        
        COALESCE(ast.total_activities, 0)::INTEGER,
        COALESCE(ast.admin_actions, 0)::INTEGER,
        COALESCE(ast.student_actions, 0)::INTEGER,
        COALESCE(ast.system_actions, 0)::INTEGER,
        COALESCE(ast.milestones, 0)::INTEGER,
        
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - gd.created_at)) / 3600::INTEGER,
        
        (gd.expected_resolution_date IS NOT NULL AND 
         gd.expected_resolution_date < CURRENT_TIMESTAMP AND 
         gd.status NOT IN ('resolved', 'closed'))::BOOLEAN,
        
        (gd.resolution IS NOT NULL)::BOOLEAN,
        
        (gd.status = 'resolved' AND gd.resolution_rating IS NULL)::BOOLEAN,
        
        COALESCE(
            gd.expected_resolution_date,
            gd.created_at + INTERVAL '7 days' -- Default 7 days if no expected date
        )
        
    FROM grievance_data gd
    CROSS JOIN activity_stats ast;
END;
$$ LANGUAGE plpgsql;

-- Create view for enhanced grievance tracking
CREATE OR REPLACE VIEW grievance_progress_view AS
SELECT 
    g.id,
    g.student_id,
    g.category,
    g.priority,
    g.subject,
    g.description,
    g.status,
    g.created_at,
    g.updated_at,
    g.resolved_at,
    g.expected_resolution_date,
    g.resolution,
    g.resolution_rating,
    g.resolution_feedback,
    g.rated_at,
    g.assigned_to,
    g.route_id,
    g.driver_name,
    
    -- Admin information
    au.name as admin_name,
    au.role as admin_role,
    au.email as admin_email,
    
    -- Route information
    r.route_name,
    r.route_number,
    r.start_location,
    r.end_location,
    
    -- Progress metrics
    CASE 
        WHEN g.status = 'closed' THEN 100
        WHEN g.status = 'resolved' THEN 90
        WHEN g.status = 'in_progress' THEN 60
        WHEN g.status = 'open' THEN 20
        ELSE 0
    END as progress_percentage,
    
    -- Activity counts
    COALESCE(activity_stats.total_activities, 0) as total_activities,
    COALESCE(activity_stats.admin_actions, 0) as admin_actions,
    COALESCE(activity_stats.milestones, 0) as milestones,
    
    -- Time metrics
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - g.created_at)) / 3600 as hours_since_created,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - g.updated_at)) / 3600 as hours_since_updated,
    
    -- Status flags
    (g.expected_resolution_date IS NOT NULL AND 
     g.expected_resolution_date < CURRENT_TIMESTAMP AND 
     g.status NOT IN ('resolved', 'closed')) as is_overdue,
    
    (g.resolution IS NOT NULL) as has_resolution,
    (g.status = 'resolved' AND g.resolution_rating IS NULL) as can_rate,
    
    -- Latest activity
    latest_activity.created_at as last_activity_date,
    latest_activity.activity_type as last_activity_type,
    latest_activity.action_description as last_activity_description

FROM grievances g
LEFT JOIN admin_users au ON g.assigned_to = au.id
LEFT JOIN routes r ON g.route_id = r.id
LEFT JOIN LATERAL (
    SELECT 
        COUNT(*) as total_activities,
        COUNT(*) FILTER (WHERE actor_type = 'admin') as admin_actions,
        COUNT(*) FILTER (WHERE is_milestone = TRUE) as milestones
    FROM grievance_activity_log gal
    WHERE gal.grievance_id = g.id
) activity_stats ON TRUE
LEFT JOIN LATERAL (
    SELECT 
        gal.created_at,
        gal.activity_type,
        gal.action_description
    FROM grievance_activity_log gal
    WHERE gal.grievance_id = g.id
    ORDER BY gal.created_at DESC
    LIMIT 1
) latest_activity ON TRUE;

-- Grant appropriate permissions
GRANT SELECT, INSERT, UPDATE ON grievance_activity_log TO authenticated;
GRANT EXECUTE ON FUNCTION log_grievance_activity TO authenticated;
GRANT EXECUTE ON FUNCTION get_grievance_progress_timeline TO authenticated;
GRANT EXECUTE ON FUNCTION get_grievance_progress_metrics TO authenticated;
GRANT SELECT ON grievance_progress_view TO authenticated;

-- Create RLS policies for grievance_activity_log
ALTER TABLE grievance_activity_log ENABLE ROW LEVEL SECURITY;

-- Policy for students to view their own grievance activities (public and system only)
CREATE POLICY grievance_activity_student_view ON grievance_activity_log
    FOR SELECT
    TO authenticated
    USING (
        visibility IN ('public', 'system') AND
        EXISTS (
            SELECT 1 FROM grievances g 
            WHERE g.id = grievance_activity_log.grievance_id 
            AND g.student_id = auth.uid()
        )
    );

-- Policy for admins to view all activities of assigned grievances
CREATE POLICY grievance_activity_admin_view ON grievance_activity_log
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM admin_users au 
            WHERE au.id = auth.uid()
        ) AND
        EXISTS (
            SELECT 1 FROM grievances g 
            WHERE g.id = grievance_activity_log.grievance_id 
            AND (g.assigned_to = auth.uid() OR 
                 EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin'))
        )
    );

-- Policy for admins to insert activities
CREATE POLICY grievance_activity_admin_insert ON grievance_activity_log
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM admin_users au 
            WHERE au.id = auth.uid()
        ) AND
        EXISTS (
            SELECT 1 FROM grievances g 
            WHERE g.id = grievance_activity_log.grievance_id 
            AND (g.assigned_to = auth.uid() OR 
                 EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin'))
        )
    );

-- Policy for system to insert activities (via functions)
CREATE POLICY grievance_activity_system_insert ON grievance_activity_log
    FOR INSERT
    TO authenticated
    WITH CHECK (true); -- Functions handle the security

-- Create notification triggers for major milestones
CREATE OR REPLACE FUNCTION trigger_grievance_milestone_notifications()
RETURNS TRIGGER AS $$
BEGIN
    -- Send notification on major milestones
    IF NEW.is_milestone = TRUE THEN
        -- Insert notification for student
        INSERT INTO notifications (
            title,
            message,
            type,
            priority,
            specific_users,
            tags,
            created_at
        ) VALUES (
            'Grievance Update',
            'Your grievance "' || (SELECT subject FROM grievances WHERE id = NEW.grievance_id) || '" has been updated: ' || NEW.action_description,
            'grievance',
            CASE WHEN NEW.activity_type = 'grievance_resolved' THEN 'high' ELSE 'medium' END,
            ARRAY[(SELECT student_id FROM grievances WHERE id = NEW.grievance_id)],
            ARRAY['grievance', 'milestone'],
            CURRENT_TIMESTAMP
        );
        
        -- Notify admins if it's a new grievance
        IF NEW.activity_type = 'grievance_created' THEN
            INSERT INTO notifications (
                title,
                message,
                type,
                priority,
                recipient_roles,
                tags,
                created_at
            ) VALUES (
                'New Grievance Submitted',
                'A new grievance has been submitted: ' || NEW.action_description,
                'grievance',
                'medium',
                ARRAY['super_admin', 'transport_manager'],
                ARRAY['grievance', 'new'],
                CURRENT_TIMESTAMP
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for milestone notifications
DROP TRIGGER IF EXISTS trigger_grievance_milestone_notifications ON grievance_activity_log;
CREATE TRIGGER trigger_grievance_milestone_notifications
    AFTER INSERT ON grievance_activity_log
    FOR EACH ROW
    WHEN (NEW.is_milestone = TRUE)
    EXECUTE FUNCTION trigger_grievance_milestone_notifications();

-- Insert sample activity data for testing (only if grievances exist)
DO $$
BEGIN
    -- This will only run if there are existing grievances
    IF EXISTS (SELECT 1 FROM grievances LIMIT 1) THEN
        -- Force trigger the creation activities for existing grievances without activity logs
        INSERT INTO grievance_activity_log (
            grievance_id,
            activity_type,
            visibility,
            actor_type,
            actor_id,
            actor_name,
            action_description,
            action_details,
            is_milestone,
            created_at
        )
        SELECT 
            g.id,
            'grievance_created',
            'public',
            'student',
            g.student_id,
            'Student',
            'Grievance submitted: ' || g.subject,
            jsonb_build_object(
                'category', g.category,
                'priority', g.priority,
                'subject', g.subject,
                'created_at', g.created_at
            ),
            TRUE,
            g.created_at
        FROM grievances g
        WHERE NOT EXISTS (
            SELECT 1 FROM grievance_activity_log gal 
            WHERE gal.grievance_id = g.id 
            AND gal.activity_type = 'grievance_created'
        );
        
        -- Add assignment activities for assigned grievances
        INSERT INTO grievance_activity_log (
            grievance_id,
            activity_type,
            visibility,
            actor_type,
            actor_id,
            actor_name,
            action_description,
            action_details,
            is_milestone,
            created_at
        )
        SELECT 
            g.id,
            'grievance_assigned',
            'public',
            'admin',
            g.assigned_to,
            COALESCE(au.name, 'Admin'),
            'Grievance assigned to ' || COALESCE(au.name, 'Admin') || ' (' || COALESCE(au.role, 'Admin') || ')',
            jsonb_build_object(
                'admin_id', g.assigned_to,
                'admin_name', au.name,
                'admin_role', au.role,
                'assigned_at', g.created_at + INTERVAL '1 hour'
            ),
            TRUE,
            g.created_at + INTERVAL '1 hour'
        FROM grievances g
        LEFT JOIN admin_users au ON g.assigned_to = au.id
        WHERE g.assigned_to IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM grievance_activity_log gal 
            WHERE gal.grievance_id = g.id 
            AND gal.activity_type = 'grievance_assigned'
        );
    END IF;
END $$;

-- Create summary function for dashboard
CREATE OR REPLACE FUNCTION get_grievance_dashboard_summary()
RETURNS TABLE (
    total_grievances BIGINT,
    open_grievances BIGINT,
    in_progress_grievances BIGINT,
    resolved_grievances BIGINT,
    closed_grievances BIGINT,
    overdue_grievances BIGINT,
    avg_resolution_time_hours NUMERIC,
    avg_resolution_rating NUMERIC,
    total_activities_today BIGINT,
    urgent_grievances BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_grievances,
        COUNT(*) FILTER (WHERE status = 'open')::BIGINT as open_grievances,
        COUNT(*) FILTER (WHERE status = 'in_progress')::BIGINT as in_progress_grievances,
        COUNT(*) FILTER (WHERE status = 'resolved')::BIGINT as resolved_grievances,
        COUNT(*) FILTER (WHERE status = 'closed')::BIGINT as closed_grievances,
        COUNT(*) FILTER (WHERE 
            expected_resolution_date IS NOT NULL AND 
            expected_resolution_date < CURRENT_TIMESTAMP AND 
            status NOT IN ('resolved', 'closed')
        )::BIGINT as overdue_grievances,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_time_hours,
        AVG(resolution_rating::NUMERIC) FILTER (WHERE resolution_rating IS NOT NULL) as avg_resolution_rating,
        (SELECT COUNT(*) FROM grievance_activity_log WHERE DATE(created_at) = CURRENT_DATE)::BIGINT as total_activities_today,
        COUNT(*) FILTER (WHERE priority = 'urgent' AND status NOT IN ('resolved', 'closed'))::BIGINT as urgent_grievances
    FROM grievances;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions for dashboard function
GRANT EXECUTE ON FUNCTION get_grievance_dashboard_summary TO authenticated;

COMMIT; 