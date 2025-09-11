-- Enhanced Grievance System RLS Policies - FIXED VERSION
-- This version drops ALL existing policies first to avoid conflicts

-- Drop all existing policies on grievances table (using individual DROP statements)
DROP POLICY IF EXISTS "Students can view their own grievances" ON grievances;
DROP POLICY IF EXISTS "Students can create grievances" ON grievances;
DROP POLICY IF EXISTS "Students can update their own grievances" ON grievances;
DROP POLICY IF EXISTS "Admins can view all grievances" ON grievances;
DROP POLICY IF EXISTS "Admins can update all grievances" ON grievances;
DROP POLICY IF EXISTS "Admins can insert grievances" ON grievances;

-- Drop policies on other grievance tables (if they exist)
DROP POLICY IF EXISTS "Students can view active grievance categories" ON grievance_categories_config;
DROP POLICY IF EXISTS "Admins can manage grievance categories config" ON grievance_categories_config;
DROP POLICY IF EXISTS "Students can view communications for their grievances" ON grievance_communications;
DROP POLICY IF EXISTS "Students can insert communications for their grievances" ON grievance_communications;
DROP POLICY IF EXISTS "Admins can manage all grievance communications" ON grievance_communications;

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

-- GRIEVANCES TABLE POLICIES
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

-- GRIEVANCE CATEGORIES CONFIG POLICIES
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

-- GRIEVANCE COMMUNICATIONS POLICIES
CREATE POLICY "Students can view communications for their grievances"
ON grievance_communications FOR SELECT
USING (
  (sender_type = 'student' AND sender_id::uuid IN (
    SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
  ))
  OR
  (recipient_type = 'student' AND recipient_id::uuid IN (
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
  AND sender_id::uuid IN (
    SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
  )
  AND grievance_id IN (
    SELECT id FROM grievances 
    WHERE student_id IN (
      SELECT id FROM students WHERE email = auth.jwt() ->> 'email'
    )
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

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON grievances TO authenticated;
GRANT SELECT ON grievance_categories_config TO authenticated;
GRANT ALL ON grievance_communications TO authenticated;
GRANT ALL ON grievance_status_history TO authenticated;
GRANT ALL ON grievance_assignments TO authenticated;
GRANT ALL ON grievance_attachments TO authenticated;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Verify the setup
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename LIKE 'grievance%'
ORDER BY tablename, policyname; 