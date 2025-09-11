'use client';

import React, { useState } from 'react';
import { AlertTriangle, Database, Copy, CheckCircle, ExternalLink } from 'lucide-react';

const MissingCommunicationsTableNotice: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const sqlScript = `-- Create grievance_communications table
CREATE TABLE IF NOT EXISTS grievance_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id UUID NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('student', 'admin', 'system')),
  sender_id UUID NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('student', 'admin', 'system')),
  recipient_id UUID NULL,
  message TEXT NOT NULL,
  communication_type TEXT NOT NULL DEFAULT 'comment' CHECK (communication_type IN ('comment', 'update', 'status_change', 'assignment', 'resolution', 'escalation', 'notification')),
  is_internal BOOLEAN NOT NULL DEFAULT false,
  attachments JSONB DEFAULT '[]'::jsonb,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_grievance_communications_grievance ON grievance_communications(grievance_id);
CREATE INDEX IF NOT EXISTS idx_grievance_communications_sender ON grievance_communications(sender_type, sender_id);
CREATE INDEX IF NOT EXISTS idx_grievance_communications_recipient ON grievance_communications(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_grievance_communications_created ON grievance_communications(created_at);
CREATE INDEX IF NOT EXISTS idx_grievance_communications_type ON grievance_communications(communication_type);

-- Enable RLS
ALTER TABLE grievance_communications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Students can view communications for their grievances" 
ON grievance_communications FOR SELECT
USING (
  sender_type = 'student' 
  OR (
    recipient_type = 'student' 
    AND is_internal = false
    AND EXISTS (
      SELECT 1 FROM grievances 
      WHERE grievances.id = grievance_communications.grievance_id 
      AND grievances.student_id = auth.uid()
    )
  )
);

CREATE POLICY "Students can insert communications for their grievances" 
ON grievance_communications FOR INSERT
WITH CHECK (
  sender_type = 'student' 
  AND sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM grievances 
    WHERE grievances.id = grievance_communications.grievance_id 
    AND grievances.student_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all grievance communications" 
ON grievance_communications FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE admin_users.id = auth.uid()
  )
);

-- Grant permissions
GRANT ALL ON grievance_communications TO authenticated;

-- Create triggers
CREATE OR REPLACE FUNCTION update_grievance_communications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_grievance_communications_updated_at
    BEFORE UPDATE ON grievance_communications
    FOR EACH ROW
    EXECUTE FUNCTION update_grievance_communications_updated_at();

-- Activity logging trigger
CREATE OR REPLACE FUNCTION log_communication_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
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
            NEW.grievance_id,
            'comment_added',
            CASE WHEN NEW.is_internal THEN 'private' ELSE 'public' END,
            NEW.sender_type,
            NEW.sender_id,
            COALESCE(
                (SELECT name FROM admin_users WHERE id = NEW.sender_id),
                (SELECT student_name FROM students WHERE id = NEW.sender_id),
                'System'
            ),
            'Comment added to grievance',
            jsonb_build_object(
                'communication_type', NEW.communication_type,
                'is_internal', NEW.is_internal,
                'message_preview', LEFT(NEW.message, 100)
            ),
            false
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_communication_activity
AFTER INSERT ON grievance_communications
FOR EACH ROW
EXECUTE FUNCTION log_communication_activity();`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(sqlScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-6">
        <div className="flex items-center space-x-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-600" />
          <h2 className="text-xl font-semibold text-amber-900">Communications Table Missing</h2>
        </div>
        
        <p className="text-amber-800 mb-4">
          The grievance communications feature requires a database table that hasn't been created yet. 
          Please run the SQL script below in your Supabase dashboard to enable this feature.
        </p>

        <div className="flex items-center space-x-4 mb-4">
          <div className="flex items-center space-x-2 text-amber-700">
            <Database className="w-4 h-4" />
            <span className="text-sm font-medium">Supabase SQL Editor Required</span>
          </div>
          <a 
            href="https://supabase.com/dashboard/project/jkknllpbefpgtgzntgoh/sql" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Open SQL Editor</span>
          </a>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">SQL Script to Create Communications Table</h3>
          <button
            onClick={copyToClipboard}
            className={`flex items-center space-x-2 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              copied 
                ? 'bg-green-100 text-green-700' 
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            {copied ? (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy SQL</span>
              </>
            )}
          </button>
        </div>
        
        <div className="p-4">
          <pre className="text-sm text-gray-800 bg-gray-50 p-4 rounded-md overflow-auto max-h-96 border">
            <code>{sqlScript}</code>
          </pre>
        </div>
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-lg font-medium text-blue-900 mb-2">Instructions:</h4>
        <ol className="list-decimal list-inside text-blue-800 space-y-1">
          <li>Copy the SQL script above</li>
          <li>Open your Supabase dashboard</li>
          <li>Navigate to the SQL Editor</li>
          <li>Paste and run the script</li>
          <li>Refresh this page to use the communications feature</li>
        </ol>
      </div>
    </div>
  );
};

export default MissingCommunicationsTableNotice; 