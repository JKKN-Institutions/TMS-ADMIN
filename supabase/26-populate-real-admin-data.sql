-- Populate Real Admin Staff Data
-- This script populates the admin_staff_skills table with real data for existing admin users

-- First, ensure the admin_staff_skills table exists (from the previous script)
-- If the previous script wasn't run, create the table structure

-- Create enum types if they don't exist
DO $$ BEGIN
  CREATE TYPE activity_type AS ENUM (
    'grievance_created',
    'grievance_assigned',
    'grievance_unassigned',
    'grievance_reassigned',
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
    'satisfaction_rating_received',
    'admin_action_taken',
    'notification_sent'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE activity_visibility AS ENUM (
    'public',      -- Visible to student
    'internal',    -- Only visible to admin
    'system'       -- System generated, visible to both
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS admin_staff_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
  skill_category VARCHAR(100) NOT NULL DEFAULT 'general',
  skill_level INTEGER CHECK (skill_level >= 1 AND skill_level <= 5) DEFAULT 3,
  specialization_areas TEXT[] DEFAULT '{}',
  max_concurrent_cases INTEGER DEFAULT 25,
  preferred_case_types TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
CREATE INDEX IF NOT EXISTS idx_admin_staff_skills_admin ON admin_staff_skills(admin_id);
CREATE INDEX IF NOT EXISTS idx_grievance_assignment_history_grievance ON grievance_assignment_history(grievance_id);

-- Clear existing admin staff skills to avoid duplicates
DELETE FROM admin_staff_skills;

-- Insert realistic admin staff skills for existing admin users
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
WHERE au.is_active = true;

-- Create or replace the enhanced functions

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

-- Function to get available admin staff for assignment (FIXED)
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
    au.role,
    COALESCE(workload.current_count, 0)::INTEGER as current_workload,
    COALESCE(ass.max_concurrent_cases, 25)::INTEGER as max_capacity,
    CASE 
      WHEN COALESCE(ass.max_concurrent_cases, 25) > 0 THEN
        ROUND((COALESCE(workload.current_count, 0)::NUMERIC / COALESCE(ass.max_concurrent_cases, 25)::NUMERIC) * 100)::INTEGER
      ELSE 0
    END as workload_percentage,
    COALESCE(ass.specialization_areas, ARRAY[]::TEXT[]) as specializations,
    COALESCE(ass.skill_level, 3)::INTEGER as skill_level,
    summary.response_time_avg,
    summary.recent_activity,
    COALESCE(perf.avg_rating, 3.0)::NUMERIC(3,2) as performance_rating
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
  LEFT JOIN (
    SELECT 
      admin_id,
      AVG(avg_response_time) as response_time_avg,
      MAX(created_at) as recent_activity
    FROM admin_activity_summary
    WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY admin_id
  ) summary ON au.id = summary.admin_id
  LEFT JOIN (
    SELECT 
      assigned_to,
      AVG(performance_rating::NUMERIC) as avg_rating
    FROM grievance_assignment_history
    WHERE performance_rating IS NOT NULL
    GROUP BY assigned_to
  ) perf ON au.id = perf.assigned_to
  WHERE au.is_active = true
  ORDER BY workload_percentage ASC, performance_rating DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get grievance activity timeline for students
CREATE OR REPLACE FUNCTION get_grievance_activity_timeline(p_grievance_id UUID)
RETURNS TABLE (
  id UUID,
  activity_type activity_type,
  actor_name VARCHAR(255),
  actor_type VARCHAR(20),
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
    gal.actor_type,
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

-- Function to recommend best admin for assignment
CREATE OR REPLACE FUNCTION get_recommended_admin_for_grievance(
  p_grievance_id UUID,
  p_category VARCHAR(50),
  p_priority VARCHAR(20)
)
RETURNS TABLE (
  admin_id UUID,
  admin_name VARCHAR(255),
  match_score INTEGER,
  recommendation_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH admin_scores AS (
    SELECT 
      au.id,
      au.name,
      au.role,
      COALESCE(workload.current_count, 0) as current_workload,
      COALESCE(ass.max_concurrent_cases, 25) as max_capacity,
      COALESCE(ass.specialization_areas, ARRAY[]::TEXT[]) as specializations,
      COALESCE(ass.skill_level, 3) as skill_level,
      CASE 
        WHEN p_category = ANY(COALESCE(ass.specialization_areas, ARRAY[]::TEXT[])) THEN 30
        ELSE 0
      END as specialization_score,
      CASE 
        WHEN COALESCE(workload.current_count, 0) < COALESCE(ass.max_concurrent_cases, 25) * 0.7 THEN 25
        WHEN COALESCE(workload.current_count, 0) < COALESCE(ass.max_concurrent_cases, 25) * 0.9 THEN 15
        ELSE 0
      END as workload_score,
      CASE 
        WHEN au.role = 'super_admin' THEN 20
        WHEN au.role = 'operations_admin' THEN 15
        WHEN au.role = 'transport_manager' THEN 10
        ELSE 5
      END as role_score,
      COALESCE(ass.skill_level, 3) * 5 as skill_score
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
  )
  SELECT 
    acs.id,
    acs.name,
    (acs.specialization_score + acs.workload_score + acs.role_score + acs.skill_score)::INTEGER as match_score,
    CONCAT(
      'Match based on: ',
      CASE WHEN acs.specialization_score > 0 THEN 'Specialization (' || acs.specialization_score || '), ' ELSE '' END,
      'Workload (' || acs.workload_score || '), ',
      'Role (' || acs.role_score || '), ',
      'Skill Level (' || acs.skill_score || ')'
    ) as recommendation_reason
  FROM admin_scores acs
  WHERE acs.current_workload < acs.max_capacity
  ORDER BY match_score DESC
  LIMIT 3;
END;
$$ LANGUAGE plpgsql;

-- Enhanced trigger for grievance changes
CREATE OR REPLACE FUNCTION enhanced_grievance_change_trigger()
RETURNS TRIGGER AS $$
DECLARE
  admin_name VARCHAR(255);
  old_admin_name VARCHAR(255);
  action_desc TEXT;
BEGIN
  -- Get admin names
  IF NEW.assigned_to IS NOT NULL THEN
    SELECT name INTO admin_name FROM admin_users WHERE id = NEW.assigned_to;
  END IF;
  
  IF OLD.assigned_to IS NOT NULL THEN
    SELECT name INTO old_admin_name FROM admin_users WHERE id = OLD.assigned_to;
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
      jsonb_build_object(
        'old_status', OLD.status, 
        'new_status', NEW.status,
        'changed_by', NEW.assigned_to,
        'timestamp', NOW()
      ),
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      CASE WHEN NEW.status IN ('resolved', 'closed') THEN true ELSE false END
    );
  END IF;

  -- Log assignment changes
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    IF OLD.assigned_to IS NULL AND NEW.assigned_to IS NOT NULL THEN
      -- New assignment
      action_desc := 'Grievance assigned to ' || COALESCE(admin_name, 'Unknown Admin');
      
      PERFORM log_grievance_activity(
        NEW.id,
        'grievance_assigned',
        'public',
        'admin',
        NEW.assigned_to,
        COALESCE(admin_name, 'System'),
        action_desc,
        jsonb_build_object(
          'assigned_to', NEW.assigned_to,
          'assigned_to_name', admin_name,
          'timestamp', NOW()
        ),
        jsonb_build_object('assigned_to', OLD.assigned_to),
        jsonb_build_object('assigned_to', NEW.assigned_to),
        true
      );
      
      -- Create assignment history record
      INSERT INTO grievance_assignment_history (
        grievance_id, assigned_to, assignment_type, assigned_at
      ) VALUES (
        NEW.id, NEW.assigned_to, 'manual', NOW()
      );
      
    ELSIF OLD.assigned_to IS NOT NULL AND NEW.assigned_to IS NULL THEN
      -- Unassignment
      action_desc := 'Grievance unassigned from ' || COALESCE(old_admin_name, 'Unknown Admin');
      
      PERFORM log_grievance_activity(
        NEW.id,
        'grievance_unassigned',
        'public',
        'admin',
        OLD.assigned_to,
        COALESCE(old_admin_name, 'System'),
        action_desc,
        jsonb_build_object(
          'unassigned_from', OLD.assigned_to,
          'unassigned_from_name', old_admin_name,
          'timestamp', NOW()
        ),
        jsonb_build_object('assigned_to', OLD.assigned_to),
        jsonb_build_object('assigned_to', NEW.assigned_to),
        false
      );
      
      -- Update assignment history
      UPDATE grievance_assignment_history 
      SET is_active = false, unassigned_at = NOW()
      WHERE grievance_id = NEW.id AND assigned_to = OLD.assigned_to AND is_active = true;
      
    ELSIF OLD.assigned_to IS NOT NULL AND NEW.assigned_to IS NOT NULL THEN
      -- Reassignment
      action_desc := 'Grievance reassigned from ' || COALESCE(old_admin_name, 'Unknown') || ' to ' || COALESCE(admin_name, 'Unknown Admin');
      
      PERFORM log_grievance_activity(
        NEW.id,
        'grievance_reassigned',
        'public',
        'admin',
        NEW.assigned_to,
        COALESCE(admin_name, 'System'),
        action_desc,
        jsonb_build_object(
          'reassigned_from', OLD.assigned_to,
          'reassigned_from_name', old_admin_name,
          'reassigned_to', NEW.assigned_to,
          'reassigned_to_name', admin_name,
          'timestamp', NOW()
        ),
        jsonb_build_object('assigned_to', OLD.assigned_to),
        jsonb_build_object('assigned_to', NEW.assigned_to),
        true
      );
      
      -- Update old assignment and create new one
      UPDATE grievance_assignment_history 
      SET is_active = false, unassigned_at = NOW()
      WHERE grievance_id = NEW.id AND assigned_to = OLD.assigned_to AND is_active = true;
      
      INSERT INTO grievance_assignment_history (
        grievance_id, assigned_to, assignment_type, assigned_at
      ) VALUES (
        NEW.id, NEW.assigned_to, 'reassignment', NOW()
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
      jsonb_build_object(
        'old_priority', OLD.priority, 
        'new_priority', NEW.priority,
        'changed_by', NEW.assigned_to,
        'timestamp', NOW()
      ),
      jsonb_build_object('priority', OLD.priority),
      jsonb_build_object('priority', NEW.priority),
      false
    );
  END IF;

  -- Log resolution
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    action_desc := 'Grievance resolved';
    IF NEW.resolution IS NOT NULL THEN
      action_desc := action_desc || ': ' || substring(NEW.resolution, 1, 100);
      IF length(NEW.resolution) > 100 THEN
        action_desc := action_desc || '...';
      END IF;
    END IF;
    
    PERFORM log_grievance_activity(
      NEW.id,
      'grievance_resolved',
      'public',
      'admin',
      NEW.assigned_to,
      COALESCE(admin_name, 'System'),
      action_desc,
      jsonb_build_object(
        'resolution', NEW.resolution,
        'resolved_by', NEW.assigned_to,
        'resolved_by_name', admin_name,
        'timestamp', NOW()
      ),
      NULL,
      jsonb_build_object('status', NEW.status, 'resolution', NEW.resolution),
      true
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace existing trigger
DROP TRIGGER IF EXISTS enhanced_grievance_status_trigger ON grievances;
DROP TRIGGER IF EXISTS enhanced_grievance_change_trigger ON grievances;
CREATE TRIGGER enhanced_grievance_change_trigger
  AFTER UPDATE ON grievances
  FOR EACH ROW
  EXECUTE FUNCTION enhanced_grievance_change_trigger();

-- Insert initial activity logs for existing grievances (if not already present)
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

-- Create assignment history for existing assigned grievances
INSERT INTO grievance_assignment_history (
  grievance_id,
  assigned_to,
  assignment_type,
  assigned_at,
  is_active
)
SELECT 
  g.id,
  g.assigned_to,
  'existing',
  g.created_at,
  CASE WHEN g.status IN ('open', 'in_progress') THEN true ELSE false END
FROM grievances g
WHERE g.assigned_to IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM grievance_assignment_history gah 
    WHERE gah.grievance_id = g.id AND gah.assigned_to = g.assigned_to
  );

-- Add some sample performance ratings for demo purposes
UPDATE grievance_assignment_history 
SET performance_rating = FLOOR(3 + RANDOM() * 3)::INTEGER
WHERE performance_rating IS NULL AND assigned_to IS NOT NULL;

-- Final verification query
SELECT 
  'Admin Staff Skills' as table_name, 
  COUNT(*) as record_count 
FROM admin_staff_skills
UNION ALL
SELECT 
  'Available Staff Function' as table_name,
  COUNT(*) as record_count
FROM get_available_admin_staff()
UNION ALL
SELECT 
  'Grievance Activity Log' as table_name,
  COUNT(*) as record_count
FROM grievance_activity_log; 