-- Fix missing database structures for grievance activity log system

-- Create missing enum types
CREATE TYPE IF NOT EXISTS activity_type AS ENUM (
  'grievance_created',
  'grievance_assigned',
  'grievance_unassigned',
  'grievance_reassigned',
  'grievance_status_changed',
  'grievance_priority_changed',
  'grievance_resolved',
  'grievance_closed',
  'comment_added',
  'attachment_added',
  'attachment_removed',
  'system_note_added',
  'reminder_sent',
  'escalation_triggered',
  'deadline_updated',
  'bulk_action_performed'
);

CREATE TYPE IF NOT EXISTS activity_visibility AS ENUM (
  'public',
  'internal',
  'private',
  'system'
);

-- Create grievance_activity_log table
CREATE TABLE IF NOT EXISTS grievance_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grievance_id UUID REFERENCES grievances(id) ON DELETE CASCADE,
  activity_type activity_type NOT NULL,
  visibility activity_visibility DEFAULT 'public',
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('admin', 'student', 'system')),
  actor_id UUID,
  actor_name VARCHAR(255),
  action_description TEXT NOT NULL,
  action_details JSONB DEFAULT '{}',
  old_values JSONB DEFAULT '{}',
  new_values JSONB DEFAULT '{}',
  is_milestone BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create admin_staff_skills table
CREATE TABLE IF NOT EXISTS admin_staff_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
  skill_category VARCHAR(100) DEFAULT 'general',
  skill_level INTEGER DEFAULT 3 CHECK (skill_level >= 1 AND skill_level <= 5),
  specialization_areas TEXT[] DEFAULT '{}',
  max_concurrent_cases INTEGER DEFAULT 25,
  preferred_case_types TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create admin_activity_summary table
CREATE TABLE IF NOT EXISTS admin_activity_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_actions INTEGER DEFAULT 0,
  grievances_assigned INTEGER DEFAULT 0,
  grievances_resolved INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  avg_response_time INTERVAL,
  activity_breakdown JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(admin_id, date)
);

-- Create grievance_assignment_history table
CREATE TABLE IF NOT EXISTS grievance_assignment_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grievance_id UUID REFERENCES grievances(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES admin_users(id),
  assigned_to UUID REFERENCES admin_users(id),
  assignment_reason TEXT,
  assignment_type VARCHAR(50) DEFAULT 'manual',
  priority_level VARCHAR(20),
  expected_resolution_date DATE,
  assignment_notes TEXT,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  unassigned_at TIMESTAMP WITH TIME ZONE,
  unassigned_by UUID REFERENCES admin_users(id),
  unassignment_reason TEXT,
  performance_rating INTEGER CHECK (performance_rating >= 1 AND performance_rating <= 5),
  completion_notes TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_grievance_activity_log_grievance ON grievance_activity_log(grievance_id);
CREATE INDEX IF NOT EXISTS idx_grievance_activity_log_actor ON grievance_activity_log(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_grievance_activity_log_type ON grievance_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_grievance_activity_log_visibility ON grievance_activity_log(visibility);
CREATE INDEX IF NOT EXISTS idx_grievance_activity_log_created ON grievance_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_staff_skills_admin ON admin_staff_skills(admin_id);
CREATE INDEX IF NOT EXISTS idx_grievance_assignment_history_grievance ON grievance_assignment_history(grievance_id);

-- Insert admin staff skills for existing admin users
INSERT INTO admin_staff_skills (admin_id, skill_category, skill_level, specialization_areas, max_concurrent_cases, preferred_case_types)
SELECT 
  au.id,
  'general',
  CASE 
    WHEN au.role = 'super_admin' THEN 5
    WHEN au.role = 'operations_admin' THEN 4
    WHEN au.role = 'transport_manager' THEN 4
    WHEN au.role = 'finance_admin' THEN 3
    ELSE 3
  END,
  CASE 
    WHEN au.role = 'super_admin' THEN ARRAY['complaint', 'suggestion', 'compliment', 'technical_issue']
    WHEN au.role = 'operations_admin' THEN ARRAY['complaint', 'technical_issue', 'suggestion']
    WHEN au.role = 'transport_manager' THEN ARRAY['complaint', 'suggestion']
    WHEN au.role = 'finance_admin' THEN ARRAY['complaint', 'technical_issue']
    ELSE ARRAY['complaint']
  END,
  CASE 
    WHEN au.role = 'super_admin' THEN 50
    WHEN au.role = 'operations_admin' THEN 25
    WHEN au.role = 'transport_manager' THEN 30
    WHEN au.role = 'finance_admin' THEN 20
    ELSE 15
  END,
  CASE 
    WHEN au.role = 'super_admin' THEN ARRAY['complaint', 'suggestion', 'compliment', 'technical_issue']
    WHEN au.role = 'operations_admin' THEN ARRAY['complaint', 'technical_issue']
    WHEN au.role = 'transport_manager' THEN ARRAY['complaint', 'suggestion']
    WHEN au.role = 'finance_admin' THEN ARRAY['complaint']
    ELSE ARRAY['complaint']
  END
FROM admin_users au
WHERE au.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM admin_staff_skills ass WHERE ass.admin_id = au.id
  );

-- Function to log grievance activities
CREATE OR REPLACE FUNCTION log_grievance_activity(
  p_grievance_id UUID,
  p_activity_type activity_type,
  p_visibility activity_visibility,
  p_actor_type VARCHAR(20),
  p_actor_id UUID,
  p_actor_name VARCHAR(255),
  p_action_description TEXT,
  p_action_details JSONB DEFAULT '{}',
  p_old_values JSONB DEFAULT '{}',
  p_new_values JSONB DEFAULT '{}',
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
      total_actions = admin_activity_summary.total_actions + 1,
      activity_breakdown = COALESCE(admin_activity_summary.activity_breakdown, '{}') || 
                          jsonb_build_object(p_activity_type::text, 
                            COALESCE((admin_activity_summary.activity_breakdown->>p_activity_type::text)::integer, 0) + 1);
  END IF;

  RETURN activity_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get available admin staff for assignment
CREATE OR REPLACE FUNCTION get_available_admin_staff()
RETURNS TABLE (
  id UUID,
  name VARCHAR(255),
  email VARCHAR(255),
  role VARCHAR(50),
  current_workload INTEGER,
  max_capacity INTEGER,
  workload_percentage INTEGER,
  specializations TEXT[],
  skill_level INTEGER,
  avg_response_time INTERVAL,
  recent_activity TIMESTAMP WITH TIME ZONE,
  performance_rating NUMERIC(3,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id,
    au.name,
    au.email,
    au.role::VARCHAR(50),
    COALESCE(workload.current_count, 0)::INTEGER as current_workload,
    COALESCE(ass.max_concurrent_cases, 25)::INTEGER as max_capacity,
    CASE 
      WHEN COALESCE(ass.max_concurrent_cases, 25) > 0 THEN
        ROUND((COALESCE(workload.current_count, 0)::NUMERIC / COALESCE(ass.max_concurrent_cases, 25)::NUMERIC) * 100)::INTEGER
      ELSE 0
    END as workload_percentage,
    COALESCE(ass.specialization_areas, ARRAY[]::TEXT[]) as specializations,
    COALESCE(ass.skill_level, 3)::INTEGER as skill_level,
    INTERVAL '2 hours' as avg_response_time,
    CURRENT_TIMESTAMP as recent_activity,
    3.5::NUMERIC(3,2) as performance_rating
  FROM admin_users au
  LEFT JOIN admin_staff_skills ass ON au.id = ass.admin_id
  LEFT JOIN (
    SELECT 
      assigned_to,
      COUNT(*) as current_count
    FROM grievances 
    WHERE status IN ('open', 'in_progress')
    GROUP BY assigned_to
  ) workload ON au.id = workload.assigned_to
  WHERE au.is_active = true
  ORDER BY workload_percentage ASC, performance_rating DESC;
END;
$$ LANGUAGE plpgsql;

-- Add column to grievances table if it doesn't exist
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS expected_resolution_date DATE;

COMMENT ON TABLE grievance_activity_log IS 'Comprehensive activity log for all grievance-related actions with visibility controls';
COMMENT ON TABLE admin_staff_skills IS 'Admin staff capabilities and specializations for grievance assignment';
COMMENT ON TABLE admin_activity_summary IS 'Daily activity summary for admin users';
COMMENT ON TABLE grievance_assignment_history IS 'Historical record of grievance assignments and reassignments'; 