-- Bug Reporting System Migration
-- This migration adds comprehensive bug reporting functionality for the passenger app

-- Custom types for bug reporting
CREATE TYPE bug_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE bug_status AS ENUM ('open', 'in_progress', 'resolved', 'closed', 'duplicate', 'wont_fix');
CREATE TYPE bug_category AS ENUM ('ui_bug', 'functional_bug', 'performance_issue', 'crash', 'security_issue', 'feature_request', 'other');
CREATE TYPE bug_priority AS ENUM ('low', 'normal', 'high', 'urgent');

-- Bug Reports table
CREATE TABLE bug_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  steps_to_reproduce TEXT,
  expected_behavior TEXT,
  actual_behavior TEXT,
  category bug_category NOT NULL DEFAULT 'other',
  severity bug_severity NOT NULL DEFAULT 'medium',
  priority bug_priority NOT NULL DEFAULT 'normal',
  status bug_status NOT NULL DEFAULT 'open',
  
  -- Reporter information
  reporter_type VARCHAR(50) NOT NULL, -- 'student', 'driver', 'admin'
  reporter_id UUID NOT NULL,
  reporter_name VARCHAR(255) NOT NULL,
  reporter_email VARCHAR(255) NOT NULL,
  
  -- System information
  browser_info JSONB,
  device_info JSONB,
  screen_resolution VARCHAR(50),
  user_agent TEXT,
  page_url TEXT,
  
  -- Assignment and tracking
  assigned_to UUID REFERENCES admin_users(id),
  assigned_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  
  -- Additional metadata
  tags TEXT[],
  internal_notes TEXT,
  resolution_notes TEXT,
  estimated_effort INTEGER, -- in hours
  actual_effort INTEGER -- in hours
);

-- Bug Screenshots/Attachments table
CREATE TABLE bug_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bug_report_id UUID REFERENCES bug_reports(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  file_path TEXT NOT NULL, -- Storage path
  is_screenshot BOOLEAN DEFAULT false,
  description TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uploaded_by_id UUID NOT NULL,
  uploaded_by_name VARCHAR(255) NOT NULL
);

-- Bug Comments/Updates table
CREATE TABLE bug_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bug_report_id UUID REFERENCES bug_reports(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false, -- true for admin-only comments
  
  -- Commenter information
  commenter_type VARCHAR(50) NOT NULL, -- 'student', 'driver', 'admin'
  commenter_id UUID NOT NULL,
  commenter_name VARCHAR(255) NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  edited_at TIMESTAMP WITH TIME ZONE
);

-- Bug Status History table
CREATE TABLE bug_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bug_report_id UUID REFERENCES bug_reports(id) ON DELETE CASCADE,
  old_status bug_status,
  new_status bug_status NOT NULL,
  changed_by_id UUID NOT NULL,
  changed_by_name VARCHAR(255) NOT NULL,
  change_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bug Labels/Tags table
CREATE TABLE bug_labels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#6B7280', -- hex color
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bug Report Labels junction table
CREATE TABLE bug_report_labels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bug_report_id UUID REFERENCES bug_reports(id) ON DELETE CASCADE,
  label_id UUID REFERENCES bug_labels(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  added_by_id UUID NOT NULL,
  UNIQUE(bug_report_id, label_id)
);

-- Indexes for performance
CREATE INDEX idx_bug_reports_status ON bug_reports(status);
CREATE INDEX idx_bug_reports_severity ON bug_reports(severity);
CREATE INDEX idx_bug_reports_priority ON bug_reports(priority);
CREATE INDEX idx_bug_reports_category ON bug_reports(category);
CREATE INDEX idx_bug_reports_reporter ON bug_reports(reporter_type, reporter_id);
CREATE INDEX idx_bug_reports_assigned_to ON bug_reports(assigned_to);
CREATE INDEX idx_bug_reports_created_at ON bug_reports(created_at);
CREATE INDEX idx_bug_reports_updated_at ON bug_reports(updated_at);

CREATE INDEX idx_bug_attachments_bug_id ON bug_attachments(bug_report_id);
CREATE INDEX idx_bug_comments_bug_id ON bug_comments(bug_report_id);
CREATE INDEX idx_bug_status_history_bug_id ON bug_status_history(bug_report_id);

-- Triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_bug_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bug_reports_updated_at
  BEFORE UPDATE ON bug_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_bug_updated_at();

-- Function to automatically create status history entries
CREATE OR REPLACE FUNCTION create_bug_status_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO bug_status_history (
      bug_report_id,
      old_status,
      new_status,
      changed_by_id,
      changed_by_name,
      change_reason
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      NEW.assigned_to, -- This should be set by the application
      'System', -- This should be overridden by the application
      'Status changed'
    );
    
    -- Update resolved_at timestamp
    IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
      NEW.resolved_at = NOW();
    END IF;
    
    -- Update closed_at timestamp
    IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
      NEW.closed_at = NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_bug_status_history_trigger
  BEFORE UPDATE ON bug_reports
  FOR EACH ROW
  EXECUTE FUNCTION create_bug_status_history();

-- RLS Policies for bug_reports
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Students can view their own bug reports
CREATE POLICY "Students can view own bug reports" ON bug_reports
  FOR SELECT
  USING (
    reporter_type = 'student' AND 
    reporter_id::text = auth.jwt() ->> 'sub'
  );

-- Policy: Students can create bug reports
CREATE POLICY "Students can create bug reports" ON bug_reports
  FOR INSERT
  WITH CHECK (
    reporter_type = 'student' AND 
    reporter_id::text = auth.jwt() ->> 'sub'
  );

-- Policy: Students can update their own bug reports (limited fields)
CREATE POLICY "Students can update own bug reports" ON bug_reports
  FOR UPDATE
  USING (
    reporter_type = 'student' AND 
    reporter_id::text = auth.jwt() ->> 'sub'
  )
  WITH CHECK (
    reporter_type = 'student' AND 
    reporter_id::text = auth.jwt() ->> 'sub'
  );

-- Policy: Admins can view all bug reports
CREATE POLICY "Admins can view all bug reports" ON bug_reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id::text = auth.jwt() ->> 'sub' 
      AND is_active = true
    )
  );

-- Policy: Admins can update all bug reports
CREATE POLICY "Admins can update all bug reports" ON bug_reports
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id::text = auth.jwt() ->> 'sub' 
      AND is_active = true
    )
  );

-- RLS Policies for bug_attachments
ALTER TABLE bug_attachments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view attachments for bugs they can see
CREATE POLICY "Users can view bug attachments" ON bug_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bug_reports br
      WHERE br.id = bug_attachments.bug_report_id
      -- This will use the existing RLS policies on bug_reports
    )
  );

-- Policy: Users can add attachments to bugs they can access
CREATE POLICY "Users can add bug attachments" ON bug_attachments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bug_reports br
      WHERE br.id = bug_attachments.bug_report_id
      -- This will use the existing RLS policies on bug_reports
    )
  );

-- RLS Policies for bug_comments
ALTER TABLE bug_comments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view comments for bugs they can see (excluding internal comments for non-admins)
CREATE POLICY "Users can view bug comments" ON bug_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bug_reports br
      WHERE br.id = bug_comments.bug_report_id
    ) AND (
      is_internal = false OR
      EXISTS (
        SELECT 1 FROM admin_users 
        WHERE id::text = auth.jwt() ->> 'sub' 
        AND is_active = true
      )
    )
  );

-- Policy: Users can add comments to bugs they can access
CREATE POLICY "Users can add bug comments" ON bug_comments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bug_reports br
      WHERE br.id = bug_comments.bug_report_id
    )
  );

-- RLS Policies for other tables
ALTER TABLE bug_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_report_labels ENABLE ROW LEVEL SECURITY;

-- Allow viewing status history and labels for accessible bugs
CREATE POLICY "Users can view bug status history" ON bug_status_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bug_reports br
      WHERE br.id = bug_status_history.bug_report_id
    )
  );

CREATE POLICY "Users can view bug labels" ON bug_labels
  FOR SELECT
  USING (true); -- Labels are public

CREATE POLICY "Users can view bug report labels" ON bug_report_labels
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bug_reports br
      WHERE br.id = bug_report_labels.bug_report_id
    )
  );

-- Admins can manage labels
CREATE POLICY "Admins can manage bug labels" ON bug_labels
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id::text = auth.jwt() ->> 'sub' 
      AND is_active = true
    )
  );

-- Insert some default bug labels
INSERT INTO bug_labels (name, color, description) VALUES
  ('frontend', '#3B82F6', 'Frontend/UI related issues'),
  ('backend', '#EF4444', 'Backend/API related issues'),
  ('mobile', '#10B981', 'Mobile device specific issues'),
  ('performance', '#F59E0B', 'Performance related issues'),
  ('security', '#DC2626', 'Security related issues'),
  ('enhancement', '#8B5CF6', 'Feature enhancement requests'),
  ('duplicate', '#6B7280', 'Duplicate bug reports'),
  ('needs-info', '#F97316', 'Needs more information'),
  ('confirmed', '#059669', 'Confirmed and reproducible'),
  ('wontfix', '#64748B', 'Will not be fixed');

-- Create a view for bug report statistics
CREATE VIEW bug_report_stats AS
SELECT 
  COUNT(*) as total_bugs,
  COUNT(*) FILTER (WHERE status = 'open') as open_bugs,
  COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_bugs,
  COUNT(*) FILTER (WHERE status = 'resolved') as resolved_bugs,
  COUNT(*) FILTER (WHERE status = 'closed') as closed_bugs,
  COUNT(*) FILTER (WHERE severity = 'critical') as critical_bugs,
  COUNT(*) FILTER (WHERE severity = 'high') as high_severity_bugs,
  COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_bugs,
  AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - created_at))/3600) as avg_resolution_time_hours
FROM bug_reports;

-- Comment on tables
COMMENT ON TABLE bug_reports IS 'Stores bug reports submitted by users';
COMMENT ON TABLE bug_attachments IS 'Stores file attachments for bug reports including screenshots';
COMMENT ON TABLE bug_comments IS 'Stores comments and updates on bug reports';
COMMENT ON TABLE bug_status_history IS 'Tracks status changes for bug reports';
COMMENT ON TABLE bug_labels IS 'Defines available labels for categorizing bugs';
COMMENT ON TABLE bug_report_labels IS 'Links bug reports to their labels';

