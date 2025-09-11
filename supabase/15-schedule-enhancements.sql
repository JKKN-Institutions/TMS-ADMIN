-- Schedule System Enhancements for PostgreSQL/Supabase
-- This migration adds improvements to support the new admin-passenger alignment
-- 
-- IMPORTANT: This file uses PostgreSQL-specific syntax for Supabase
-- The linter may show errors because it's configured for a different SQL dialect
-- This SQL is correct for PostgreSQL/Supabase and should be executed there directly
--
-- Purpose: Adds columns, constraints, indexes, and triggers to improve:
-- 1. Schedule management with booking windows
-- 2. Automatic seat count updates
-- 3. Data integrity constraints
-- 4. Performance improvements

-- 1. Add useful columns to schedules table
-- (Run these one by one if columns already exist)
ALTER TABLE schedules ADD COLUMN total_seats INTEGER;
ALTER TABLE schedules ADD COLUMN booking_enabled BOOLEAN DEFAULT true;
ALTER TABLE schedules ADD COLUMN booking_deadline TIMESTAMP WITH TIME ZONE;
ALTER TABLE schedules ADD COLUMN special_instructions TEXT;

-- 2. Update total_seats for existing records
UPDATE schedules 
SET total_seats = available_seats + COALESCE(booked_seats, 0)
WHERE total_seats IS NULL;

-- 3. Set booking_deadline for existing schedules
UPDATE schedules 
SET booking_deadline = schedule_date + departure_time - INTERVAL '1 hour'
WHERE booking_deadline IS NULL;

-- 4. Add constraints for data integrity
ALTER TABLE schedules ADD CONSTRAINT chk_seats_positive 
  CHECK (available_seats >= 0 AND booked_seats >= 0);

ALTER TABLE schedules ADD CONSTRAINT chk_seats_logical 
  CHECK (available_seats + booked_seats <= total_seats);

-- 5. Add constraint to prevent duplicate bookings
ALTER TABLE bookings ADD CONSTRAINT unique_student_schedule 
  UNIQUE (student_id, schedule_id);

-- 6. Add indexes for better performance
CREATE INDEX idx_schedules_date_route ON schedules(schedule_date, route_id);
CREATE INDEX idx_schedules_status ON schedules(status);
CREATE INDEX idx_bookings_student_date ON bookings(student_id, trip_date);
CREATE INDEX idx_bookings_schedule_status ON bookings(schedule_id, status);
CREATE INDEX idx_schedules_booking_enabled ON schedules(booking_enabled);
CREATE INDEX idx_schedules_booking_deadline ON schedules(booking_deadline);

-- 7. PostgreSQL function to automatically update seat counts
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

-- 8. Create trigger for automatic seat count management
DROP TRIGGER IF EXISTS trg_booking_seat_update ON bookings;
CREATE TRIGGER trg_booking_seat_update
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_schedule_seats();

-- Summary
SELECT 'Schedule enhancements applied successfully!' AS status; 