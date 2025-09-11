-- Enhanced Grievance System Schema
-- This enhancement adds comprehensive grievance tracking and management capabilities

-- Additional grievance types and statuses
CREATE TYPE grievance_type AS ENUM ('service_complaint', 'driver_behavior', 'route_issue', 'vehicle_condition', 'safety_concern', 'billing_dispute', 'technical_issue', 'suggestion', 'compliment', 'other');
CREATE TYPE grievance_urgency AS ENUM ('low', 'medium', 'high', 'critical');

-- Enhanced grievance table with additional fields
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS grievance_type grievance_type DEFAULT 'service_complaint';
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS urgency grievance_urgency DEFAULT 'medium';
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS location_details TEXT;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS incident_date DATE;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS incident_time TIME;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS witness_details TEXT;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS vehicle_registration VARCHAR(50);
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS estimated_resolution_time INTERVAL;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS actual_resolution_time INTERVAL;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS satisfaction_rating INTEGER CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5);
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS feedback_on_resolution TEXT;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS escalated_to UUID REFERENCES admin_users(id);
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS escalation_reason TEXT;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS follow_up_required BOOLEAN DEFAULT false;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS public_response TEXT;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS resolution_category VARCHAR(100);
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS closure_reason TEXT;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS related_grievances UUID[];

-- Grievance Status History table
CREATE TABLE grievance_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grievance_id UUID REFERENCES grievances(id) ON DELETE CASCADE,
  old_status grievance_status,
  new_status grievance_status NOT NULL,
  changed_by UUID REFERENCES admin_users(id),
  change_reason TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grievance Assignments table
CREATE TABLE grievance_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grievance_id UUID REFERENCES grievances(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES admin_users(id),
  assigned_to UUID REFERENCES admin_users(id),
  assignment_reason TEXT,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  unassigned_at TIMESTAMP WITH TIME ZONE,
  unassigned_by UUID REFERENCES admin_users(id),
  unassignment_reason TEXT
);

-- Grievance Communications table
CREATE TABLE grievance_communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grievance_id UUID REFERENCES grievances(id) ON DELETE CASCADE,
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('admin', 'student')),
  sender_id UUID NOT NULL,
  recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('admin', 'student')),
  recipient_id UUID NOT NULL,
  message TEXT NOT NULL,
  communication_type VARCHAR(50) DEFAULT 'comment',
  is_internal BOOLEAN DEFAULT false,
  attachments TEXT[],
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grievance Templates table
CREATE TABLE grievance_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  category grievance_category NOT NULL,
  grievance_type grievance_type NOT NULL,
  template_fields JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grievance Categories Configuration table
CREATE TABLE grievance_categories_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category grievance_category NOT NULL,
  grievance_type grievance_type NOT NULL,
  default_priority grievance_priority DEFAULT 'medium',
  default_urgency grievance_urgency DEFAULT 'medium',
  auto_assign_to UUID REFERENCES admin_users(id),
  sla_hours INTEGER DEFAULT 72,
  escalation_hours INTEGER DEFAULT 48,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grievance Escalation Rules table
CREATE TABLE grievance_escalation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  conditions JSONB NOT NULL,
  escalation_level INTEGER NOT NULL,
  escalate_to UUID REFERENCES admin_users(id),
  notification_template TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grievance Attachments table
CREATE TABLE grievance_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grievance_id UUID REFERENCES grievances(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT,
  file_type VARCHAR(100),
  mime_type VARCHAR(100),
  uploaded_by UUID NOT NULL,
  uploaded_by_type VARCHAR(20) NOT NULL CHECK (uploaded_by_type IN ('admin', 'student')),
  upload_purpose VARCHAR(100),
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grievance Analytics table
CREATE TABLE grievance_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  total_grievances INTEGER DEFAULT 0,
  new_grievances INTEGER DEFAULT 0,
  resolved_grievances INTEGER DEFAULT 0,
  pending_grievances INTEGER DEFAULT 0,
  escalated_grievances INTEGER DEFAULT 0,
  avg_resolution_time INTERVAL,
  satisfaction_score DECIMAL(3,2),
  category_breakdown JSONB,
  priority_breakdown JSONB,
  urgency_breakdown JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(date)
);

-- Create indexes for better performance
CREATE INDEX idx_grievances_enhanced_student ON grievances(student_id);
CREATE INDEX idx_grievances_enhanced_route ON grievances(route_id);
CREATE INDEX idx_grievances_enhanced_status ON grievances(status);
CREATE INDEX idx_grievances_enhanced_category ON grievances(category);
CREATE INDEX idx_grievances_enhanced_type ON grievances(grievance_type);
CREATE INDEX idx_grievances_enhanced_priority ON grievances(priority);
CREATE INDEX idx_grievances_enhanced_urgency ON grievances(urgency);
CREATE INDEX idx_grievances_enhanced_assigned ON grievances(assigned_to);
CREATE INDEX idx_grievances_enhanced_created ON grievances(created_at);
CREATE INDEX idx_grievances_enhanced_incident_date ON grievances(incident_date);
CREATE INDEX idx_grievances_enhanced_tags ON grievances USING gin(tags);

CREATE INDEX idx_grievance_status_history_grievance ON grievance_status_history(grievance_id);
CREATE INDEX idx_grievance_status_history_created ON grievance_status_history(created_at);

CREATE INDEX idx_grievance_assignments_grievance ON grievance_assignments(grievance_id);
CREATE INDEX idx_grievance_assignments_assigned_to ON grievance_assignments(assigned_to);
CREATE INDEX idx_grievance_assignments_active ON grievance_assignments(is_active);

CREATE INDEX idx_grievance_communications_grievance ON grievance_communications(grievance_id);
CREATE INDEX idx_grievance_communications_sender ON grievance_communications(sender_type, sender_id);
CREATE INDEX idx_grievance_communications_recipient ON grievance_communications(recipient_type, recipient_id);
CREATE INDEX idx_grievance_communications_created ON grievance_communications(created_at);

CREATE INDEX idx_grievance_attachments_grievance ON grievance_attachments(grievance_id);
CREATE INDEX idx_grievance_attachments_uploaded_by ON grievance_attachments(uploaded_by_type, uploaded_by);

CREATE INDEX idx_grievance_analytics_date ON grievance_analytics(date);

-- Create triggers for automatic updates
CREATE OR REPLACE FUNCTION update_grievance_status_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO grievance_status_history (grievance_id, old_status, new_status, changed_by, change_reason)
    VALUES (NEW.id, OLD.status, NEW.status, 
            COALESCE(current_setting('app.current_user_id', true)::UUID, NEW.assigned_to), 
            'Status changed via system');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER grievance_status_history_trigger
  AFTER UPDATE ON grievances
  FOR EACH ROW
  EXECUTE FUNCTION update_grievance_status_history();

-- Create function to calculate resolution time
CREATE OR REPLACE FUNCTION calculate_resolution_time()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    NEW.resolved_at = NOW();
    NEW.actual_resolution_time = NOW() - NEW.created_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_resolution_time_trigger
  BEFORE UPDATE ON grievances
  FOR EACH ROW
  EXECUTE FUNCTION calculate_resolution_time();

-- Create function to update grievance analytics
CREATE OR REPLACE FUNCTION update_grievance_analytics()
RETURNS TRIGGER AS $$
DECLARE
  today DATE := CURRENT_DATE;
BEGIN
  -- Insert or update analytics for today
  INSERT INTO grievance_analytics (date, total_grievances, new_grievances, resolved_grievances, pending_grievances)
  VALUES (today, 
          (SELECT COUNT(*) FROM grievances WHERE DATE(created_at) = today),
          (SELECT COUNT(*) FROM grievances WHERE DATE(created_at) = today),
          (SELECT COUNT(*) FROM grievances WHERE DATE(resolved_at) = today),
          (SELECT COUNT(*) FROM grievances WHERE status IN ('open', 'in_progress')))
  ON CONFLICT (date) DO UPDATE SET
    total_grievances = EXCLUDED.total_grievances,
    new_grievances = EXCLUDED.new_grievances,
    resolved_grievances = EXCLUDED.resolved_grievances,
    pending_grievances = EXCLUDED.pending_grievances;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_grievance_analytics_trigger
  AFTER INSERT OR UPDATE ON grievances
  FOR EACH ROW
  EXECUTE FUNCTION update_grievance_analytics();

-- Insert default grievance categories configuration
INSERT INTO grievance_categories_config (category, grievance_type, default_priority, default_urgency, sla_hours, escalation_hours)
VALUES 
  ('complaint', 'service_complaint', 'medium', 'medium', 72, 48),
  ('complaint', 'driver_behavior', 'high', 'medium', 48, 24),
  ('complaint', 'route_issue', 'medium', 'medium', 72, 48),
  ('complaint', 'vehicle_condition', 'high', 'medium', 48, 24),
  ('complaint', 'safety_concern', 'high', 'high', 24, 12),
  ('complaint', 'billing_dispute', 'medium', 'medium', 72, 48),
  ('technical_issue', 'technical_issue', 'medium', 'medium', 48, 24),
  ('suggestion', 'suggestion', 'low', 'low', 168, 120),
  ('compliment', 'compliment', 'low', 'low', 168, 120);

-- Insert default escalation rules
INSERT INTO grievance_escalation_rules (name, conditions, escalation_level, notification_template, is_active)
VALUES 
  ('High Priority Timeout', '{"priority": "high", "hours_open": 24}', 1, 'High priority grievance #{grievance_id} has been open for 24 hours', true),
  ('Critical Urgency Timeout', '{"urgency": "critical", "hours_open": 12}', 1, 'Critical grievance #{grievance_id} requires immediate attention', true),
  ('Safety Concern Timeout', '{"grievance_type": "safety_concern", "hours_open": 12}', 1, 'Safety concern #{grievance_id} requires immediate escalation', true),
  ('General Timeout', '{"hours_open": 72}', 1, 'Grievance #{grievance_id} has been open for 72 hours', true);

-- Add comments for documentation
COMMENT ON TABLE grievances IS 'Enhanced grievance tracking system with comprehensive fields';
COMMENT ON TABLE grievance_status_history IS 'Tracks all status changes for grievances';
COMMENT ON TABLE grievance_assignments IS 'Manages grievance assignments to admin users';
COMMENT ON TABLE grievance_communications IS 'Stores all communications related to grievances';
COMMENT ON TABLE grievance_templates IS 'Templates for common grievance types';
COMMENT ON TABLE grievance_categories_config IS 'Configuration for grievance categories and auto-assignment rules';
COMMENT ON TABLE grievance_escalation_rules IS 'Rules for automatic grievance escalation';
COMMENT ON TABLE grievance_attachments IS 'File attachments for grievances';
COMMENT ON TABLE grievance_analytics IS 'Daily analytics and metrics for grievances'; 