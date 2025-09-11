-- =====================================================
-- Move GPS Device Assignment from Routes to Vehicles
-- This corrects the logical structure: GPS devices belong to vehicles, not routes
-- =====================================================

-- Add GPS tracking fields to vehicles table
DO $$ 
BEGIN
    -- GPS Device Assignment
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'vehicles' AND column_name = 'gps_device_id') THEN
        ALTER TABLE vehicles ADD COLUMN gps_device_id UUID REFERENCES gps_devices(id) ON DELETE SET NULL;
    END IF;

    -- Current Live GPS Location
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'vehicles' AND column_name = 'current_latitude') THEN
        ALTER TABLE vehicles ADD COLUMN current_latitude DECIMAL(10,8);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'vehicles' AND column_name = 'current_longitude') THEN
        ALTER TABLE vehicles ADD COLUMN current_longitude DECIMAL(11,8);
    END IF;

    -- GPS Tracking Status and Metadata
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'vehicles' AND column_name = 'last_gps_update') THEN
        ALTER TABLE vehicles ADD COLUMN last_gps_update TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'vehicles' AND column_name = 'gps_speed') THEN
        ALTER TABLE vehicles ADD COLUMN gps_speed DECIMAL(5,2); -- Speed in km/h
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'vehicles' AND column_name = 'gps_heading') THEN
        ALTER TABLE vehicles ADD COLUMN gps_heading DECIMAL(5,2); -- Direction in degrees (0-360)
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'vehicles' AND column_name = 'gps_accuracy') THEN
        ALTER TABLE vehicles ADD COLUMN gps_accuracy DECIMAL(8,2); -- GPS accuracy in meters
    END IF;

    -- Tracking Status and Configuration
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'vehicles' AND column_name = 'live_tracking_enabled') THEN
        ALTER TABLE vehicles ADD COLUMN live_tracking_enabled BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'vehicles' AND column_name = 'tracking_interval') THEN
        ALTER TABLE vehicles ADD COLUMN tracking_interval INTEGER DEFAULT 30; -- Update interval in seconds
    END IF;
END $$;

-- Migrate existing GPS data from routes to vehicles (if any exists)
DO $$
BEGIN
    -- Move GPS device assignments from routes to their assigned vehicles
    UPDATE vehicles 
    SET 
        gps_device_id = routes.gps_device_id,
        current_latitude = routes.current_latitude,
        current_longitude = routes.current_longitude,
        last_gps_update = routes.last_gps_update,
        gps_speed = routes.gps_speed,
        gps_heading = routes.gps_heading,
        gps_accuracy = routes.gps_accuracy,
        live_tracking_enabled = routes.live_tracking_enabled,
        tracking_interval = routes.tracking_interval
    FROM routes 
    WHERE vehicles.id = routes.vehicle_id 
    AND routes.gps_device_id IS NOT NULL;
    
    -- Note: We don't automatically drop the columns from routes table 
    -- to allow for manual verification and rollback if needed
END $$;

-- Update GPS location history to reference vehicles instead of routes
DO $$
BEGIN
    -- Add vehicle_id column to gps_location_history if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'gps_location_history' AND column_name = 'vehicle_id') THEN
        ALTER TABLE gps_location_history ADD COLUMN vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;
    END IF;

    -- Populate vehicle_id from route assignments
    UPDATE gps_location_history 
    SET vehicle_id = routes.vehicle_id
    FROM routes 
    WHERE gps_location_history.route_id = routes.id 
    AND routes.vehicle_id IS NOT NULL;
END $$;

-- Update GPS alerts to reference vehicles
DO $$
BEGIN
    -- Add vehicle_id column to gps_alerts if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'gps_alerts' AND column_name = 'vehicle_id') THEN
        ALTER TABLE gps_alerts ADD COLUMN vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;
    END IF;

    -- Populate vehicle_id from route assignments
    UPDATE gps_alerts 
    SET vehicle_id = routes.vehicle_id
    FROM routes 
    WHERE gps_alerts.route_id = routes.id 
    AND routes.vehicle_id IS NOT NULL;
END $$;

-- Add foreign key constraint for GPS device assignment to vehicles
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_vehicles_gps_device'
    ) THEN
        ALTER TABLE vehicles ADD CONSTRAINT fk_vehicles_gps_device 
        FOREIGN KEY (gps_device_id) REFERENCES gps_devices(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create indexes for performance on vehicles table
CREATE INDEX IF NOT EXISTS idx_vehicles_gps_device ON vehicles(gps_device_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_current_location ON vehicles(current_latitude, current_longitude);
CREATE INDEX IF NOT EXISTS idx_vehicles_live_tracking ON vehicles(live_tracking_enabled);
CREATE INDEX IF NOT EXISTS idx_gps_location_history_vehicle ON gps_location_history(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_gps_alerts_vehicle ON gps_alerts(vehicle_id);

-- Add helpful comments
COMMENT ON COLUMN vehicles.gps_device_id IS 'Assigned GPS device for live tracking of this vehicle';
COMMENT ON COLUMN vehicles.current_latitude IS 'Current live GPS latitude of the vehicle';
COMMENT ON COLUMN vehicles.current_longitude IS 'Current live GPS longitude of the vehicle';
COMMENT ON COLUMN vehicles.last_gps_update IS 'Timestamp of last GPS location update for this vehicle';
COMMENT ON COLUMN vehicles.live_tracking_enabled IS 'Whether real-time GPS tracking is enabled for this vehicle';

-- Create a view to easily get GPS data for routes through their assigned vehicles
CREATE OR REPLACE VIEW route_gps_data AS
SELECT 
    r.id as route_id,
    r.route_number,
    r.route_name,
    r.vehicle_id,
    v.registration_number,
    v.gps_device_id,
    v.current_latitude,
    v.current_longitude,
    v.last_gps_update,
    v.gps_speed,
    v.gps_heading,
    v.gps_accuracy,
    v.live_tracking_enabled,
    v.tracking_interval,
    gd.device_id,
    gd.device_name,
    gd.status as device_status,
    gd.last_heartbeat as device_last_heartbeat
FROM routes r
LEFT JOIN vehicles v ON r.vehicle_id = v.id
LEFT JOIN gps_devices gd ON v.gps_device_id = gd.id;

COMMENT ON VIEW route_gps_data IS 'Consolidated view of GPS data for routes through their assigned vehicles';

-- =====================================================
-- IMPORTANT: Manual cleanup steps after verification
-- =====================================================

-- After verifying the migration worked correctly, you can remove GPS columns from routes table:
-- 
-- ALTER TABLE routes DROP COLUMN IF EXISTS gps_device_id;
-- ALTER TABLE routes DROP COLUMN IF EXISTS current_latitude;
-- ALTER TABLE routes DROP COLUMN IF EXISTS current_longitude;
-- ALTER TABLE routes DROP COLUMN IF EXISTS last_gps_update;
-- ALTER TABLE routes DROP COLUMN IF EXISTS gps_speed;
-- ALTER TABLE routes DROP COLUMN IF EXISTS gps_heading;
-- ALTER TABLE routes DROP COLUMN IF EXISTS gps_accuracy;
-- ALTER TABLE routes DROP COLUMN IF EXISTS live_tracking_enabled;
-- ALTER TABLE routes DROP COLUMN IF EXISTS tracking_interval;

-- Migration complete message
SELECT 'GPS device assignment moved from routes to vehicles successfully!' as message; 