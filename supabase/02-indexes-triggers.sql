-- Database Indexes, Triggers, and Functions for TMS Application

-- Create indexes for better performance
CREATE INDEX idx_students_email ON students(email);
CREATE INDEX idx_students_roll_number ON students(roll_number);
CREATE INDEX idx_students_department ON students(department_id);
CREATE INDEX idx_students_program ON students(program_id);
CREATE INDEX idx_students_institution ON students(institution_id);

CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_role ON admin_users(role);
CREATE INDEX idx_admin_users_active ON admin_users(is_active);

CREATE INDEX idx_admin_permissions_user ON admin_permissions(admin_user_id);
CREATE INDEX idx_admin_permissions_module ON admin_permissions(module);

CREATE INDEX idx_routes_status ON routes(status);
CREATE INDEX idx_routes_driver ON routes(driver_id);
CREATE INDEX idx_routes_vehicle ON routes(vehicle_id);
CREATE INDEX idx_routes_number ON routes(route_number);

CREATE INDEX idx_route_stops_route ON route_stops(route_id);
CREATE INDEX idx_route_stops_sequence ON route_stops(route_id, sequence_order);
CREATE INDEX idx_route_stops_major ON route_stops(is_major_stop);

CREATE INDEX idx_drivers_status ON drivers(status);
CREATE INDEX idx_drivers_license ON drivers(license_number);
CREATE INDEX idx_drivers_phone ON drivers(phone);

CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_registration ON vehicles(registration_number);
CREATE INDEX idx_vehicles_route ON vehicles(assigned_route_id);

CREATE INDEX idx_student_transport_profiles_student ON student_transport_profiles(student_id);
CREATE INDEX idx_student_transport_profiles_transport_status ON student_transport_profiles(transport_status);
CREATE INDEX idx_student_transport_profiles_payment_status ON student_transport_profiles(payment_status);

CREATE INDEX idx_student_route_allocations_student ON student_route_allocations(student_id);
CREATE INDEX idx_student_route_allocations_route ON student_route_allocations(route_id);
CREATE INDEX idx_student_route_allocations_active ON student_route_allocations(is_active);

CREATE INDEX idx_schedules_date ON schedules(schedule_date);
CREATE INDEX idx_schedules_route ON schedules(route_id);
CREATE INDEX idx_schedules_status ON schedules(status);
CREATE INDEX idx_schedules_driver ON schedules(driver_id);
CREATE INDEX idx_schedules_vehicle ON schedules(vehicle_id);

CREATE INDEX idx_bookings_student ON bookings(student_id);
CREATE INDEX idx_bookings_route ON bookings(route_id);
CREATE INDEX idx_bookings_schedule ON bookings(schedule_id);
CREATE INDEX idx_bookings_date ON bookings(trip_date);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_payment_status ON bookings(payment_status);

CREATE INDEX idx_payments_student ON payments(student_id);
CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_payments_type ON payments(payment_type);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_date ON payments(created_at);
CREATE INDEX idx_payments_transaction_id ON payments(transaction_id);

CREATE INDEX idx_notifications_audience ON notifications(target_audience);
CREATE INDEX idx_notifications_active ON notifications(is_active);
CREATE INDEX idx_notifications_category ON notifications(category);
CREATE INDEX idx_notifications_scheduled ON notifications(scheduled_at);
CREATE INDEX idx_notifications_expires ON notifications(expires_at);

CREATE INDEX idx_grievances_student ON grievances(student_id);
CREATE INDEX idx_grievances_route ON grievances(route_id);
CREATE INDEX idx_grievances_status ON grievances(status);
CREATE INDEX idx_grievances_category ON grievances(category);
CREATE INDEX idx_grievances_priority ON grievances(priority);
CREATE INDEX idx_grievances_assigned ON grievances(assigned_to);

CREATE INDEX idx_attendance_date ON attendance(attendance_date);
CREATE INDEX idx_attendance_student ON attendance(student_id);
CREATE INDEX idx_attendance_route ON attendance(route_id);
CREATE INDEX idx_attendance_schedule ON attendance(schedule_id);

CREATE INDEX idx_system_settings_key ON system_settings(setting_key);
CREATE INDEX idx_system_settings_public ON system_settings(is_public);

-- Additional indexes for route coordinates (for live tracking)
CREATE INDEX idx_routes_start_coordinates ON routes(start_latitude, start_longitude);
CREATE INDEX idx_routes_end_coordinates ON routes(end_latitude, end_longitude);
CREATE INDEX idx_routes_coordinates_combined ON routes(start_latitude, start_longitude, end_latitude, end_longitude);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers to relevant tables
CREATE TRIGGER update_institutions_updated_at 
  BEFORE UPDATE ON institutions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_departments_updated_at 
  BEFORE UPDATE ON departments 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_programs_updated_at 
  BEFORE UPDATE ON programs 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at 
  BEFORE UPDATE ON admin_users 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_students_updated_at 
  BEFORE UPDATE ON students 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_routes_updated_at 
  BEFORE UPDATE ON routes 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_drivers_updated_at 
  BEFORE UPDATE ON drivers 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at 
  BEFORE UPDATE ON vehicles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_transport_profiles_updated_at 
  BEFORE UPDATE ON student_transport_profiles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at 
  BEFORE UPDATE ON schedules 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at 
  BEFORE UPDATE ON bookings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at 
  BEFORE UPDATE ON payments 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notifications_updated_at 
  BEFORE UPDATE ON notifications 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_grievances_updated_at 
  BEFORE UPDATE ON grievances 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at 
  BEFORE UPDATE ON system_settings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update route passenger count
CREATE OR REPLACE FUNCTION update_route_passenger_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE routes 
    SET current_passengers = (
      SELECT COUNT(*)
      FROM student_route_allocations sra
      WHERE sra.route_id = NEW.route_id AND sra.is_active = true
    )
    WHERE id = NEW.route_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE routes 
    SET current_passengers = (
      SELECT COUNT(*)
      FROM student_route_allocations sra
      WHERE sra.route_id = OLD.route_id AND sra.is_active = true
    )
    WHERE id = OLD.route_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update route passenger count
CREATE TRIGGER trigger_update_route_passenger_count
  AFTER INSERT OR UPDATE OR DELETE ON student_route_allocations
  FOR EACH ROW EXECUTE FUNCTION update_route_passenger_count();

-- Function to update schedule booked seats and available seats
CREATE OR REPLACE FUNCTION update_schedule_booked_seats()
RETURNS TRIGGER AS $$
DECLARE
  total_capacity INTEGER;
  current_booked_seats INTEGER;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Get the original available_seats (total capacity) if not set
    SELECT 
      CASE 
        WHEN available_seats = booked_seats THEN available_seats + 1
        ELSE available_seats + booked_seats
      END,
      booked_seats
    INTO total_capacity, current_booked_seats
    FROM schedules 
    WHERE id = NEW.schedule_id;
    
    -- Count confirmed bookings
    SELECT COUNT(*)
    INTO current_booked_seats
    FROM bookings b
    WHERE b.schedule_id = NEW.schedule_id 
      AND b.status IN ('confirmed', 'completed');
    
    -- Update both booked_seats and calculate remaining available_seats
    UPDATE schedules 
    SET 
      booked_seats = current_booked_seats,
      available_seats = GREATEST(0, total_capacity - current_booked_seats)
    WHERE id = NEW.schedule_id;
    
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Get the original total capacity
    SELECT available_seats + booked_seats
    INTO total_capacity
    FROM schedules 
    WHERE id = OLD.schedule_id;
    
    -- Count remaining confirmed bookings
    SELECT COUNT(*)
    INTO current_booked_seats
    FROM bookings b
    WHERE b.schedule_id = OLD.schedule_id 
      AND b.status IN ('confirmed', 'completed');
    
    -- Update both booked_seats and calculate remaining available_seats  
    UPDATE schedules 
    SET 
      booked_seats = current_booked_seats,
      available_seats = GREATEST(0, total_capacity - current_booked_seats)
    WHERE id = OLD.schedule_id;
    
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update schedule booked seats
CREATE TRIGGER trigger_update_schedule_booked_seats
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_schedule_booked_seats();

-- Function to generate receipt number
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.receipt_number IS NULL THEN
    NEW.receipt_number := 'RCP' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(NEXTVAL('receipt_sequence'), 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create sequence for receipt numbers
CREATE SEQUENCE IF NOT EXISTS receipt_sequence START 1;

-- Trigger to automatically generate receipt numbers
CREATE TRIGGER trigger_generate_receipt_number
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION generate_receipt_number();

-- Function to update driver rating based on feedback
CREATE OR REPLACE FUNCTION update_driver_rating()
RETURNS TRIGGER AS $$
DECLARE
  avg_rating DECIMAL(3,2);
BEGIN
  -- This would be called when feedback/rating system is implemented
  -- For now, we'll just ensure rating stays within bounds
  IF NEW.rating > 5.00 THEN
    NEW.rating := 5.00;
  ELSIF NEW.rating < 0.00 THEN
    NEW.rating := 0.00;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to validate driver rating
CREATE TRIGGER trigger_update_driver_rating
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_driver_rating();

-- Function to automatically resolve grievances when marked as resolved
CREATE OR REPLACE FUNCTION auto_set_resolved_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    NEW.resolved_at := NOW();
  ELSIF NEW.status != 'resolved' THEN
    NEW.resolved_at := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically set resolved date
CREATE TRIGGER trigger_auto_set_resolved_date
  BEFORE UPDATE ON grievances
  FOR EACH ROW EXECUTE FUNCTION auto_set_resolved_date(); 