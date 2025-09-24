-- Create missing child_app_user_sessions table for authentication flow
-- This table tracks user sessions across child applications

CREATE TABLE IF NOT EXISTS child_app_user_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    app_id TEXT NOT NULL,
    session_token TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
    is_active BOOLEAN DEFAULT true,
    user_agent TEXT,
    ip_address INET,
    device_info JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_child_app_user_sessions_user_app ON child_app_user_sessions(user_id, app_id);
CREATE INDEX IF NOT EXISTS idx_child_app_user_sessions_last_activity ON child_app_user_sessions(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_child_app_user_sessions_active ON child_app_user_sessions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_child_app_user_sessions_expires ON child_app_user_sessions(expires_at);

-- Enable RLS (Row Level Security)
ALTER TABLE child_app_user_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own sessions" ON child_app_user_sessions
    FOR SELECT USING (
        auth.uid() = user_id OR 
        EXISTS (
            SELECT 1 FROM admin_users 
            WHERE id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Users can insert their own sessions" ON child_app_user_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions" ON child_app_user_sessions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all sessions" ON child_app_user_sessions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users 
            WHERE id = auth.uid() AND is_active = true
        )
    );

-- Grant permissions
GRANT ALL ON child_app_user_sessions TO authenticated, service_role;

-- Create function to cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM child_app_user_sessions 
    WHERE expires_at < NOW() OR 
          (last_activity_at < NOW() - INTERVAL '30 days' AND is_active = false);
END;
$$;

-- Create trigger to update last_activity_at on any update
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.last_activity_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_session_activity
    BEFORE UPDATE ON child_app_user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_session_activity();

-- Insert some sample session data if needed for testing
INSERT INTO child_app_user_sessions (user_id, app_id, session_token, created_at, last_activity_at)
VALUES 
    ('f2362481-2473-4d3b-9689-7f8387aa1255', 'transport_management_system_menrm674', 'sample_session_token_1', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '10 minutes'),
    ('f2362481-2473-4d3b-9689-7f8387aa1255', 'transport_management_system_menrm674', 'sample_session_token_2', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 hour')
ON CONFLICT DO NOTHING;
