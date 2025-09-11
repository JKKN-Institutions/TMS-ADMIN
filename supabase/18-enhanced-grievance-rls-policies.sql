-- Enhanced Grievance System RLS Policies
-- This file fixes RLS policy issues for the new grievance schema

-- Enable RLS on all grievance-related tables
ALTER TABLE grievances ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_categories_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_escalation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_analytics ENABLE ROW LEVEL SECURITY;

-- Drop existing grievance policies to recreate them
DROP POLICY IF EXISTS "Students can view their own grievances" ON grievances;
DROP POLICY IF EXISTS "Students can create grievances" ON grievances;
DROP POLICY IF EXISTS "Students can update their own grievances" ON grievances;
DROP POLICY IF EXISTS "Admins can view all grievances" ON grievances;
DROP POLICY IF EXISTS "Admins can update all grievances" ON grievances;

-- Recreate grievance policies with enhanced fields support
CREATE POLICY "Students can view their own grievances"
ON grievances FOR SELECT
USING (
  student_id IN (
    SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
  )
);

CREATE POLICY "Students can create grievances"
ON grievances FOR INSERT
WITH CHECK (
  student_id IN (
    SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
  )
);

CREATE POLICY "Students can update their own grievances"
ON grievances FOR UPDATE
USING (
  student_id IN (
    SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
  )
)
WITH CHECK (
  student_id IN (
    SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
  )
);

-- Admin policies for grievances
CREATE POLICY "Admins can view all grievances"
ON grievances FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

CREATE POLICY "Admins can update all grievances"
ON grievances FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

CREATE POLICY "Admins can insert grievances"
ON grievances FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

-- Grievance Status History Policies
CREATE POLICY "Students can view their grievance status history"
ON grievance_status_history FOR SELECT
USING (
  grievance_id IN (
    SELECT id FROM grievances 
    WHERE student_id IN (
      SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
    )
  )
);

CREATE POLICY "Admins can view all grievance status history"
ON grievance_status_history FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

CREATE POLICY "Admins can insert grievance status history"
ON grievance_status_history FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

-- Grievance Assignments Policies
CREATE POLICY "Students can view assignments for their grievances"
ON grievance_assignments FOR SELECT
USING (
  grievance_id IN (
    SELECT id FROM grievances 
    WHERE student_id IN (
      SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
    )
  )
);

CREATE POLICY "Admins can view all grievance assignments"
ON grievance_assignments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

CREATE POLICY "Admins can manage grievance assignments"
ON grievance_assignments FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

-- Grievance Communications Policies
CREATE POLICY "Students can view communications for their grievances"
ON grievance_communications FOR SELECT
USING (
  (sender_type = 'student' AND sender_id IN (
    SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
  ))
  OR
  (recipient_type = 'student' AND recipient_id IN (
    SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
  ))
  OR
  (grievance_id IN (
    SELECT id FROM grievances 
    WHERE student_id IN (
      SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
    )
  ) AND is_internal = false)
);

CREATE POLICY "Students can insert communications for their grievances"
ON grievance_communications FOR INSERT
WITH CHECK (
  sender_type = 'student' 
  AND sender_id IN (
    SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
  )
  AND grievance_id IN (
    SELECT id FROM grievances 
    WHERE student_id IN (
      SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
    )
  )
);

CREATE POLICY "Students can update their own communications"
ON grievance_communications FOR UPDATE
USING (
  sender_type = 'student' 
  AND sender_id IN (
    SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
  )
)
WITH CHECK (
  sender_type = 'student' 
  AND sender_id IN (
    SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
  )
);

CREATE POLICY "Admins can view all grievance communications"
ON grievance_communications FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

CREATE POLICY "Admins can manage all grievance communications"
ON grievance_communications FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

-- Grievance Templates Policies (Admin only)
CREATE POLICY "Admins can view all grievance templates"
ON grievance_templates FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

CREATE POLICY "Admins can manage grievance templates"
ON grievance_templates FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

-- Grievance Categories Config Policies (Read-only for students, full access for admins)
CREATE POLICY "Students can view active grievance categories"
ON grievance_categories_config FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage grievance categories config"
ON grievance_categories_config FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

-- Grievance Escalation Rules Policies (Admin only)
CREATE POLICY "Admins can view all escalation rules"
ON grievance_escalation_rules FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

CREATE POLICY "Admins can manage escalation rules"
ON grievance_escalation_rules FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

-- Grievance Attachments Policies
CREATE POLICY "Students can view attachments for their grievances"
ON grievance_attachments FOR SELECT
USING (
  grievance_id IN (
    SELECT id FROM grievances 
    WHERE student_id IN (
      SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
    )
  )
  AND (is_public = true OR uploaded_by_type = 'student')
);

CREATE POLICY "Students can upload attachments to their grievances"
ON grievance_attachments FOR INSERT
WITH CHECK (
  grievance_id IN (
    SELECT id FROM grievances 
    WHERE student_id IN (
      SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
    )
  )
  AND uploaded_by_type = 'student'
  AND uploaded_by IN (
    SELECT id::text FROM students WHERE email = auth.jwt() ->> 'email'
  )
);

CREATE POLICY "Students can delete their own attachments"
ON grievance_attachments FOR DELETE
USING (
  uploaded_by_type = 'student'
  AND uploaded_by IN (
    SELECT id::text FROM students WHERE email = auth.jwt() ->> 'email'
  )
);

CREATE POLICY "Admins can view all grievance attachments"
ON grievance_attachments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

CREATE POLICY "Admins can manage all grievance attachments"
ON grievance_attachments FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

-- Grievance Analytics Policies (Admin only)
CREATE POLICY "Admins can view grievance analytics"
ON grievance_analytics FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true
  )
);

CREATE POLICY "System can manage grievance analytics"
ON grievance_analytics FOR ALL
USING (true)
WITH CHECK (true);

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON grievances TO authenticated;
GRANT ALL ON grievance_status_history TO authenticated;
GRANT ALL ON grievance_assignments TO authenticated;
GRANT ALL ON grievance_communications TO authenticated;
GRANT SELECT ON grievance_templates TO authenticated;
GRANT SELECT ON grievance_categories_config TO authenticated;
GRANT SELECT ON grievance_escalation_rules TO authenticated;
GRANT ALL ON grievance_attachments TO authenticated;
GRANT SELECT ON grievance_analytics TO authenticated;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated; 