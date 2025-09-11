-- Enhanced Booking Controls for 7 PM Cutoff Implementation (Fixed Version)
-- This migration includes all necessary tables and functions

-- Step 1: Create booking_availability table if it doesn't exist
CREATE TABLE IF NOT EXISTS booking_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  availability_date DATE NOT NULL,
  is_booking_enabled BOOLEAN DEFAULT true,
  max_bookings_per_day INTEGER DEFAULT NULL,
  booking_window_hours INTEGER DEFAULT 24,
  special_instructions TEXT,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(route_id, availability_date)
);

-- Create indexes for booking_availability if they don't exist
CREATE INDEX IF NOT EXISTS idx_booking_availability_route_date ON booking_availability(route_id, availability_date);
CREATE INDEX IF NOT EXISTS idx_booking_availability_date ON booking_availability(availability_date);

-- Step 2: Add enhanced columns to schedules table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'is_booking_window_open') THEN
        ALTER TABLE schedules ADD COLUMN is_booking_window_open BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'booking_closes_at') THEN
        ALTER TABLE schedules ADD COLUMN booking_closes_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
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

-- Step 3: Add enhanced columns to booking_availability table
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

-- Step 4: Create enhanced booking functions
CREATE OR REPLACE FUNCTION is_admin_scheduling_enabled(
  p_route_id UUID,
  p_date DATE
) RETURNS BOOLEAN AS $$
DECLARE
  availability_record RECORD;
  schedule_record RECORD;
BEGIN
  SELECT * INTO availability_record
  FROM booking_availability
  WHERE route_id = p_route_id AND availability_date = p_date;
  
  IF FOUND THEN
    RETURN availability_record.admin_enabled;
  END IF;
  
  SELECT * INTO schedule_record
  FROM schedules
  WHERE route_id = p_route_id AND schedule_date = p_date;
  
  IF FOUND THEN
    RETURN schedule_record.admin_scheduling_enabled;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql;

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
  previous_day := p_date - INTERVAL '1 day';
  
  SELECT * INTO availability_record
  FROM booking_availability
  WHERE route_id = p_route_id AND availability_date = p_date;
  
  IF NOT FOUND THEN
    booking_start := previous_day + TIME '06:00:00';
    booking_deadline := previous_day + TIME '19:00:00';
  ELSE
    booking_start := previous_day + availability_record.booking_start_time;
    booking_deadline := previous_day + availability_record.cutoff_time;
  END IF;
  
  RETURN (p_current_time >= booking_start AND p_current_time <= booking_deadline);
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create trigger function for booking deadlines
CREATE OR REPLACE FUNCTION trigger_set_booking_deadline()
RETURNS TRIGGER AS $$
BEGIN
  NEW.booking_deadline := (NEW.schedule_date - INTERVAL '1 day') + TIME '19:00:00';
  
  IF NEW.total_seats IS NULL OR NEW.total_seats = 0 THEN
    NEW.total_seats := NEW.available_seats + COALESCE(NEW.booked_seats, 0);
  END IF;
  
  NEW.is_booking_window_open := CASE
    WHEN NOW() <= NEW.booking_deadline THEN true
    ELSE false
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create/replace triggers
DROP TRIGGER IF EXISTS trigger_schedules_booking_deadline ON schedules;

CREATE TRIGGER trigger_schedules_booking_deadline
  BEFORE INSERT OR UPDATE ON schedules
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_booking_deadline();

-- Step 7: Update existing schedules
UPDATE schedules 
SET 
  booking_deadline = (schedule_date - INTERVAL '1 day') + TIME '19:00:00',
  total_seats = CASE 
    WHEN total_seats IS NULL OR total_seats = 0 
    THEN available_seats + COALESCE(booked_seats, 0)
    ELSE total_seats 
  END,
  is_booking_window_open = CASE
    WHEN NOW() <= (schedule_date - INTERVAL '1 day') + TIME '19:00:00' THEN true
    ELSE false
  END
WHERE booking_deadline IS NULL;

-- Step 8: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_schedules_booking_enabled ON schedules(booking_enabled);
CREATE INDEX IF NOT EXISTS idx_schedules_admin_scheduling ON schedules(admin_scheduling_enabled);
CREATE INDEX IF NOT EXISTS idx_schedules_booking_deadline ON schedules(booking_deadline);
CREATE INDEX IF NOT EXISTS idx_booking_availability_admin_enabled ON booking_availability(admin_enabled); 