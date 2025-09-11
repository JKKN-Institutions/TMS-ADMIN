-- ===============================================
-- TMS Admin Credentials Setup
-- This creates standard login credentials for all admin types
-- Login Format: admin_id + password (not email)
-- ===============================================

-- Step 1: Clear existing admin data
DELETE FROM admin_permissions;
DELETE FROM admin_users;

-- Step 2: Create standard admin users with ID-based login
INSERT INTO admin_users (id, name, email, role, is_active, password_hash) VALUES
-- Super Admin
('11111111-1111-1111-1111-111111111111', 'Super Administrator', 'superadmin@tms.local', 'super_admin', true, 'superadmin123'),

-- Transport Manager  
('22222222-2222-2222-2222-222222222222', 'Transport Manager', 'transport@tms.local', 'transport_manager', true, 'transport123'),

-- Finance Admin
('33333333-3333-3333-3333-333333333333', 'Finance Administrator', 'finance@tms.local', 'finance_admin', true, 'finance123'),

-- Operations Admin
('44444444-4444-4444-4444-444444444444', 'Operations Administrator', 'operations@tms.local', 'operations_admin', true, 'operations123'),

-- Data Entry Operator
('55555555-5555-5555-5555-555555555555', 'Data Entry Operator', 'dataentry@tms.local', 'data_entry', true, 'dataentry123');

-- Step 3: Set up admin permissions for each role

-- Super Admin - Full Access to Everything
INSERT INTO admin_permissions (admin_user_id, module, actions) VALUES
('11111111-1111-1111-1111-111111111111', 'all', ARRAY['read', 'create', 'update', 'delete']);

-- Transport Manager - Routes, Drivers, Vehicles, Schedules
INSERT INTO admin_permissions (admin_user_id, module, actions) VALUES
('22222222-2222-2222-2222-222222222222', 'routes', ARRAY['read', 'create', 'update', 'delete']),
('22222222-2222-2222-2222-222222222222', 'drivers', ARRAY['read', 'create', 'update', 'delete']),
('22222222-2222-2222-2222-222222222222', 'vehicles', ARRAY['read', 'create', 'update', 'delete']),
('22222222-2222-2222-2222-222222222222', 'schedules', ARRAY['read', 'create', 'update', 'delete']),
('22222222-2222-2222-2222-222222222222', 'analytics', ARRAY['read']);

-- Finance Admin - Payments, Financial Reports, Student Finance
INSERT INTO admin_permissions (admin_user_id, module, actions) VALUES
('33333333-3333-3333-3333-333333333333', 'payments', ARRAY['read', 'create', 'update', 'delete']),
('33333333-3333-3333-3333-333333333333', 'students', ARRAY['read']),
('33333333-3333-3333-3333-333333333333', 'bookings', ARRAY['read', 'update']),
('33333333-3333-3333-3333-333333333333', 'analytics', ARRAY['read']);

-- Operations Admin - Students, Bookings, Notifications, Grievances
INSERT INTO admin_permissions (admin_user_id, module, actions) VALUES
('44444444-4444-4444-4444-444444444444', 'students', ARRAY['read', 'update']),
('44444444-4444-4444-4444-444444444444', 'bookings', ARRAY['read', 'create', 'update', 'delete']),
('44444444-4444-4444-4444-444444444444', 'notifications', ARRAY['read', 'create', 'update', 'delete']),
('44444444-4444-4444-4444-444444444444', 'grievances', ARRAY['read', 'create', 'update', 'delete']),
('44444444-4444-4444-4444-444444444444', 'analytics', ARRAY['read']);

-- Data Entry - Limited Student Management
INSERT INTO admin_permissions (admin_user_id, module, actions) VALUES
('55555555-5555-5555-5555-555555555555', 'students', ARRAY['read', 'create', 'update']);

-- ===============================================
-- STANDARD LOGIN CREDENTIALS
-- ===============================================

/*
LOGIN CREDENTIALS FOR ADMIN PORTAL:

1. SUPER ADMIN
   ID: SA001
   Password: superadmin123
   Access: Full system control

2. TRANSPORT MANAGER  
   ID: TM001
   Password: transport123
   Access: Routes, Drivers, Vehicles, Schedules

3. FINANCE ADMIN
   ID: FA001  
   Password: finance123
   Access: Payments, Financial Reports

4. OPERATIONS ADMIN
   ID: OA001
   Password: operations123  
   Access: Students, Bookings, Notifications, Grievances

5. DATA ENTRY
   ID: DE001
   Password: dataentry123
   Access: Student Management (Limited)

Note: Use these exact credentials for login
Format: Admin ID + Password (not email)
*/

-- ===============================================
-- Create login mapping table for ID-based authentication
-- ===============================================

CREATE TABLE IF NOT EXISTS admin_login_mapping (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id VARCHAR(10) UNIQUE NOT NULL,
  admin_user_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
  password VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert login mappings
INSERT INTO admin_login_mapping (admin_id, admin_user_id, password) VALUES
('SA001', '11111111-1111-1111-1111-111111111111', 'superadmin123'),
('TM001', '22222222-2222-2222-2222-222222222222', 'transport123'),
('FA001', '33333333-3333-3333-3333-333333333333', 'finance123'),
('OA001', '44444444-4444-4444-4444-444444444444', 'operations123'),
('DE001', '55555555-5555-5555-5555-555555555555', 'dataentry123');

-- ===============================================
-- Create login function for ID-based authentication
-- ===============================================

CREATE OR REPLACE FUNCTION authenticate_admin(login_id TEXT, login_password TEXT)
RETURNS TABLE(
  user_id UUID,
  user_name TEXT,
  user_role TEXT,
  is_authenticated BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id,
    au.name,
    au.role::TEXT,
    (alm.password = login_password AND alm.is_active = true AND au.is_active = true) as is_authenticated
  FROM admin_login_mapping alm
  JOIN admin_users au ON alm.admin_user_id = au.id
  WHERE alm.admin_id = login_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===============================================
-- Test the authentication function
-- ===============================================

-- Test login (uncomment to test)
-- SELECT * FROM authenticate_admin('SA001', 'superadmin123');
-- SELECT * FROM authenticate_admin('TM001', 'transport123');

-- ===============================================
-- Grant necessary permissions
-- ===============================================

GRANT SELECT ON admin_login_mapping TO authenticated;
GRANT EXECUTE ON FUNCTION authenticate_admin(TEXT, TEXT) TO authenticated; 