-- Sample Schedules Data for Testing
-- This file adds sample schedule data to test the schedules functionality

-- Insert sample schedules for the next week
-- These schedules will be created for existing routes with available drivers and vehicles

DO $$
DECLARE
    route_record RECORD;
    schedule_date DATE;
    i INTEGER;
BEGIN
    -- Get the next 7 days starting from today
    FOR i IN 0..6 LOOP
        schedule_date := CURRENT_DATE + i;
        
        -- Skip weekends for now (Saturday = 6, Sunday = 0)
        IF EXTRACT(DOW FROM schedule_date) NOT IN (0, 6) THEN
            
            -- Create schedules for each active route
            FOR route_record IN 
                SELECT id, route_number, route_name, total_capacity, departure_time, arrival_time, driver_id, vehicle_id
                FROM routes 
                WHERE status = 'active'
                ORDER BY route_number
            LOOP
                
                -- Insert morning schedule
                INSERT INTO schedules (
                    route_id,
                    schedule_date,
                    departure_time,
                    arrival_time,
                    available_seats,
                    booked_seats,
                    status,
                    driver_id,
                    vehicle_id,
                    created_at,
                    updated_at
                ) VALUES (
                    route_record.id,
                    schedule_date,
                    route_record.departure_time,
                    route_record.arrival_time,
                    route_record.total_capacity - (RANDOM() * route_record.total_capacity * 0.7)::INTEGER, -- 0-70% booked
                    (RANDOM() * route_record.total_capacity * 0.7)::INTEGER, -- 0-70% booked
                    'scheduled',
                    route_record.driver_id,
                    route_record.vehicle_id,
                    NOW(),
                    NOW()
                ) ON CONFLICT DO NOTHING;
                
                -- Insert evening schedule (return trip)
                -- Calculate return departure time (add 8 hours to morning arrival)
                INSERT INTO schedules (
                    route_id,
                    schedule_date,
                    departure_time,
                    arrival_time,
                    available_seats,
                    booked_seats,
                    status,
                    driver_id,
                    vehicle_id,
                    created_at,
                    updated_at
                ) VALUES (
                    route_record.id,
                    schedule_date,
                    (route_record.arrival_time::TIME + INTERVAL '8 hours')::TIME,
                    (route_record.arrival_time::TIME + INTERVAL '9 hours 30 minutes')::TIME,
                    route_record.total_capacity - (RANDOM() * route_record.total_capacity * 0.6)::INTEGER, -- 0-60% booked
                    (RANDOM() * route_record.total_capacity * 0.6)::INTEGER, -- 0-60% booked
                    'scheduled',
                    route_record.driver_id,
                    route_record.vehicle_id,
                    NOW(),
                    NOW()
                ) ON CONFLICT DO NOTHING;
                
            END LOOP;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Sample schedules have been created for the next week (weekdays only)';
END $$;

-- Update some schedules to different statuses for testing
UPDATE schedules 
SET status = 'in_progress'
WHERE schedule_date = CURRENT_DATE 
  AND departure_time <= CURRENT_TIME 
  AND arrival_time >= CURRENT_TIME;

UPDATE schedules 
SET status = 'completed'
WHERE schedule_date = CURRENT_DATE 
  AND arrival_time < CURRENT_TIME;

-- Add some sample bookings for the schedules
-- This will help test the booking functionality
DO $$
DECLARE
    schedule_record RECORD;
    student_record RECORD;
    booking_count INTEGER;
BEGIN
    -- Create some sample bookings
    FOR schedule_record IN 
        SELECT s.id as schedule_id, s.route_id, s.schedule_date, s.available_seats
        FROM schedules s
        WHERE s.schedule_date >= CURRENT_DATE
        AND s.available_seats > 0
        ORDER BY s.schedule_date, s.departure_time
        LIMIT 10 -- Limit to first 10 schedules
    LOOP
        -- Get some random students
        booking_count := 0;
        FOR student_record IN 
            SELECT id, student_name, roll_number
            FROM students 
            ORDER BY RANDOM()
            LIMIT (RANDOM() * LEAST(schedule_record.available_seats, 10))::INTEGER + 1 -- 1 to min(available_seats, 10) bookings
        LOOP
            -- Create a booking
            INSERT INTO bookings (
                student_id,
                route_id,
                schedule_id,
                booking_date,
                trip_date,
                boarding_stop,
                seat_number,
                status,
                payment_status,
                amount,
                special_requirements,
                created_at,
                updated_at
            ) VALUES (
                student_record.id,
                schedule_record.route_id,
                schedule_record.schedule_id,
                CURRENT_DATE,
                schedule_record.schedule_date,
                'Main Gate', -- Default boarding stop
                'A' || (booking_count + 1)::TEXT, -- Seat number like A1, A2, etc.
                'confirmed',
                CASE 
                    WHEN RANDOM() > 0.2 THEN 'paid'
                    ELSE 'pending'
                END,
                25.00 + (RANDOM() * 25)::DECIMAL(10,2), -- Random amount between 25-50
                CASE 
                    WHEN RANDOM() > 0.8 THEN 'Window seat preferred'
                    ELSE NULL
                END,
                NOW(),
                NOW()
            ) ON CONFLICT DO NOTHING;
            
            booking_count := booking_count + 1;
        END LOOP;
        
        -- Update the schedule's booked seats count
        UPDATE schedules 
        SET booked_seats = booking_count,
            available_seats = available_seats - booking_count
        WHERE id = schedule_record.schedule_id;
        
    END LOOP;
    
    RAISE NOTICE 'Sample bookings have been created';
END $$;

-- Create some notifications related to schedules
INSERT INTO notifications (
    title,
    message,
    type,
    category,
    target_audience,
    is_active,
    scheduled_at,
    expires_at,
    enable_push_notification,
    enable_email_notification,
    enable_sms_notification,
    actionable,
    primary_action,
    tags,
    created_at,
    updated_at
) VALUES 
(
    'New Schedules Available',
    'New transport schedules for next week are now available for booking. Book your seats early to avoid disappointment!',
    'info',
    'transport',
    'students',
    true,
    NOW(),
    NOW() + INTERVAL '7 days',
    true,
    true,
    false,
    true,
    '{"label": "View Schedules", "action": "/dashboard/schedules", "type": "navigate"}'::jsonb,
    ARRAY['schedules', 'booking', 'transport'],
    NOW(),
    NOW()
),
(
    'Booking Window Reminder',
    'Remember that booking windows close 1 hour before departure time. Plan ahead!',
    'warning',
    'transport',
    'students',
    true,
    NOW(),
    NOW() + INTERVAL '30 days',
    true,
    false,
    false,
    false,
    NULL,
    ARRAY['booking', 'reminder'],
    NOW(),
    NOW()
),
(
    'Schedule Management Update',
    'Enhanced schedule management features are now available in the admin panel.',
    'success',
    'system',
    'admins',
    true,
    NOW(),
    NOW() + INTERVAL '7 days',
    true,
    true,
    false,
    true,
    '{"label": "View Schedules", "action": "/schedules", "type": "navigate"}'::jsonb,
    ARRAY['schedules', 'admin', 'features'],
    NOW(),
    NOW()
);

-- Update route passenger counts based on bookings
UPDATE routes 
SET current_passengers = (
    SELECT COUNT(*)
    FROM bookings b
    INNER JOIN schedules s ON b.schedule_id = s.id
    WHERE s.route_id = routes.id
    AND b.status = 'confirmed'
    AND s.schedule_date >= CURRENT_DATE
    AND s.schedule_date <= CURRENT_DATE + INTERVAL '7 days'
);

COMMIT; 