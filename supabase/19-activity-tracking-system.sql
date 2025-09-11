-- Activity Tracking System for Admin Actions
-- This system tracks all admin actions on grievances and makes them visible to passengers

-- Activity types enum
CREATE TYPE activity_type AS ENUM (
  'grievance_created',
  'grievance_assigned',
  'grievance_status_changed',
  'grievance_priority_changed',
  'grievance_commented',
  'grievance_resolved',
  'grievance_escalated',
  'grievance_closed',
  'grievance_reopened',
  'attachment_added',
  'internal_note_added',
  'follow_up_scheduled',
  'sla_breached',
  'satisfaction_rating_received'
);

-- Activity visibility enum
CREATE TYPE activity_visibility AS ENUM (
  'public',      -- Visible to student
  'internal',    -- Only visible to admin
  'system'       -- System generated, visible to both
);

-- Grievance Activity Log table
CREATE TABLE grievance_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grievance_id UUID REFERENCES grievances(id) ON DELETE CASCADE,
  activity_type activity_type NOT NULL,
  visibility activity_visibility DEFAULT 'public',
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('admin', 'student', 'system')),
  actor_id UUID,
  actor_name VARCHAR(255),
  action_description TEXT NOT NULL,
  action_details JSONB,
  old_values JSONB,
  new_values JSONB,
  is_milestone BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin Activity Summary table for performance
CREATE TABLE admin_activity_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_actions INTEGER DEFAULT 0,
  grievances_assigned INTEGER DEFAULT 0,
  grievances_resolved INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  avg_response_time INTERVAL,
  activity_breakdown JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(admin_id, date)
);

-- Create indexes for better performance
CREATE INDEX idx_grievance_activity_log_grievance ON grievance_activity_log(grievance_id);
CREATE INDEX idx_grievance_activity_log_actor ON grievance_activity_log(actor_type, actor_id);
CREATE INDEX idx_grievance_activity_log_type ON grievance_activity_log(activity_type);
CREATE INDEX idx_grievance_activity_log_visibility ON grievance_activity_log(visibility);
CREATE INDEX idx_grievance_activity_log_created ON grievance_activity_log(created_at);
CREATE INDEX idx_admin_activity_summary_admin ON admin_activity_summary(admin_id);
CREATE INDEX idx_admin_activity_summary_date ON admin_activity_summary(date);

-- Function to log grievance activities
CREATE OR REPLACE FUNCTION log_grievance_activity(
  p_grievance_id UUID,
  p_activity_type activity_type,
  p_visibility activity_visibility,
  p_actor_type VARCHAR(20),
  p_actor_id UUID,
  p_actor_name VARCHAR(255),
  p_action_description TEXT,
  p_action_details JSONB DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_is_milestone BOOLEAN DEFAULT false
)
RETURNS UUID AS $$
DECLARE
  activity_id UUID;
BEGIN
  INSERT INTO grievance_activity_log (
    grievance_id,
    activity_type,
    visibility,
    actor_type,
    actor_id,
    actor_name,
    action_description,
    action_details,
    old_values,
    new_values,
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
    p_old_values,
    p_new_values,
    p_is_milestone
  ) RETURNING id INTO activity_id;

  -- Update admin activity summary
  IF p_actor_type = 'admin' AND p_actor_id IS NOT NULL THEN
    INSERT INTO admin_activity_summary (admin_id, date, total_actions)
    VALUES (p_actor_id, CURRENT_DATE, 1)
    ON CONFLICT (admin_id, date) DO UPDATE SET
      total_actions = admin_activity_summary.total_actions + 1;
  END IF;

  RETURN activity_id;
END;
$$ LANGUAGE plpgsql;

-- Enhanced trigger for grievance status changes
CREATE OR REPLACE FUNCTION enhanced_grievance_status_trigger()
RETURNS TRIGGER AS $$
DECLARE
  admin_name VARCHAR(255);
  action_desc TEXT;
BEGIN
  -- Get admin name if available
  IF NEW.assigned_to IS NOT NULL THEN
    SELECT name INTO admin_name FROM admin_users WHERE id = NEW.assigned_to;
  END IF;

  -- Log status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    action_desc := 'Status changed from ' || OLD.status || ' to ' || NEW.status;
    
    PERFORM log_grievance_activity(
      NEW.id,
      'grievance_status_changed',
      'public',
      'admin',
      NEW.assigned_to,
      COALESCE(admin_name, 'System'),
      action_desc,
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status),
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      CASE WHEN NEW.status IN ('resolved', 'closed') THEN true ELSE false END
    );
  END IF;

  -- Log assignment changes
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    IF NEW.assigned_to IS NOT NULL THEN
      action_desc := 'Grievance assigned to ' || COALESCE(admin_name, 'Unknown Admin');
      
      PERFORM log_grievance_activity(
        NEW.id,
        'grievance_assigned',
        'public',
        'admin',
        NEW.assigned_to,
        COALESCE(admin_name, 'System'),
        action_desc,
        jsonb_build_object('assigned_to', NEW.assigned_to),
        jsonb_build_object('assigned_to', OLD.assigned_to),
        jsonb_build_object('assigned_to', NEW.assigned_to),
        true
      );
    END IF;
  END IF;

  -- Log priority changes
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    action_desc := 'Priority changed from ' || OLD.priority || ' to ' || NEW.priority;
    
    PERFORM log_grievance_activity(
      NEW.id,
      'grievance_priority_changed',
      'public',
      'admin',
      NEW.assigned_to,
      COALESCE(admin_name, 'System'),
      action_desc,
      jsonb_build_object('old_priority', OLD.priority, 'new_priority', NEW.priority),
      jsonb_build_object('priority', OLD.priority),
      jsonb_build_object('priority', NEW.priority),
      false
    );
  END IF;

  -- Log resolution
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    action_desc := 'Grievance resolved' || 
                  CASE WHEN NEW.resolution IS NOT NULL THEN ': ' || substring(NEW.resolution, 1, 100) || '...' ELSE '' END;
    
    PERFORM log_grievance_activity(
      NEW.id,
      'grievance_resolved',
      'public',
      'admin',
      NEW.assigned_to,
      COALESCE(admin_name, 'System'),
      action_desc,
      jsonb_build_object('resolution', NEW.resolution),
      NULL,
      jsonb_build_object('status', NEW.status, 'resolution', NEW.resolution),
      true
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace the existing trigger
DROP TRIGGER IF EXISTS grievance_status_history_trigger ON grievances;
CREATE TRIGGER enhanced_grievance_status_trigger
  AFTER UPDATE ON grievances
  FOR EACH ROW
  EXECUTE FUNCTION enhanced_grievance_status_trigger();

-- Enhanced trigger for grievance communications
CREATE OR REPLACE FUNCTION log_grievance_communication()
RETURNS TRIGGER AS $$
DECLARE
  actor_name VARCHAR(255);
  action_desc TEXT;
  visibility_type activity_visibility;
BEGIN
  -- Get actor name
  IF NEW.sender_type = 'admin' THEN
    SELECT name INTO actor_name FROM admin_users WHERE id = NEW.sender_id;
  ELSE
    SELECT student_name INTO actor_name FROM students WHERE id = NEW.sender_id;
  END IF;

  -- Determine visibility
  visibility_type := CASE 
    WHEN NEW.is_internal THEN 'internal'
    ELSE 'public'
  END;

  -- Create action description
  action_desc := CASE 
    WHEN NEW.is_internal THEN 'Added internal note'
    WHEN NEW.sender_type = 'admin' THEN 'Admin replied to grievance'
    ELSE 'Student added comment'
  END;

  -- Log the communication
  PERFORM log_grievance_activity(
    NEW.grievance_id,
    'grievance_commented',
    visibility_type,
    NEW.sender_type,
    NEW.sender_id,
    COALESCE(actor_name, 'Unknown User'),
    action_desc,
    jsonb_build_object(
      'message_preview', substring(NEW.message, 1, 100),
      'communication_type', NEW.communication_type,
      'is_internal', NEW.is_internal
    ),
    NULL,
    NULL,
    false
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_grievance_communication_trigger
  AFTER INSERT ON grievance_communications
  FOR EACH ROW
  EXECUTE FUNCTION log_grievance_communication();

-- Function to get grievance activity timeline for students
CREATE OR REPLACE FUNCTION get_grievance_activity_timeline(p_grievance_id UUID)
RETURNS TABLE (
  id UUID,
  activity_type activity_type,
  actor_name VARCHAR(255),
  action_description TEXT,
  action_details JSONB,
  is_milestone BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    gal.id,
    gal.activity_type,
    gal.actor_name,
    gal.action_description,
    gal.action_details,
    gal.is_milestone,
    gal.created_at
  FROM grievance_activity_log gal
  WHERE gal.grievance_id = p_grievance_id
    AND gal.visibility IN ('public', 'system')
  ORDER BY gal.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get admin activity summary
CREATE OR REPLACE FUNCTION get_admin_activity_summary(p_admin_id UUID, p_date_from DATE, p_date_to DATE)
RETURNS TABLE (
  admin_id UUID,
  admin_name VARCHAR(255),
  total_actions INTEGER,
  grievances_assigned INTEGER,
  grievances_resolved INTEGER,
  messages_sent INTEGER,
  avg_response_time INTERVAL,
  activity_breakdown JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id,
    au.name,
    COALESCE(SUM(aas.total_actions), 0)::INTEGER,
    COALESCE(SUM(aas.grievances_assigned), 0)::INTEGER,
    COALESCE(SUM(aas.grievances_resolved), 0)::INTEGER,
    COALESCE(SUM(aas.messages_sent), 0)::INTEGER,
    AVG(aas.avg_response_time),
    jsonb_object_agg(aas.date, aas.activity_breakdown)
  FROM admin_users au
  LEFT JOIN admin_activity_summary aas ON au.id = aas.admin_id 
    AND aas.date BETWEEN p_date_from AND p_date_to
  WHERE au.id = p_admin_id
  GROUP BY au.id, au.name;
END;
$$ LANGUAGE plpgsql;

-- Insert initial activity logs for existing grievances
INSERT INTO grievance_activity_log (
  grievance_id,
  activity_type,
  visibility,
  actor_type,
  actor_id,
  actor_name,
  action_description,
  is_milestone,
  created_at
)
SELECT 
  g.id,
  'grievance_created',
  'system',
  'student',
  g.student_id,
  s.student_name,
  'Grievance submitted: ' || g.subject,
  true,
  g.created_at
FROM grievances g
JOIN students s ON g.student_id = s.id
WHERE NOT EXISTS (
  SELECT 1 FROM grievance_activity_log 
  WHERE grievance_id = g.id AND activity_type = 'grievance_created'
);

-- Add comments for documentation
COMMENT ON TABLE grievance_activity_log IS 'Comprehensive activity log for all grievance-related actions';
COMMENT ON TABLE admin_activity_summary IS 'Daily summary of admin activities for performance tracking';
COMMENT ON FUNCTION log_grievance_activity IS 'Logs grievance activities with proper visibility controls';
COMMENT ON FUNCTION get_grievance_activity_timeline IS 'Returns public activity timeline for student view';
COMMENT ON FUNCTION get_admin_activity_summary IS 'Returns admin activity summary for reporting'; 