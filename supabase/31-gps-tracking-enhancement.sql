-- =====================================================
-- GPS Tracking Enhancement for Routes
-- Adds GPS device management and live location tracking
-- =====================================================

-- Create GPS device status enum
DO $$ BEGIN
    CREATE TYPE gps_device_status AS ENUM ('active', 'inactive', 'offline', 'maintenance', 'error');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create GPS device table for device management
CREATE TABLE IF NOT EXISTS gps_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id VARCHAR(100) UNIQUE NOT NULL, -- Physical device identifier
    device_name VARCHAR(255) NOT NULL,
    device_model VARCHAR(100),
    sim_number VARCHAR(20),
    imei VARCHAR(20) UNIQUE,
    status gps_device_status DEFAULT 'inactive',
    battery_level INTEGER CHECK (battery_level >= 0 AND battery_level <= 100),
    signal_strength INTEGER CHECK (signal_strength >= 0 AND signal_strength <= 100),
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    installation_date DATE,
    last_maintenance DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add GPS tracking fields to routes table
DO $$ 
BEGIN
    -- GPS Device Assignment
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'routes' AND column_name = 'gps_device_id') THEN
        ALTER TABLE routes ADD COLUMN gps_device_id UUID REFERENCES gps_devices(id) ON DELETE SET NULL;
    END IF;

    -- Current Live GPS Location (different from static start/end coordinates)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'routes' AND column_name = 'current_latitude') THEN
        ALTER TABLE routes ADD COLUMN current_latitude DECIMAL(10,8);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'routes' AND column_name = 'current_longitude') THEN
        ALTER TABLE routes ADD COLUMN current_longitude DECIMAL(11,8);
    END IF;

    -- GPS Tracking Status and Metadata
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'routes' AND column_name = 'last_gps_update') THEN
        ALTER TABLE routes ADD COLUMN last_gps_update TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'routes' AND column_name = 'gps_speed') THEN
        ALTER TABLE routes ADD COLUMN gps_speed DECIMAL(5,2); -- Speed in km/h
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'routes' AND column_name = 'gps_heading') THEN
        ALTER TABLE routes ADD COLUMN gps_heading DECIMAL(5,2); -- Direction in degrees (0-360)
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'routes' AND column_name = 'gps_accuracy') THEN
        ALTER TABLE routes ADD COLUMN gps_accuracy DECIMAL(8,2); -- GPS accuracy in meters
    END IF;

    -- Tracking Status and Configuration
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'routes' AND column_name = 'live_tracking_enabled') THEN
        ALTER TABLE routes ADD COLUMN live_tracking_enabled BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'routes' AND column_name = 'tracking_interval') THEN
        ALTER TABLE routes ADD COLUMN tracking_interval INTEGER DEFAULT 30; -- Update interval in seconds
    END IF;
END $$;

-- Create GPS location history table for tracking route movement
CREATE TABLE IF NOT EXISTS gps_location_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    gps_device_id UUID REFERENCES gps_devices(id) ON DELETE SET NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    speed DECIMAL(5,2), -- km/h
    heading DECIMAL(5,2), -- degrees
    accuracy DECIMAL(8,2), -- meters
    altitude DECIMAL(8,2), -- meters above sea level
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    trip_id UUID, -- Optional: link to specific trip/schedule
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create GPS alerts table for tracking issues
CREATE TABLE IF NOT EXISTS gps_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
    gps_device_id UUID REFERENCES gps_devices(id) ON DELETE SET NULL,
    alert_type VARCHAR(50) NOT NULL, -- 'device_offline', 'low_battery', 'geofence_breach', 'speed_limit', etc.
    severity VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    alert_data JSONB, -- Additional alert metadata
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID REFERENCES admin_users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key constraint for GPS device assignment
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_routes_gps_device'
    ) THEN
        ALTER TABLE routes ADD CONSTRAINT fk_routes_gps_device 
        FOREIGN KEY (gps_device_id) REFERENCES gps_devices(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_gps_devices_device_id ON gps_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_gps_devices_status ON gps_devices(status);
CREATE INDEX IF NOT EXISTS idx_routes_gps_device ON routes(gps_device_id);
CREATE INDEX IF NOT EXISTS idx_routes_current_location ON routes(current_latitude, current_longitude);
CREATE INDEX IF NOT EXISTS idx_routes_live_tracking ON routes(live_tracking_enabled);
CREATE INDEX IF NOT EXISTS idx_gps_location_history_route ON gps_location_history(route_id);
CREATE INDEX IF NOT EXISTS idx_gps_location_history_timestamp ON gps_location_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_gps_location_history_device ON gps_location_history(gps_device_id);
CREATE INDEX IF NOT EXISTS idx_gps_alerts_route ON gps_alerts(route_id);
CREATE INDEX IF NOT EXISTS idx_gps_alerts_unresolved ON gps_alerts(resolved) WHERE resolved = false;

-- Add updated_at trigger for gps_devices
CREATE TRIGGER update_gps_devices_updated_at 
    BEFORE UPDATE ON gps_devices 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample GPS devices for testing (optional)
INSERT INTO gps_devices (device_id, device_name, device_model, status) VALUES
('GPS001', 'Primary Bus Tracker', 'TrackMax Pro 4G', 'active'),
('GPS002', 'Secondary Bus Tracker', 'TrackMax Pro 4G', 'active'),
('GPS003', 'Backup GPS Unit', 'BasicTrack 3G', 'inactive')
ON CONFLICT (device_id) DO NOTHING;

-- Add helpful comments
COMMENT ON TABLE gps_devices IS 'GPS tracking devices available for route assignment';
COMMENT ON TABLE gps_location_history IS 'Historical GPS location data for route tracking and analytics';
COMMENT ON TABLE gps_alerts IS 'GPS-related alerts and notifications for route monitoring';
COMMENT ON COLUMN routes.gps_device_id IS 'Assigned GPS device for live tracking';
COMMENT ON COLUMN routes.current_latitude IS 'Current live GPS latitude (updates in real-time)';
COMMENT ON COLUMN routes.current_longitude IS 'Current live GPS longitude (updates in real-time)';
COMMENT ON COLUMN routes.last_gps_update IS 'Timestamp of last GPS location update';
COMMENT ON COLUMN routes.live_tracking_enabled IS 'Whether real-time GPS tracking is enabled for this route';

-- Migration complete message
SELECT 'GPS tracking enhancement migration completed successfully!' as message; 