-- =====================================================
-- MERCYDA GPS Integration Enhancement
-- Adds support for third-party GPS service integration
-- =====================================================

-- Create settings table for system configuration
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create GPS sync logs table for tracking synchronization
CREATE TABLE IF NOT EXISTS gps_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service VARCHAR(50) NOT NULL, -- 'mercyda', 'closeGuard', etc.
    status VARCHAR(20) NOT NULL, -- 'success', 'error', 'partial'
    devices_updated INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    errors JSONB, -- Array of error messages
    sync_time TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_ms INTEGER, -- Sync duration in milliseconds
    details JSONB, -- Additional sync details
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default MERCYDA settings
INSERT INTO settings (key, value, description) VALUES
    ('mercyda_auto_sync_enabled', 'false', 'Enable automatic synchronization with MERCYDA GPS service'),
    ('mercyda_sync_interval', '300', 'Sync interval in seconds (default: 5 minutes)'),
    ('mercyda_base_url', 'https://console.mercydatrack.com/api', 'MERCYDA API base URL'),
    ('mercyda_username', 'ats@jkkn.org', 'MERCYDA service username'),
    ('mercyda_password_encrypted', '', 'Encrypted MERCYDA password (to be set securely)')
ON CONFLICT (key) DO NOTHING;

-- Add MERCYDA GPS device if not exists
INSERT INTO gps_devices (
    device_id,
    device_name,
    device_model,
    sim_number,
    imei,
    status,
    notes,
    created_at,
    updated_at
) VALUES (
    'MERCYDA001',
    'MERCYDA Bus Tracker',
    'MERCYDA TRACKING',
    NULL,
    NULL,
    'active',
    'MERCYDA third-party GPS service integration for JKKN transport. Username: ats@jkkn.org. This device represents the MERCYDA tracking service API integration.',
    NOW(),
    NOW()
) ON CONFLICT (device_id) DO UPDATE SET
    device_name = EXCLUDED.device_name,
    device_model = EXCLUDED.device_model,
    notes = EXCLUDED.notes,
    updated_at = NOW();

-- Create index for faster sync log queries
CREATE INDEX IF NOT EXISTS idx_gps_sync_logs_service_time ON gps_sync_logs(service, sync_time DESC);
CREATE INDEX IF NOT EXISTS idx_gps_sync_logs_status ON gps_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- Add function to clean up old sync logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_sync_logs()
RETURNS void
LANGUAGE sql
AS $$
    DELETE FROM gps_sync_logs 
    WHERE created_at < NOW() - INTERVAL '30 days';
$$;

-- Create view for sync status dashboard
CREATE OR REPLACE VIEW gps_sync_status AS
SELECT 
    service,
    COUNT(*) as total_syncs,
    COUNT(*) FILTER (WHERE status = 'success') as successful_syncs,
    COUNT(*) FILTER (WHERE status = 'error') as failed_syncs,
    MAX(sync_time) as last_sync,
    AVG(devices_updated) as avg_devices_updated,
    SUM(devices_updated) as total_devices_updated
FROM gps_sync_logs
WHERE sync_time > NOW() - INTERVAL '7 days'
GROUP BY service;

-- Add trigger to update settings updated_at
CREATE OR REPLACE FUNCTION update_settings_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER settings_updated_at_trigger
    BEFORE UPDATE ON settings
    FOR EACH ROW
    EXECUTE FUNCTION update_settings_timestamp();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON settings TO authenticated;
GRANT SELECT, INSERT ON gps_sync_logs TO authenticated;
GRANT SELECT ON gps_sync_status TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE settings IS 'System configuration settings for GPS integrations and other features';
COMMENT ON TABLE gps_sync_logs IS 'Logs for GPS data synchronization from external services';
COMMENT ON VIEW gps_sync_status IS 'Dashboard view for GPS synchronization status and statistics';

-- Query to verify setup
SELECT 
    'MERCYDA GPS Integration Setup Complete' as status,
    (SELECT COUNT(*) FROM gps_devices WHERE device_id = 'MERCYDA001') as mercyda_device_created,
    (SELECT COUNT(*) FROM settings WHERE key LIKE 'mercyda_%') as mercyda_settings_created; 