-- Trip Completion Schema Migration
-- This migration adds the necessary database fields and tables for trip completion functionality

-- =============================================================================
-- 1. ADD COMPLETION FIELDS TO SCHEDULES TABLE
-- =============================================================================

-- Add completion tracking fields to schedules table
DO $$ 
BEGIN
    -- Add completion_date field if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'schedules' AND column_name = 'completion_date') THEN
        ALTER TABLE schedules ADD COLUMN completion_date TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add completion_notes field if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'schedules' AND column_name = 'completion_notes') THEN
        ALTER TABLE schedules ADD COLUMN completion_notes TEXT;
    END IF;

    -- Ensure status enum includes 'completed' (should already exist but checking)
    -- The schedule_status enum should already have 'completed' from the base schema
END $$;

-- =============================================================================
-- 2. CREATE TRIP_COMPLETIONS TABLE
-- =============================================================================

-- Create trip_completions table for detailed completion tracking
CREATE TABLE IF NOT EXISTS trip_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  completion_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  passenger_count INTEGER NOT NULL DEFAULT 0,
  completion_notes TEXT,
  completion_type VARCHAR(50) DEFAULT 'auto', -- 'auto', 'manual', 'admin'
  completed_by UUID REFERENCES admin_users(id), -- NULL for auto-completion
  driver_id UUID REFERENCES drivers(id),
  vehicle_id UUID REFERENCES vehicles(id),
  
  -- Metrics
  on_time_completion BOOLEAN DEFAULT true,
  delay_minutes INTEGER DEFAULT 0,
  delay_reason TEXT,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one completion record per schedule
  UNIQUE(schedule_id)
);

-- =============================================================================
-- 3. ADD COMPLETION_DATE TO BOOKINGS TABLE
-- =============================================================================

-- Add completion_date to bookings table for tracking when passenger bookings were completed
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'bookings' AND column_name = 'completion_date') THEN
        ALTER TABLE bookings ADD COLUMN completion_date TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- =============================================================================
-- 4. CREATE INDEXES FOR PERFORMANCE
-- =============================================================================

-- Indexes for schedules completion fields
CREATE INDEX IF NOT EXISTS idx_schedules_completion_date ON schedules(completion_date);
CREATE INDEX IF NOT EXISTS idx_schedules_status_completion ON schedules(status, completion_date);

-- Indexes for trip_completions table
CREATE INDEX IF NOT EXISTS idx_trip_completions_schedule ON trip_completions(schedule_id);
CREATE INDEX IF NOT EXISTS idx_trip_completions_route ON trip_completions(route_id);
CREATE INDEX IF NOT EXISTS idx_trip_completions_date ON trip_completions(completion_date);
CREATE INDEX IF NOT EXISTS idx_trip_completions_type ON trip_completions(completion_type);

-- Indexes for bookings completion
CREATE INDEX IF NOT EXISTS idx_bookings_completion_date ON bookings(completion_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status_completion ON bookings(status, completion_date);

-- =============================================================================
-- 5. CREATE TRIGGERS AND FUNCTIONS
-- =============================================================================

-- Function to automatically update completion metrics
CREATE OR REPLACE FUNCTION update_completion_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update trip_completions table when schedule status changes to completed
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        -- Insert or update completion record
        INSERT INTO trip_completions (
            schedule_id,
            route_id,
            completion_date,
            passenger_count,
            completion_notes,
            completion_type,
            driver_id,
            vehicle_id
        ) VALUES (
            NEW.id,
            NEW.route_id,
            COALESCE(NEW.completion_date, NOW()),
            NEW.booked_seats,
            NEW.completion_notes,
            CASE WHEN NEW.completion_notes LIKE '%Auto-completed%' THEN 'auto' ELSE 'manual' END,
            NEW.driver_id,
            NEW.vehicle_id
        )
        ON CONFLICT (schedule_id) 
        DO UPDATE SET
            completion_date = EXCLUDED.completion_date,
            passenger_count = EXCLUDED.passenger_count,
            completion_notes = EXCLUDED.completion_notes,
            completion_type = EXCLUDED.completion_type,
            updated_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for completion metrics
DROP TRIGGER IF EXISTS trigger_update_completion_metrics ON schedules;
CREATE TRIGGER trigger_update_completion_metrics
    AFTER UPDATE ON schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_completion_metrics();

-- =============================================================================
-- 6. UTILITY FUNCTIONS
-- =============================================================================

-- Function to get completion statistics for a route
CREATE OR REPLACE FUNCTION get_route_completion_stats(p_route_id UUID, p_start_date DATE DEFAULT NULL, p_end_date DATE DEFAULT NULL)
RETURNS TABLE (
    total_trips INTEGER,
    completed_trips INTEGER,
    completion_rate DECIMAL(5,2),
    total_passengers INTEGER,
    avg_passengers_per_trip DECIMAL(5,2),
    on_time_completions INTEGER,
    delayed_completions INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_trips,
        COUNT(tc.id)::INTEGER as completed_trips,
        ROUND(COUNT(tc.id) * 100.0 / COUNT(*), 2) as completion_rate,
        COALESCE(SUM(tc.passenger_count), 0)::INTEGER as total_passengers,
        ROUND(AVG(tc.passenger_count), 2) as avg_passengers_per_trip,
        COUNT(tc.id) FILTER (WHERE tc.on_time_completion = true)::INTEGER as on_time_completions,
        COUNT(tc.id) FILTER (WHERE tc.on_time_completion = false)::INTEGER as delayed_completions
    FROM schedules s
    LEFT JOIN trip_completions tc ON s.id = tc.schedule_id
    WHERE s.route_id = p_route_id
    AND (p_start_date IS NULL OR s.schedule_date >= p_start_date)
    AND (p_end_date IS NULL OR s.schedule_date <= p_end_date);
END;
$$ LANGUAGE plpgsql;

-- Function to auto-mark trips as completed (for scheduling)
CREATE OR REPLACE FUNCTION auto_complete_past_trips()
RETURNS TABLE (
    completed_count INTEGER,
    schedule_ids UUID[]
) AS $$
DECLARE
    completed_schedules UUID[];
    completion_count INTEGER;
BEGIN
    -- Find schedules that should be completed (past date, not already completed)
    SELECT ARRAY_AGG(id) INTO completed_schedules
    FROM schedules 
    WHERE schedule_date < CURRENT_DATE 
    AND status IN ('scheduled', 'in_progress');
    
    -- Update schedules to completed status
    UPDATE schedules 
    SET 
        status = 'completed',
        completion_date = NOW(),
        completion_notes = 'Auto-completed by system',
        updated_at = NOW()
    WHERE id = ANY(completed_schedules);
    
    -- Update associated bookings
    UPDATE bookings 
    SET 
        status = 'completed',
        completion_date = NOW(),
        updated_at = NOW()
    WHERE schedule_id = ANY(completed_schedules)
    AND status = 'confirmed';
    
    GET DIAGNOSTICS completion_count = ROW_COUNT;
    
    RETURN QUERY SELECT completion_count, COALESCE(completed_schedules, ARRAY[]::UUID[]);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 7. UPDATE EXISTING DATA
-- =============================================================================

-- Update any existing completed schedules that might not have completion_date set
UPDATE schedules 
SET completion_date = updated_at 
WHERE status = 'completed' 
AND completion_date IS NULL;

-- =============================================================================
-- 8. COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON COLUMN schedules.completion_date IS 'Timestamp when the trip was marked as completed';
COMMENT ON COLUMN schedules.completion_notes IS 'Notes about the trip completion (e.g., Auto-completed by system, Manual completion)';
COMMENT ON TABLE trip_completions IS 'Detailed tracking of trip completions with metrics and audit information';
COMMENT ON FUNCTION get_route_completion_stats(UUID, DATE, DATE) IS 'Returns completion statistics for a specific route within a date range';
COMMENT ON FUNCTION auto_complete_past_trips() IS 'Automatically marks past trips as completed - used by auto-completion system';

-- =============================================================================
-- MIGRATION VERIFICATION
-- =============================================================================

-- Verify the migration was successful
SELECT 
    'Trip Completion Schema Migration Completed' AS status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'completion_date')
        THEN '✅ schedules.completion_date added'
        ELSE '❌ schedules.completion_date missing'
    END AS completion_date_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'completion_notes')
        THEN '✅ schedules.completion_notes added'
        ELSE '❌ schedules.completion_notes missing'
    END AS completion_notes_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trip_completions')
        THEN '✅ trip_completions table created'
        ELSE '❌ trip_completions table missing'
    END AS trip_completions_table_check; 