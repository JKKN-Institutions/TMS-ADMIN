-- Register Admin User in Auth Server Database
-- Run this SQL in your auth server's database (https://auth.jkkn.ai database)

-- 1. First, check if the user already exists
SELECT id, email, full_name, role, is_super_admin 
FROM users 
WHERE email = 'venkatagiriraju.jicate@jkkn.ac.in';

-- 2. If user doesn't exist, create the user
-- Replace the values as needed
INSERT INTO users (
  id,
  email,
  full_name,
  phone_number,
  role,
  institution_id,
  is_super_admin,
  permissions,
  profile_completed,
  created_at,
  updated_at
)
VALUES (
  gen_random_uuid(),  -- Auto-generate UUID
  'venkatagiriraju.jicate@jkkn.ac.in',
  'Venkatagiriraju',
  NULL,  -- Add phone number if available
  'Super Administrator',
  'jkkn_institution_id',  -- Replace with actual institution ID
  true,  -- Super admin flag
  jsonb_build_object(
    'admin_access', true,
    'transport_access', true,
    'staff_access', true,
    'manage_users', true,
    'manage_transport', true,
    'view_admin_dashboard', true
  ),
  true,  -- Profile completed
  now(),
  now()
)
ON CONFLICT (email) DO UPDATE SET
  is_super_admin = true,
  role = 'Super Administrator',
  permissions = jsonb_build_object(
    'admin_access', true,
    'transport_access', true,
    'staff_access', true,
    'manage_users', true,
    'manage_transport', true,
    'view_admin_dashboard', true
  ),
  updated_at = now();

-- 3. Verify the user was created/updated
SELECT 
  id, 
  email, 
  full_name, 
  role, 
  is_super_admin,
  permissions,
  institution_id,
  created_at
FROM users 
WHERE email = 'venkatagiriraju.jicate@jkkn.ac.in';

-- 4. Also check if there's a password/authentication record needed
-- (This might be in a separate table depending on auth server setup)
SELECT * FROM user_credentials WHERE user_id = (
  SELECT id FROM users WHERE email = 'venkatagiriraju.jicate@jkkn.ac.in'
);

-- 5. If using a separate authentication table, you may need to create a record there too
-- Example (adjust based on actual auth server schema):
-- INSERT INTO user_credentials (user_id, password_hash, provider)
-- VALUES (
--   (SELECT id FROM users WHERE email = 'venkatagiriraju.jicate@jkkn.ac.in'),
--   'hashed_password',  -- Use proper password hashing
--   'local'
-- );

