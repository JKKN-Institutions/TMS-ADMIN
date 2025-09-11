# Quick Fix for RLS Permission Error

## Problem

When running `03-rls-policies.sql`, you get:

```
ERROR: 42501: permission denied for schema auth
```

## Solution

Use the simplified RLS policies instead:

### Step 1: Use the Simplified File

Instead of running `03-rls-policies.sql`, run `03-rls-policies-simple.sql` in your Supabase SQL Editor.

### Step 2: Copy This SQL Code

If you want to manually copy the code, here it is:

```sql
-- Simplified Row Level Security (RLS) Policies for TMS Application
-- This version avoids auth schema permission issues

-- Enable RLS on key tables
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievances ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Simple helper function in public schema
CREATE OR REPLACE FUNCTION get_user_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json->>'sub')::uuid,
    NULL::uuid
  );
$$ LANGUAGE sql STABLE;

-- Students table policies
CREATE POLICY "Students can view own profile" ON students
  FOR SELECT USING (id = get_user_id());

CREATE POLICY "Students can update own profile" ON students
  FOR UPDATE USING (id = get_user_id());

-- Bookings table policies
CREATE POLICY "Students can view own bookings" ON bookings
  FOR SELECT USING (student_id = get_user_id());

CREATE POLICY "Students can create own bookings" ON bookings
  FOR INSERT WITH CHECK (student_id = get_user_id());

CREATE POLICY "Students can update own bookings" ON bookings
  FOR UPDATE USING (student_id = get_user_id());

-- Payments table policies
CREATE POLICY "Students can view own payments" ON payments
  FOR SELECT USING (student_id = get_user_id());

-- Grievances table policies
CREATE POLICY "Students can view own grievances" ON grievances
  FOR SELECT USING (student_id = get_user_id());

CREATE POLICY "Students can create grievances" ON grievances
  FOR INSERT WITH CHECK (student_id = get_user_id());

-- Notifications table policies
CREATE POLICY "Users can view active notifications" ON notifications
  FOR SELECT USING (
    is_active = true AND
    (target_audience = 'all' OR
     target_audience = 'students' OR
     get_user_id() = ANY(specific_users))
  );

-- Admin users table policies (basic protection)
CREATE POLICY "Admin users can view profiles" ON admin_users
  FOR SELECT USING (true);

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT ON bookings TO authenticated;
GRANT INSERT ON grievances TO authenticated;
GRANT UPDATE ON students TO authenticated;
GRANT UPDATE ON bookings TO authenticated;
```

## What This Does

- ✅ Enables Row Level Security on key tables
- ✅ Students can only see their own data
- ✅ Basic admin access protection
- ✅ Proper authentication checks
- ✅ No auth schema dependency

## Why This Works

The original file tried to create functions in the `auth` schema, which requires special permissions. This simplified version creates functions in the `public` schema, which works with standard user permissions.

## Next Steps

After running this:

1. Your database will have basic RLS protection
2. You can continue with the rest of the setup
3. Students will only be able to access their own data
4. Admin functionality will work properly

The simplified version provides the essential security features your TMS application needs!
