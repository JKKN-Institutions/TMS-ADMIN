-- Booking Availability Management
-- This file adds support for admin-controlled booking availability

-- Create booking availability table
CREATE TABLE booking_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  availability_date DATE NOT NULL,
  is_booking_enabled BOOLEAN DEFAULT true,
  max_bookings_per_day INTEGER DEFAULT NULL, -- NULL means use route capacity
  booking_window_hours INTEGER DEFAULT 24, -- Hours before departure that booking closes
  special_instructions TEXT,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(route_id, availability_date)
);

-- Create index for efficient queries
CREATE INDEX idx_booking_availability_route_date ON booking_availability(route_id, availability_date);
CREATE INDEX idx_booking_availability_date ON booking_availability(availability_date);

-- Add booking availability tracking to schedules table
ALTER TABLE schedules 
ADD COLUMN is_booking_window_open BOOLEAN DEFAULT true,
ADD COLUMN booking_closes_at TIMESTAMP WITH TIME ZONE;

-- Update existing schedules to set booking window status
UPDATE schedules 
SET 
  is_booking_window_open = CASE 
    WHEN (schedule_date + departure_time) > NOW() + INTERVAL '1 hour' THEN true 
    ELSE false 
  END,
  booking_closes_at = (schedule_date + departure_time) - INTERVAL '1 hour';

-- Create function to check if booking is available for a route on a specific date
CREATE OR REPLACE FUNCTION is_booking_available(
  p_route_id UUID,
  p_date DATE
) RETURNS BOOLEAN AS $$
DECLARE
  availability_record RECORD;
  route_capacity INTEGER;
  current_bookings INTEGER;
BEGIN
  -- Get availability record
  SELECT * INTO availability_record
  FROM booking_availability
  WHERE route_id = p_route_id AND availability_date = p_date;
  
  -- If no specific availability record, check default route settings
  IF NOT FOUND THEN
    -- Default is that booking is available unless route is inactive
    SELECT total_capacity INTO route_capacity
    FROM routes
    WHERE id = p_route_id AND status = 'active';
    
    IF NOT FOUND THEN
      RETURN false; -- Route doesn't exist or is inactive
    END IF;
    
    RETURN true; -- Default availability
  END IF;
  
  -- If booking is explicitly disabled, return false
  IF NOT availability_record.is_booking_enabled THEN
    RETURN false;
  END IF;
  
  -- Check if max bookings per day is exceeded
  IF availability_record.max_bookings_per_day IS NOT NULL THEN
    SELECT COUNT(*) INTO current_bookings
    FROM bookings b
    INNER JOIN schedules s ON b.schedule_id = s.id
    WHERE s.route_id = p_route_id 
      AND s.schedule_date = p_date
      AND b.status = 'confirmed';
    
    IF current_bookings >= availability_record.max_bookings_per_day THEN
      RETURN false;
    END IF;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Create function to update booking window status for schedules
CREATE OR REPLACE FUNCTION update_booking_window_status() RETURNS void AS $$
BEGIN
  -- Update is_booking_window_open based on current time and booking window
  UPDATE schedules
  SET is_booking_window_open = CASE
    WHEN (schedule_date + departure_time) > NOW() + INTERVAL '1 hour' THEN true
    ELSE false
  END,
  booking_closes_at = (schedule_date + departure_time) - INTERVAL '1 hour'
  WHERE schedule_date >= CURRENT_DATE - INTERVAL '1 day'; -- Only update recent/future schedules
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update booking window status
CREATE OR REPLACE FUNCTION trigger_update_booking_window()
RETURNS TRIGGER AS $$
BEGIN
  -- Update booking window status when schedules are modified
  NEW.is_booking_window_open := CASE
    WHEN (NEW.schedule_date + NEW.departure_time) > NOW() + INTERVAL '1 hour' THEN true
    ELSE false
  END;
  
  NEW.booking_closes_at := (NEW.schedule_date + NEW.departure_time) - INTERVAL '1 hour';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_schedules_booking_window
  BEFORE INSERT OR UPDATE ON schedules
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_booking_window();

-- Insert default booking availability for next 30 days for all active routes
INSERT INTO booking_availability (route_id, availability_date, is_booking_enabled, created_at, updated_at)
SELECT 
  r.id,
  CURRENT_DATE + generate_series(0, 29) as availability_date,
  true,
  NOW(),
  NOW()
FROM routes r
WHERE r.status = 'active'
ON CONFLICT (route_id, availability_date) DO NOTHING;

-- Add comments
COMMENT ON TABLE booking_availability IS 'Manages booking availability for routes on specific dates';
COMMENT ON COLUMN booking_availability.is_booking_enabled IS 'Whether booking is enabled for this route on this date';
COMMENT ON COLUMN booking_availability.max_bookings_per_day IS 'Maximum bookings allowed per day (NULL = use route capacity)';
COMMENT ON COLUMN booking_availability.booking_window_hours IS 'Hours before departure that booking closes';
COMMENT ON FUNCTION is_booking_available(UUID, DATE) IS 'Checks if booking is available for a route on a specific date';
COMMENT ON FUNCTION update_booking_window_status() IS 'Updates booking window status for all schedules'; 