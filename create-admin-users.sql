-- Create missing admin users that are referenced in the staff picker fallback data
-- This will fix the "Admin user not found" error during grievance assignment

INSERT INTO admin_users (id, name, email, role, is_active, created_at, updated_at) 
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Super Administrator', 'superadmin@tms.local', 'super_admin', true, NOW(), NOW()),
  ('22222222-2222-2222-2222-222222222222', 'Transport Manager', 'transport@tms.local', 'transport_manager', true, NOW(), NOW()),
  ('33333333-3333-3333-3333-333333333333', 'Finance Administrator', 'finance@tms.local', 'finance_admin', true, NOW(), NOW()),
  ('44444444-4444-4444-4444-444444444444', 'Operations Administrator', 'operations@tms.local', 'operations_admin', true, NOW(), NOW()),
  ('55555555-5555-5555-5555-555555555555', 'Data Entry Operator', 'dataentry@tms.local', 'data_entry', true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Verify the users were created
SELECT id, name, email, role, is_active FROM admin_users WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555'
); 