-- Fix admin bug reports system
-- This script creates missing tables and views needed for the admin bug reports API

-- Create bug_status_history table
CREATE TABLE IF NOT EXISTS bug_status_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bug_report_id UUID REFERENCES bug_reports(id) ON DELETE CASCADE,
    new_status TEXT NOT NULL,
    old_status TEXT,
    changed_by_id UUID,
    changed_by_name TEXT,
    change_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create bug_labels table
CREATE TABLE IF NOT EXISTS bug_labels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6B7280',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create bug_report_labels table (junction table)
CREATE TABLE IF NOT EXISTS bug_report_labels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bug_report_id UUID REFERENCES bug_reports(id) ON DELETE CASCADE,
    label_id UUID REFERENCES bug_labels(id) ON DELETE CASCADE,
    added_by_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(bug_report_id, label_id)
);

-- Create bug_report_stats view
CREATE OR REPLACE VIEW bug_report_stats AS
SELECT 
    COUNT(*) as total_bugs,
    COUNT(*) FILTER (WHERE status = 'open') as open_bugs,
    COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_bugs,
    COUNT(*) FILTER (WHERE status = 'resolved') as resolved_bugs,
    COUNT(*) FILTER (WHERE status = 'closed') as closed_bugs,
    COUNT(*) FILTER (WHERE priority = 'critical') as critical_bugs,
    COUNT(*) FILTER (WHERE priority = 'high') as high_severity_bugs,
    COUNT(*) FILTER (WHERE priority = 'critical' OR priority = 'high') as urgent_bugs,
    COALESCE(
        AVG(
            CASE 
                WHEN resolved_at IS NOT NULL AND created_at IS NOT NULL 
                THEN EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0
            END
        ), 0
    ) as avg_resolution_time_hours
FROM bug_reports;

-- Insert some default labels
INSERT INTO bug_labels (name, color, description) VALUES 
('UI Bug', '#EF4444', 'User interface related issues'),
('Performance', '#F59E0B', 'Performance and speed issues'),
('Security', '#DC2626', 'Security vulnerabilities'),
('Enhancement', '#10B981', 'Feature requests and improvements'),
('Documentation', '#6366F1', 'Documentation related issues'),
('Critical', '#B91C1C', 'Critical issues requiring immediate attention')
ON CONFLICT (name) DO NOTHING;

-- Add RLS policies for new tables
ALTER TABLE bug_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_report_labels ENABLE ROW LEVEL SECURITY;

-- Allow admins to read/write all bug-related data
CREATE POLICY "Admins can manage bug status history" ON bug_status_history
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users 
            WHERE id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Admins can manage bug labels" ON bug_labels
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users 
            WHERE id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Admins can manage bug report labels" ON bug_report_labels
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users 
            WHERE id = auth.uid() AND is_active = true
        )
    );

-- Allow users to read labels (for displaying in forms)
CREATE POLICY "Users can read bug labels" ON bug_labels
    FOR SELECT USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bug_status_history_bug_report_id ON bug_status_history(bug_report_id);
CREATE INDEX IF NOT EXISTS idx_bug_status_history_created_at ON bug_status_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_report_labels_bug_report_id ON bug_report_labels(bug_report_id);
CREATE INDEX IF NOT EXISTS idx_bug_report_labels_label_id ON bug_report_labels(label_id);

-- Grant permissions
GRANT ALL ON bug_status_history TO authenticated, service_role;
GRANT ALL ON bug_labels TO authenticated, service_role;
GRANT ALL ON bug_report_labels TO authenticated, service_role;
GRANT SELECT ON bug_report_stats TO authenticated, service_role;

