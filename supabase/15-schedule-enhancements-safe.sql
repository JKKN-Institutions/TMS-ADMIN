-- Schedule System Enhancements for PostgreSQL/Supabase (Safe Version)
-- This migration adds improvements to support the new admin-passenger alignment
-- Handles existing columns/constraints gracefully

-- 1. Add columns only if they don't exist
DO $$
BEGIN
  -- Add total_seats column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedules' AND column_name = 'total_seats'
  ) THEN
    ALTER TABLE schedules ADD COLUMN total_seats INTEGER;
  END IF;

  -- Add booking_enabled column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedules' AND column_name = 'booking_enabled'
  ) THEN
    ALTER TABLE schedules ADD COLUMN booking_enabled BOOLEAN DEFAULT true;
  END IF;

  -- Add booking_deadline column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedules' AND column_name = 'booking_deadline'
  ) THEN
    ALTER TABLE schedules ADD COLUMN booking_deadline TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Add special_instructions column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedules' AND column_name = 'special_instructions'
  ) THEN
    ALTER TABLE schedules ADD COLUMN special_instructions TEXT;
  END IF;
END $$;

-- 2. Update total_seats for existing records
UPDATE schedules 
SET total_seats = available_seats + COALESCE(booked_seats, 0)
WHERE total_seats IS NULL;

-- 3. Set booking_deadline for existing schedules
UPDATE schedules 
SET booking_deadline = schedule_date + departure_time - INTERVAL '1 hour'
WHERE booking_deadline IS NULL;

-- 4. Add constraints only if they don't exist
DO $$
BEGIN
  -- Add seats positive constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'schedules' AND constraint_name = 'chk_seats_positive'
  ) THEN
    ALTER TABLE schedules ADD CONSTRAINT chk_seats_positive 
      CHECK (available_seats >= 0 AND booked_seats >= 0);
  END IF;

  -- Add seats logical constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'schedules' AND constraint_name = 'chk_seats_logical'
  ) THEN
    ALTER TABLE schedules ADD CONSTRAINT chk_seats_logical 
      CHECK (available_seats + booked_seats <= total_seats);
  END IF;

  -- Add unique booking constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'bookings' AND constraint_name = 'unique_student_schedule'
  ) THEN
    ALTER TABLE bookings ADD CONSTRAINT unique_student_schedule 
      UNIQUE (student_id, schedule_id);
  END IF;
END $$;

-- 5. Create indexes only if they don't exist
CREATE INDEX IF NOT EXISTS idx_schedules_date_route ON schedules(schedule_date, route_id);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);
CREATE INDEX IF NOT EXISTS idx_bookings_student_date ON bookings(student_id, trip_date);
CREATE INDEX IF NOT EXISTS idx_bookings_schedule_status ON bookings(schedule_id, status);
CREATE INDEX IF NOT EXISTS idx_schedules_booking_enabled ON schedules(booking_enabled);
CREATE INDEX IF NOT EXISTS idx_schedules_booking_deadline ON schedules(booking_deadline);

-- 6. Create or replace the seat management function
CREATE OR REPLACE FUNCTION update_schedule_seats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE schedules 
    SET 
      booked_seats = booked_seats + 1,
      available_seats = available_seats - 1,
      updated_at = NOW()
    WHERE id = NEW.schedule_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE schedules 
    SET 
      booked_seats = booked_seats - 1,
      available_seats = available_seats + 1,
      updated_at = NOW()
    WHERE id = OLD.schedule_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('confirmed', 'pending') AND NEW.status IN ('cancelled', 'no_show') THEN
      UPDATE schedules 
      SET 
        booked_seats = booked_seats - 1,
        available_seats = available_seats + 1,
        updated_at = NOW()
      WHERE id = NEW.schedule_id;
    ELSIF OLD.status IN ('cancelled', 'no_show') AND NEW.status IN ('confirmed', 'pending') THEN
      UPDATE schedules 
      SET 
        booked_seats = booked_seats + 1,
        available_seats = available_seats - 1,
        updated_at = NOW()
      WHERE id = NEW.schedule_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 7. Create trigger for automatic seat count management
DROP TRIGGER IF EXISTS trg_booking_seat_update ON bookings;
CREATE TRIGGER trg_booking_seat_update
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_schedule_seats();

-- 8. Create a function to check booking window availability
CREATE OR REPLACE FUNCTION is_booking_window_open(schedule_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  schedule_record RECORD;
  booking_deadline TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT * INTO schedule_record FROM schedules WHERE id = schedule_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Use explicit booking_deadline if set, otherwise default to 1 hour before departure
  IF schedule_record.booking_deadline IS NOT NULL THEN
    booking_deadline := schedule_record.booking_deadline;
  ELSE
    booking_deadline := (schedule_record.schedule_date + schedule_record.departure_time - INTERVAL '1 hour');
  END IF;
  
  RETURN (
    schedule_record.booking_enabled = TRUE AND
    schedule_record.status = 'scheduled' AND
    schedule_record.available_seats > 0 AND
    NOW() < booking_deadline
  );
END;
$$ LANGUAGE plpgsql;

-- Summary
SELECT 'Schedule enhancements applied successfully!' AS status; 