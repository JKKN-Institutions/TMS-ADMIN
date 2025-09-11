-- TMS Admin Credentials Setup
-- Copy and paste this entire SQL block in Supabase SQL Editor

-- Step 1: Clear existing admin data
DELETE FROM admin_permissions;
DELETE FROM admin_users;

-- Step 2: Create standard admin users
INSERT INTO admin_users (id, name, email, role, is_active) VALUES
('11111111-1111-1111-1111-111111111111', 'Super Administrator', 'superadmin@tms.local', 'super_admin', true),
('22222222-2222-2222-2222-222222222222', 'Transport Manager', 'transport@tms.local', 'transport_manager', true),
('33333333-3333-3333-3333-333333333333', 'Finance Administrator', 'finance@tms.local', 'finance_admin', true),
('44444444-4444-4444-4444-444444444444', 'Operations Administrator', 'operations@tms.local', 'operations_admin', true),
('55555555-5555-5555-5555-555555555555', 'Data Entry Operator', 'dataentry@tms.local', 'data_entry', true);

-- Step 3: Create permissions

-- Super Admin - Full Access
INSERT INTO admin_permissions (admin_user_id, module, actions) VALUES
('11111111-1111-1111-1111-111111111111', 'all', ARRAY['read', 'create', 'update', 'delete']);

-- Transport Manager
INSERT INTO admin_permissions (admin_user_id, module, actions) VALUES
('22222222-2222-2222-2222-222222222222', 'routes', ARRAY['read', 'create', 'update', 'delete']),
('22222222-2222-2222-2222-222222222222', 'drivers', ARRAY['read', 'create', 'update', 'delete']),
('22222222-2222-2222-2222-222222222222', 'vehicles', ARRAY['read', 'create', 'update', 'delete']),
('22222222-2222-2222-2222-222222222222', 'schedules', ARRAY['read', 'create', 'update', 'delete']),
('22222222-2222-2222-2222-222222222222', 'analytics', ARRAY['read']);

-- Finance Admin
INSERT INTO admin_permissions (admin_user_id, module, actions) VALUES
('33333333-3333-3333-3333-333333333333', 'payments', ARRAY['read', 'create', 'update', 'delete']),
('33333333-3333-3333-3333-333333333333', 'students', ARRAY['read']),
('33333333-3333-3333-3333-333333333333', 'bookings', ARRAY['read', 'update']),
('33333333-3333-3333-3333-333333333333', 'analytics', ARRAY['read']);

-- Operations Admin
INSERT INTO admin_permissions (admin_user_id, module, actions) VALUES
('44444444-4444-4444-4444-444444444444', 'students', ARRAY['read', 'update']),
('44444444-4444-4444-4444-444444444444', 'bookings', ARRAY['read', 'create', 'update', 'delete']),
('44444444-4444-4444-4444-444444444444', 'notifications', ARRAY['read', 'create', 'update', 'delete']),
('44444444-4444-4444-4444-444444444444', 'grievances', ARRAY['read', 'create', 'update', 'delete']),
('44444444-4444-4444-4444-444444444444', 'analytics', ARRAY['read']);

-- Data Entry
INSERT INTO admin_permissions (admin_user_id, module, actions) VALUES
('55555555-5555-5555-5555-555555555555', 'students', ARRAY['read', 'create', 'update']);

-- Step 4: Create login mapping table
CREATE TABLE IF NOT EXISTS admin_login_mapping (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id VARCHAR(10) UNIQUE NOT NULL,
  admin_user_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
  password VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 5: Insert login credentials
INSERT INTO admin_login_mapping (admin_id, admin_user_id, password) VALUES
('SA001', '11111111-1111-1111-1111-111111111111', 'superadmin123'),
('TM001', '22222222-2222-2222-2222-222222222222', 'transport123'),
('FA001', '33333333-3333-3333-3333-333333333333', 'finance123'),
('OA001', '44444444-4444-4444-4444-444444444444', 'operations123'),
('DE001', '55555555-5555-5555-5555-555555555555', 'dataentry123'); 