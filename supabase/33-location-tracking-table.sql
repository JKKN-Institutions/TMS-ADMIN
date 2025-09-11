-- =====================================================
-- Location Tracking Table Implementation
-- Records location data for each day, route, and driver
-- =====================================================

-- Create location tracking table for daily route tracking
CREATE TABLE IF NOT EXISTS location_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Core tracking information
    tracking_date DATE NOT NULL,
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    
    -- Location coordinates
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    accuracy DECIMAL(8,2), -- GPS accuracy in meters
    altitude DECIMAL(8,2), -- Altitude in meters
    
    -- Movement data
    speed DECIMAL(5,2), -- Speed in km/h
    heading DECIMAL(5,2), -- Direction in degrees (0-360)
    
    -- Timestamps
    tracking_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Additional metadata
    trip_id UUID, -- Optional: link to specific trip/schedule
    gps_device_id UUID REFERENCES gps_devices(id) ON DELETE SET NULL,
    
    -- Status and flags
    is_active BOOLEAN DEFAULT true,
    location_source VARCHAR(50) DEFAULT 'gps', -- 'gps', 'manual', 'estimated'
    data_quality VARCHAR(20) DEFAULT 'good', -- 'good', 'poor', 'estimated'
    
    -- Created and updated timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_location_tracking_date ON location_tracking(tracking_date);
CREATE INDEX IF NOT EXISTS idx_location_tracking_route ON location_tracking(route_id);
CREATE INDEX IF NOT EXISTS idx_location_tracking_driver ON location_tracking(driver_id);
CREATE INDEX IF NOT EXISTS idx_location_tracking_vehicle ON location_tracking(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_location_tracking_timestamp ON location_tracking(tracking_timestamp);
CREATE INDEX IF NOT EXISTS idx_location_tracking_route_date ON location_tracking(route_id, tracking_date);
CREATE INDEX IF NOT EXISTS idx_location_tracking_driver_date ON location_tracking(driver_id, tracking_date);
CREATE INDEX IF NOT EXISTS idx_location_tracking_route_driver_date ON location_tracking(route_id, driver_id, tracking_date);

-- Create unique constraint to prevent duplicate entries for same route/driver/timestamp
CREATE UNIQUE INDEX IF NOT EXISTS idx_location_tracking_unique 
ON location_tracking(route_id, driver_id, tracking_timestamp) 
WHERE is_active = true;

-- Add helpful comments
COMMENT ON TABLE location_tracking IS 'Daily location tracking records for routes, drivers, and vehicles';
COMMENT ON COLUMN location_tracking.tracking_date IS 'Date of the tracking record (for daily aggregation)';
COMMENT ON COLUMN location_tracking.route_id IS 'Route being tracked';
COMMENT ON COLUMN location_tracking.driver_id IS 'Driver operating the route';
COMMENT ON COLUMN location_tracking.vehicle_id IS 'Vehicle assigned to the route';
COMMENT ON COLUMN location_tracking.latitude IS 'GPS latitude coordinate';
COMMENT ON COLUMN location_tracking.longitude IS 'GPS longitude coordinate';
COMMENT ON COLUMN location_tracking.accuracy IS 'GPS accuracy in meters';
COMMENT ON COLUMN location_tracking.speed IS 'Vehicle speed in km/h';
COMMENT ON COLUMN location_tracking.heading IS 'Direction of travel in degrees (0-360)';
COMMENT ON COLUMN location_tracking.tracking_timestamp IS 'Exact timestamp when location was recorded';
COMMENT ON COLUMN location_tracking.location_source IS 'Source of location data (gps, manual, estimated)';
COMMENT ON COLUMN location_tracking.data_quality IS 'Quality indicator for the location data';

-- Create a view for easy access to daily tracking summaries
CREATE OR REPLACE VIEW daily_tracking_summary AS
SELECT 
    tracking_date,
    route_id,
    driver_id,
    vehicle_id,
    COUNT(*) as total_records,
    MIN(tracking_timestamp) as first_record,
    MAX(tracking_timestamp) as last_record,
    AVG(speed) as avg_speed,
    MAX(speed) as max_speed,
    AVG(accuracy) as avg_accuracy,
    COUNT(DISTINCT DATE_TRUNC('hour', tracking_timestamp)) as active_hours
FROM location_tracking
WHERE is_active = true
GROUP BY tracking_date, route_id, driver_id, vehicle_id;

COMMENT ON VIEW daily_tracking_summary IS 'Daily summary of location tracking data for routes, drivers, and vehicles';

-- Create a function to insert location tracking data with automatic date extraction
CREATE OR REPLACE FUNCTION insert_location_tracking(
    p_route_id UUID,
    p_driver_id UUID,
    p_vehicle_id UUID,
    p_latitude DECIMAL(10,8),
    p_longitude DECIMAL(11,8),
    p_accuracy DECIMAL(8,2),
    p_altitude DECIMAL(8,2),
    p_speed DECIMAL(5,2),
    p_heading DECIMAL(5,2),
    p_tracking_timestamp TIMESTAMP WITH TIME ZONE,
    p_trip_id UUID DEFAULT NULL,
    p_gps_device_id UUID DEFAULT NULL,
    p_location_source VARCHAR(50) DEFAULT 'gps',
    p_data_quality VARCHAR(20) DEFAULT 'good'
)
RETURNS UUID AS $$
DECLARE
    v_tracking_date DATE;
    v_location_tracking_id UUID;
BEGIN
    -- Extract date from timestamp
    v_tracking_date := DATE(p_tracking_timestamp);
    
    -- Insert location tracking record
    INSERT INTO location_tracking (
        tracking_date,
        route_id,
        driver_id,
        vehicle_id,
        latitude,
        longitude,
        accuracy,
        altitude,
        speed,
        heading,
        tracking_timestamp,
        trip_id,
        gps_device_id,
        location_source,
        data_quality
    ) VALUES (
        v_tracking_date,
        p_route_id,
        p_driver_id,
        p_vehicle_id,
        p_latitude,
        p_longitude,
        p_accuracy,
        p_altitude,
        p_speed,
        p_heading,
        p_tracking_timestamp,
        p_trip_id,
        p_gps_device_id,
        p_location_source,
        p_data_quality
    )
    ON CONFLICT (route_id, driver_id, tracking_timestamp) 
    WHERE is_active = true
    DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        accuracy = EXCLUDED.accuracy,
        altitude = EXCLUDED.altitude,
        speed = EXCLUDED.speed,
        heading = EXCLUDED.heading,
        vehicle_id = EXCLUDED.vehicle_id,
        trip_id = EXCLUDED.trip_id,
        gps_device_id = EXCLUDED.gps_device_id,
        location_source = EXCLUDED.location_source,
        data_quality = EXCLUDED.data_quality,
        updated_at = NOW()
    RETURNING id INTO v_location_tracking_id;
    
    RETURN v_location_tracking_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION insert_location_tracking IS 'Function to insert location tracking data with automatic date extraction and duplicate handling';
