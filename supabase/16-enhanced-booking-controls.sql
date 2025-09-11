-- Enhanced Booking Controls for 7 PM Cutoff Implementation
-- This migration adds enhanced admin controls for scheduling with 7 PM cutoff the day before trip

-- Add enhanced booking control columns to schedules table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'booking_enabled') THEN
        ALTER TABLE schedules ADD COLUMN booking_enabled BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'booking_deadline') THEN
        ALTER TABLE schedules ADD COLUMN booking_deadline TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'admin_scheduling_enabled') THEN
        ALTER TABLE schedules ADD COLUMN admin_scheduling_enabled BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'scheduling_instructions') THEN
        ALTER TABLE schedules ADD COLUMN scheduling_instructions TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'total_seats') THEN
        ALTER TABLE schedules ADD COLUMN total_seats INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add enhanced booking control columns to booking_availability table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_availability' AND column_name = 'admin_enabled') THEN
        ALTER TABLE booking_availability ADD COLUMN admin_enabled BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_availability' AND column_name = 'cutoff_time') THEN
        ALTER TABLE booking_availability ADD COLUMN cutoff_time TIME DEFAULT '19:00:00';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_availability' AND column_name = 'booking_start_time') THEN
        ALTER TABLE booking_availability ADD COLUMN booking_start_time TIME DEFAULT '06:00:00';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_availability' AND column_name = 'requires_admin_approval') THEN
        ALTER TABLE booking_availability ADD COLUMN requires_admin_approval BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Create function to check admin-controlled scheduling availability
CREATE OR REPLACE FUNCTION is_admin_scheduling_enabled(
  p_route_id UUID,
  p_date DATE
) RETURNS BOOLEAN AS $$
DECLARE
  availability_record RECORD;
  schedule_record RECORD;
BEGIN
  -- Check if there's a specific availability record for this route and date
  SELECT * INTO availability_record
  FROM booking_availability
  WHERE route_id = p_route_id AND availability_date = p_date;
  
  -- If found, check if admin has enabled scheduling
  IF FOUND THEN
    RETURN availability_record.admin_enabled;
  END IF;
  
  -- Check if schedule exists and has admin scheduling enabled
  SELECT * INTO schedule_record
  FROM schedules
  WHERE route_id = p_route_id AND schedule_date = p_date;
  
  IF FOUND THEN
    RETURN schedule_record.admin_scheduling_enabled;
  END IF;
  
  -- Default: not enabled (requires admin approval)
  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Create function to check if booking is within 7 PM deadline
CREATE OR REPLACE FUNCTION is_within_booking_deadline(
  p_route_id UUID,
  p_date DATE,
  p_current_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) RETURNS BOOLEAN AS $$
DECLARE
  availability_record RECORD;
  booking_deadline TIMESTAMP WITH TIME ZONE;
  booking_start TIMESTAMP WITH TIME ZONE;
  previous_day DATE;
BEGIN
  -- Calculate the previous day (booking day)
  previous_day := p_date - INTERVAL '1 day';
  
  -- Get availability record for cutoff times
  SELECT * INTO availability_record
  FROM booking_availability
  WHERE route_id = p_route_id AND availability_date = p_date;
  
  -- Set default times if no specific record found
  IF NOT FOUND THEN
    -- Default: 6 AM to 7 PM the day before
    booking_start := previous_day + TIME '06:00:00';
    booking_deadline := previous_day + TIME '19:00:00';
  ELSE
    -- Use configured times
    booking_start := previous_day + availability_record.booking_start_time;
    booking_deadline := previous_day + availability_record.cutoff_time;
  END IF;
  
  -- Check if current time is within booking window
  RETURN (p_current_time >= booking_start AND p_current_time <= booking_deadline);
END;
$$ LANGUAGE plpgsql;

-- Create enhanced booking availability check function
CREATE OR REPLACE FUNCTION check_booking_availability(
  p_route_id UUID,
  p_date DATE,
  p_current_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) RETURNS JSONB AS $$
DECLARE
  result JSONB;
  admin_enabled BOOLEAN;
  within_deadline BOOLEAN;
  schedule_exists BOOLEAN;
  route_active BOOLEAN;
  availability_record RECORD;
  previous_day DATE;
  booking_start TIMESTAMP WITH TIME ZONE;
  booking_deadline TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Initialize result
  result := jsonb_build_object(
    'available', false,
    'reason', 'Booking not available',
    'admin_enabled', false,
    'within_deadline', false,
    'booking_window', null
  );
  
  -- Check if route is active
  SELECT (status = 'active') INTO route_active
  FROM routes
  WHERE id = p_route_id;
  
  IF NOT route_active THEN
    result := jsonb_set(result, '{reason}', '"Route is not active"');
    RETURN result;
  END IF;
  
  -- Check if schedule exists
  SELECT EXISTS(
    SELECT 1 FROM schedules 
    WHERE route_id = p_route_id AND schedule_date = p_date
  ) INTO schedule_exists;
  
  IF NOT schedule_exists THEN
    result := jsonb_set(result, '{reason}', '"No schedule found for this date"');
    RETURN result;
  END IF;
  
  -- Check admin scheduling enablement
  admin_enabled := is_admin_scheduling_enabled(p_route_id, p_date);
  result := jsonb_set(result, '{admin_enabled}', to_jsonb(admin_enabled));
  
  IF NOT admin_enabled THEN
    result := jsonb_set(result, '{reason}', '"Scheduling not enabled by admin for this trip"');
    RETURN result;
  END IF;
  
  -- Check deadline
  within_deadline := is_within_booking_deadline(p_route_id, p_date, p_current_time);
  result := jsonb_set(result, '{within_deadline}', to_jsonb(within_deadline));
  
  -- Get booking window details
  previous_day := p_date - INTERVAL '1 day';
  SELECT * INTO availability_record
  FROM booking_availability
  WHERE route_id = p_route_id AND availability_date = p_date;
  
  IF FOUND THEN
    booking_start := previous_day + availability_record.booking_start_time;
    booking_deadline := previous_day + availability_record.cutoff_time;
  ELSE
    booking_start := previous_day + TIME '06:00:00';
    booking_deadline := previous_day + TIME '19:00:00';
  END IF;
  
  result := jsonb_set(result, '{booking_window}', jsonb_build_object(
    'start', booking_start,
    'end', booking_deadline,
    'booking_date', previous_day
  ));
  
  IF NOT within_deadline THEN
    IF p_current_time < booking_start THEN
      result := jsonb_set(result, '{reason}', '"Booking window has not opened yet"');
    ELSE
      result := jsonb_set(result, '{reason}', '"Booking deadline has passed (7 PM cutoff)"');
    END IF;
    RETURN result;
  END IF;
  
  -- All checks passed
  result := jsonb_set(result, '{available}', 'true');
  result := jsonb_set(result, '{reason}', '"Booking available"');
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Update existing schedules to set proper booking deadlines
UPDATE schedules 
SET 
  booking_deadline = (schedule_date - INTERVAL '1 day') + TIME '19:00:00',
  total_seats = available_seats + booked_seats
WHERE booking_deadline IS NULL;

-- Create trigger to automatically set booking deadlines for new schedules
CREATE OR REPLACE FUNCTION trigger_set_booking_deadline()
RETURNS TRIGGER AS $$
BEGIN
  -- Set booking deadline to 7 PM the day before trip
  NEW.booking_deadline := (NEW.schedule_date - INTERVAL '1 day') + TIME '19:00:00';
  
  -- Set total seats if not provided
  IF NEW.total_seats IS NULL OR NEW.total_seats = 0 THEN
    NEW.total_seats := NEW.available_seats + COALESCE(NEW.booked_seats, 0);
  END IF;
  
  -- Set booking window status
  NEW.is_booking_window_open := CASE
    WHEN NOW() <= NEW.booking_deadline THEN true
    ELSE false
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_schedules_booking_deadline
  BEFORE INSERT OR UPDATE ON schedules
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_booking_deadline();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_schedules_booking_enabled ON schedules(booking_enabled);
CREATE INDEX IF NOT EXISTS idx_schedules_admin_scheduling ON schedules(admin_scheduling_enabled);
CREATE INDEX IF NOT EXISTS idx_schedules_booking_deadline ON schedules(booking_deadline);
CREATE INDEX IF NOT EXISTS idx_booking_availability_admin_enabled ON booking_availability(admin_enabled);

-- Add comments
COMMENT ON COLUMN schedules.booking_enabled IS 'Whether booking is enabled for this specific schedule';
COMMENT ON COLUMN schedules.booking_deadline IS 'Deadline for booking this schedule (7 PM the day before)';
COMMENT ON COLUMN schedules.admin_scheduling_enabled IS 'Whether admin has enabled scheduling for this trip';
COMMENT ON COLUMN schedules.scheduling_instructions IS 'Special instructions from admin for this schedule';
COMMENT ON COLUMN schedules.total_seats IS 'Total seats available in the vehicle for this schedule';

COMMENT ON COLUMN booking_availability.admin_enabled IS 'Whether admin has enabled scheduling for this route on this date';
COMMENT ON COLUMN booking_availability.cutoff_time IS 'Time when booking closes (default 7 PM)';
COMMENT ON COLUMN booking_availability.booking_start_time IS 'Time when booking opens (default 6 AM)';
COMMENT ON COLUMN booking_availability.requires_admin_approval IS 'Whether this route requires admin approval for scheduling';

COMMENT ON FUNCTION is_admin_scheduling_enabled(UUID, DATE) IS 'Checks if admin has enabled scheduling for a specific route and date';
COMMENT ON FUNCTION is_within_booking_deadline(UUID, DATE, TIMESTAMP WITH TIME ZONE) IS 'Checks if current time is within booking deadline (7 PM cutoff)';
COMMENT ON FUNCTION check_booking_availability(UUID, DATE, TIMESTAMP WITH TIME ZONE) IS 'Comprehensive booking availability check with admin controls and deadline validation'; 