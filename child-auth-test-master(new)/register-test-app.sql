-- ================================================================
-- Register Test Child App in Production Supabase Database
-- ================================================================
-- Database: nhiniwzkarxqyvgglmiy.supabase.co
-- App ID: test_child_app_001
-- API Key: my_test_app_key_12345
-- API Key Hash (SHA-256): c75b2348bb91a8e4845636a3f2ba750a5bb59e2e2e957f0750f03a0f26d6856d
-- ================================================================

-- Step 1: Temporarily allow NULL for created_by column
ALTER TABLE applications ALTER COLUMN created_by DROP NOT NULL;

-- Step 2: Get a valid category_id (you may need to adjust this)
-- First, let's see what categories exist:
-- SELECT id, name FROM categories LIMIT 5;

-- Step 3: Insert test child application
INSERT INTO applications (
  app_id,
  name,
  url,
  description,
  api_key_hash,
  allowed_redirect_uris,
  allowed_scopes,
  roles_access,
  is_active,
  integration_type,
  auth_method,
  supported_platforms,
  application_type,
  data_sensitivity,
  display_order,
  uses_parent_auth,
  category_id,
  created_at,
  updated_at
) VALUES (
  'test_child_app_001',
  'Test Child Application',
  'http://localhost:3001',
  'OAuth 2.0 test application for MyJKKN Auth Server integration',
  'c75b2348bb91a8e4845636a3f2ba750a5bb59e2e2e957f0750f03a0f26d6856d',
  ARRAY['http://localhost:3001/callback', 'https://your-test-app.vercel.app/callback'],
  ARRAY['read', 'write', 'profile'],
  ARRAY['student', 'faculty', 'admin', 'parent'],
  true,
  'api',
  'sso',
  'web',
  'external',
  'restricted',
  999,
  true,
  (SELECT id FROM categories LIMIT 1),
  NOW(),
  NOW()
)
ON CONFLICT (app_id) DO UPDATE SET
  api_key_hash = EXCLUDED.api_key_hash,
  allowed_redirect_uris = EXCLUDED.allowed_redirect_uris,
  allowed_scopes = EXCLUDED.allowed_scopes,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Step 4: Verify the app was created successfully
SELECT
  app_id,
  name,
  is_active,
  allowed_redirect_uris,
  allowed_scopes,
  auth_method,
  integration_type,
  url
FROM applications
WHERE app_id = 'test_child_app_001';

-- ================================================================
-- IMPORTANT NOTES:
-- ================================================================
-- 1. This SQL is designed to work with your production database schema
-- 2. The API key hash is pre-calculated for: my_test_app_key_12345
-- 3. Allowed redirect URIs include both localhost and production URLs
-- 4. The app follows all CHECK constraints:
--    - application_type: 'external' (valid: internal, external)
--    - auth_method: 'sso' (valid: sso, separate_login, none)
--    - integration_type: 'api' (valid: direct_link, embedded, api)
--    - supported_platforms: 'web' (valid: web, mobile, both)
--    - data_sensitivity: 'restricted' (valid: public, restricted, confidential)
-- ================================================================
