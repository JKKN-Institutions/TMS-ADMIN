-- Migration: Add Driver Location Tracking
-- Description: Adds location tracking columns to the drivers table for live location sharing

-- Add location tracking columns to drivers table
DO $$ 
BEGIN
    -- Add current location coordinates
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'drivers' AND column_name = 'current_latitude') THEN
        ALTER TABLE drivers ADD COLUMN current_latitude DECIMAL(10,8);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'drivers' AND column_name = 'current_longitude') THEN
        ALTER TABLE drivers ADD COLUMN current_longitude DECIMAL(11,8);
    END IF;

    -- Add location tracking metadata
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'drivers' AND column_name = 'location_accuracy') THEN
        ALTER TABLE drivers ADD COLUMN location_accuracy INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'drivers' AND column_name = 'location_timestamp') THEN
        ALTER TABLE drivers ADD COLUMN location_timestamp TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'drivers' AND column_name = 'location_enabled') THEN
        ALTER TABLE drivers ADD COLUMN location_enabled BOOLEAN DEFAULT false;
    END IF;

    -- Add location sharing settings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'drivers' AND column_name = 'location_sharing_enabled') THEN
        ALTER TABLE drivers ADD COLUMN location_sharing_enabled BOOLEAN DEFAULT false;
    END IF;

    -- Add last location update timestamp
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'drivers' AND column_name = 'last_location_update') THEN
        ALTER TABLE drivers ADD COLUMN last_location_update TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add location tracking status
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'drivers' AND column_name = 'location_tracking_status') THEN
        ALTER TABLE drivers ADD COLUMN location_tracking_status VARCHAR(50) DEFAULT 'inactive';
    END IF;

END $$;

-- Create indexes for efficient location queries
CREATE INDEX IF NOT EXISTS idx_drivers_current_location ON drivers(current_latitude, current_longitude);
CREATE INDEX IF NOT EXISTS idx_drivers_location_timestamp ON drivers(location_timestamp);
CREATE INDEX IF NOT EXISTS idx_drivers_location_enabled ON drivers(location_enabled);
CREATE INDEX IF NOT EXISTS idx_drivers_location_sharing_enabled ON drivers(location_sharing_enabled);

-- Add comments for documentation
COMMENT ON COLUMN drivers.current_latitude IS 'Current live GPS latitude of the driver';
COMMENT ON COLUMN drivers.current_longitude IS 'Current live GPS longitude of the driver';
COMMENT ON COLUMN drivers.location_accuracy IS 'GPS accuracy in meters for the current location';
COMMENT ON COLUMN drivers.location_timestamp IS 'Timestamp when the current location was recorded';
COMMENT ON COLUMN drivers.location_enabled IS 'Whether location tracking is enabled for this driver';
COMMENT ON COLUMN drivers.location_sharing_enabled IS 'Whether location sharing is enabled for this driver';
COMMENT ON COLUMN drivers.last_location_update IS 'Timestamp of the last location update';
COMMENT ON COLUMN drivers.location_tracking_status IS 'Current status of location tracking (active, inactive, paused)';
