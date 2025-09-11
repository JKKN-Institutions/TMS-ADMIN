-- TMS (Transportation Management System) Database Schema for Supabase
-- This schema supports both student and admin applications

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Custom types
CREATE TYPE user_role AS ENUM (
  'super_admin',
  'transport_manager', 
  'finance_admin',
  'operations_admin',
  'data_entry'
);

CREATE TYPE transport_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE payment_status AS ENUM ('current', 'overdue', 'suspended');
CREATE TYPE route_status AS ENUM ('active', 'inactive', 'maintenance');
CREATE TYPE driver_status AS ENUM ('active', 'inactive', 'on_leave');
CREATE TYPE vehicle_status AS ENUM ('active', 'maintenance', 'retired');
CREATE TYPE fuel_type AS ENUM ('diesel', 'petrol', 'electric', 'cng');
CREATE TYPE schedule_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE booking_status AS ENUM ('confirmed', 'cancelled', 'completed', 'no_show');
CREATE TYPE booking_payment_status AS ENUM ('paid', 'pending', 'refunded');
CREATE TYPE payment_type AS ENUM ('trip_fare', 'fine', 'semester_fee', 'registration');
CREATE TYPE payment_method AS ENUM ('cash', 'upi', 'card', 'net_banking', 'wallet');
CREATE TYPE payment_transaction_status AS ENUM ('completed', 'pending', 'failed', 'refunded');
CREATE TYPE notification_type AS ENUM ('info', 'warning', 'error', 'success');
CREATE TYPE notification_category AS ENUM ('transport', 'payment', 'system', 'emergency');
CREATE TYPE notification_audience AS ENUM ('all', 'students', 'drivers', 'admins');
CREATE TYPE grievance_category AS ENUM ('complaint', 'suggestion', 'compliment', 'technical_issue');
CREATE TYPE grievance_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE grievance_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- 1. Institutions table
CREATE TABLE institutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Departments table
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  department_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Programs table
CREATE TABLE programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  program_name VARCHAR(255) NOT NULL,
  degree_name VARCHAR(255) NOT NULL,
  duration_years INTEGER DEFAULT 4,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Admin Users table
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  role user_role NOT NULL DEFAULT 'data_entry',
  avatar VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Admin Permissions table
CREATE TABLE admin_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
  module VARCHAR(100) NOT NULL,
  actions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Students table
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_name VARCHAR(255) NOT NULL,
  roll_number VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255),
  department_id UUID REFERENCES departments(id),
  program_id UUID REFERENCES programs(id),
  institution_id UUID REFERENCES institutions(id),
  academic_year INTEGER,
  semester INTEGER,
  address TEXT,
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Routes table
CREATE TABLE routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_number VARCHAR(50) UNIQUE NOT NULL,
  route_name VARCHAR(255) NOT NULL,
  start_location VARCHAR(255) NOT NULL,
  end_location VARCHAR(255) NOT NULL,
  start_latitude DECIMAL(10,8),
  start_longitude DECIMAL(11,8),
  end_latitude DECIMAL(10,8),
  end_longitude DECIMAL(11,8),
  departure_time TIME NOT NULL,
  arrival_time TIME NOT NULL,
  distance DECIMAL(8,2) NOT NULL,
  duration VARCHAR(50) NOT NULL,
  total_capacity INTEGER NOT NULL,
  current_passengers INTEGER DEFAULT 0,
  status route_status DEFAULT 'active',
  driver_id UUID,
  vehicle_id UUID,
  fare DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Route Stops table
CREATE TABLE route_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  stop_name VARCHAR(255) NOT NULL,
  stop_time TIME NOT NULL,
  sequence_order INTEGER NOT NULL,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  is_major_stop BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Drivers table
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  license_number VARCHAR(100) UNIQUE NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  password_hash VARCHAR(255),
  experience_years INTEGER DEFAULT 0,
  rating DECIMAL(3,2) DEFAULT 0.00,
  total_trips INTEGER DEFAULT 0,
  status driver_status DEFAULT 'active',
  address TEXT,
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(20),
  license_expiry DATE,
  medical_certificate_expiry DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Driver Route Assignments table
CREATE TABLE driver_route_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(driver_id, route_id)
);

-- 11. Vehicles table
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_number VARCHAR(50) UNIQUE NOT NULL,
  model VARCHAR(255) NOT NULL,
  capacity INTEGER NOT NULL,
  fuel_type fuel_type NOT NULL,
  insurance_expiry DATE NOT NULL,
  fitness_expiry DATE NOT NULL,
  last_maintenance DATE,
  next_maintenance DATE,
  status vehicle_status DEFAULT 'active',
  assigned_route_id UUID REFERENCES routes(id),
  mileage DECIMAL(8,2),
  purchase_date DATE,
  chassis_number VARCHAR(100),
  engine_number VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. Student Transport Profiles table
CREATE TABLE student_transport_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE UNIQUE,
  boarding_point VARCHAR(255),
  transport_status transport_status DEFAULT 'inactive',
  payment_status payment_status DEFAULT 'current',
  total_fines DECIMAL(10,2) DEFAULT 0.00,
  outstanding_amount DECIMAL(10,2) DEFAULT 0.00,
  semester_fee_paid BOOLEAN DEFAULT false,
  registration_fee_paid BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. Student Route Allocations table
CREATE TABLE student_route_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  allocated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  boarding_stop_id UUID REFERENCES route_stops(id),
  UNIQUE(student_id, route_id)
);

-- 14. Schedules table
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL,
  departure_time TIME NOT NULL,
  arrival_time TIME NOT NULL,
  available_seats INTEGER NOT NULL,
  booked_seats INTEGER DEFAULT 0,
  status schedule_status DEFAULT 'scheduled',
  driver_id UUID REFERENCES drivers(id),
  vehicle_id UUID REFERENCES vehicles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 15. Bookings table
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES schedules(id) ON DELETE CASCADE,
  booking_date DATE NOT NULL DEFAULT CURRENT_DATE,
  trip_date DATE NOT NULL,
  boarding_stop VARCHAR(255) NOT NULL,
  seat_number VARCHAR(10),
  status booking_status DEFAULT 'confirmed',
  payment_status booking_payment_status DEFAULT 'pending',
  amount DECIMAL(10,2) NOT NULL,
  qr_code TEXT,
  special_requirements TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 16. Payments table
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_type payment_type NOT NULL,
  payment_method payment_method NOT NULL,
  status payment_transaction_status DEFAULT 'pending',
  transaction_id VARCHAR(255),
  description TEXT,
  receipt_number VARCHAR(100),
  gateway_response JSONB,
  processed_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 17. Notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type notification_type DEFAULT 'info',
  category notification_category DEFAULT 'transport',
  target_audience notification_audience DEFAULT 'all',
  specific_users UUID[],
  is_active BOOLEAN DEFAULT true,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  enable_push_notification BOOLEAN DEFAULT true,
  enable_email_notification BOOLEAN DEFAULT true,
  enable_sms_notification BOOLEAN DEFAULT false,
  actionable BOOLEAN DEFAULT false,
  primary_action JSONB,
  secondary_action JSONB,
  tags TEXT[],
  read_by UUID[],
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 18. Grievances table
CREATE TABLE grievances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  route_id UUID REFERENCES routes(id) ON DELETE SET NULL,
  driver_name VARCHAR(255),
  category grievance_category NOT NULL,
  priority grievance_priority DEFAULT 'medium',
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status grievance_status DEFAULT 'open',
  assigned_to UUID REFERENCES admin_users(id),
  resolution TEXT,
  attachments TEXT[],
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 19. Attendance table
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES schedules(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  boarding_time TIMESTAMP WITH TIME ZONE,
  alighting_time TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50) DEFAULT 'present',
  marked_by UUID REFERENCES drivers(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 20. System Settings table
CREATE TABLE system_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setting_key VARCHAR(255) UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  updated_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key constraints that were deferred
ALTER TABLE routes ADD CONSTRAINT fk_routes_driver FOREIGN KEY (driver_id) REFERENCES drivers(id);
ALTER TABLE routes ADD CONSTRAINT fk_routes_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id); 