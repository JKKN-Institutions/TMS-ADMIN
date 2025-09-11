-- Fix Schedule Creation Logic - Permanent Solution
-- This fixes the root cause where schedules created today for today become unbookable

-- Step 1: Update the trigger function to handle same-day admin schedules
CREATE OR REPLACE FUNCTION trigger_set_booking_deadline()
RETURNS TRIGGER AS $$
DECLARE
  calculated_deadline TIMESTAMP WITH TIME ZONE;
  schedule_datetime TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Calculate schedule datetime
  schedule_datetime := NEW.schedule_date + NEW.departure_time;
  
  -- Calculate normal booking deadline (7 PM day before)
  calculated_deadline := (NEW.schedule_date - INTERVAL '1 day') + TIME '19:00:00';
  
  -- Handle same-day or short-notice schedules created by admin
  IF NEW.schedule_date = CURRENT_DATE THEN
    -- If schedule is for today, allow booking until 2 hours before departure
    -- or until 7 PM today, whichever is later
    calculated_deadline := GREATEST(
      CURRENT_DATE + TIME '19:00:00',  -- 7 PM today
      schedule_datetime - INTERVAL '2 hours'  -- 2 hours before departure
    );
  ELSIF NEW.schedule_date = CURRENT_DATE + INTERVAL '1 day' THEN
    -- If schedule is for tomorrow but created today after 7 PM
    -- Allow booking until 7 PM today or normal deadline, whichever is later
    calculated_deadline := GREATEST(
      calculated_deadline,  -- Normal deadline (today 7 PM)
      CURRENT_DATE + TIME '19:00:00'  -- Today 7 PM
    );
  END IF;
  
  -- Set the deadline
  NEW.booking_deadline := calculated_deadline;
  
  -- Set total seats if not provided
  IF NEW.total_seats IS NULL OR NEW.total_seats = 0 THEN
    NEW.total_seats := NEW.available_seats + COALESCE(NEW.booked_seats, 0);
  END IF;
  
  -- Set booking window status based on current time vs deadline
  NEW.is_booking_window_open := CASE
    WHEN NOW() <= NEW.booking_deadline THEN true
    ELSE false
  END;
  
  -- If admin is creating this schedule, enable it by default for same-day/next-day
  IF NEW.schedule_date <= CURRENT_DATE + INTERVAL '1 day' THEN
    NEW.admin_scheduling_enabled := COALESCE(NEW.admin_scheduling_enabled, true);
    NEW.booking_enabled := COALESCE(NEW.booking_enabled, true);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Update existing schedules that were created today for today
UPDATE schedules 
SET 
  booking_deadline = GREATEST(
    CURRENT_DATE + TIME '19:00:00',  -- 7 PM today
    (schedule_date + departure_time) - INTERVAL '2 hours'  -- 2 hours before departure
  ),
  is_booking_window_open = CASE
    WHEN NOW() <= GREATEST(
      CURRENT_DATE + TIME '19:00:00',
      (schedule_date + departure_time) - INTERVAL '2 hours'
    ) THEN true
    ELSE false
  END,
  admin_scheduling_enabled = true,  -- Enable admin approval
  booking_enabled = true            -- Enable booking
WHERE schedule_date = CURRENT_DATE
  AND created_at::date = CURRENT_DATE;  -- Only schedules created today

-- Step 3: Create a function for admin override of booking windows
CREATE OR REPLACE FUNCTION admin_override_booking_window(
  p_schedule_id UUID,
  p_new_deadline TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  new_deadline TIMESTAMP WITH TIME ZONE;
BEGIN
  -- If no deadline provided, calculate a reasonable one
  IF p_new_deadline IS NULL THEN
    SELECT GREATEST(
      NOW() + INTERVAL '1 hour',  -- At least 1 hour from now
      (schedule_date + departure_time) - INTERVAL '1 hour'  -- 1 hour before departure
    ) INTO new_deadline
    FROM schedules 
    WHERE id = p_schedule_id;
  ELSE
    new_deadline := p_new_deadline;
  END IF;
  
  -- Update the schedule
  UPDATE schedules 
  SET 
    booking_deadline = new_deadline,
    is_booking_window_open = CASE WHEN NOW() <= new_deadline THEN true ELSE false END,
    admin_scheduling_enabled = true,
    booking_enabled = true
  WHERE id = p_schedule_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Update the admin schedule creation default behavior
CREATE OR REPLACE FUNCTION set_schedule_defaults()
RETURNS TRIGGER AS $$
BEGIN
  -- For new schedules, set smart defaults based on timing
  IF TG_OP = 'INSERT' THEN
    -- If creating a schedule for today or tomorrow, enable it by default
    IF NEW.schedule_date <= CURRENT_DATE + INTERVAL '1 day' THEN
      NEW.admin_scheduling_enabled := COALESCE(NEW.admin_scheduling_enabled, true);
      NEW.booking_enabled := COALESCE(NEW.booking_enabled, true);
    ELSE
      -- For future schedules, require explicit admin approval
      NEW.admin_scheduling_enabled := COALESCE(NEW.admin_scheduling_enabled, false);
      NEW.booking_enabled := COALESCE(NEW.booking_enabled, false);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create the defaults trigger (runs before the deadline trigger)
DROP TRIGGER IF EXISTS trigger_schedule_defaults ON schedules;
CREATE TRIGGER trigger_schedule_defaults
  BEFORE INSERT ON schedules
  FOR EACH ROW
  EXECUTE FUNCTION set_schedule_defaults();

-- Step 6: Verify the fix - check current schedules
SELECT 
  s.schedule_date,
  s.departure_time,
  s.booking_deadline,
  s.is_booking_window_open,
  s.admin_scheduling_enabled,
  s.booking_enabled,
  r.route_number,
  CASE 
    WHEN s.is_booking_window_open THEN 'BOOKABLE ✅'
    ELSE 'CLOSED ❌'
  END as booking_status
FROM schedules s
JOIN routes r ON s.route_id = r.id
WHERE s.schedule_date >= CURRENT_DATE
  AND r.route_number = '05'
ORDER BY s.schedule_date;

-- Step 7: Test the admin override function on existing schedule
-- SELECT admin_override_booking_window('d1859d89-9245-4b59-ba32-353af943829f');

COMMENT ON FUNCTION trigger_set_booking_deadline() IS 'Enhanced trigger that handles same-day schedule creation with smart deadline calculation';
COMMENT ON FUNCTION admin_override_booking_window(UUID, TIMESTAMP WITH TIME ZONE) IS 'Allows admin to override booking windows for special cases';
COMMENT ON FUNCTION set_schedule_defaults() IS 'Sets smart defaults for admin approval based on schedule timing'; 