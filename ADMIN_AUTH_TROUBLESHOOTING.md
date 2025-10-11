# Admin Authentication Troubleshooting Guide

## Current Issue: "User not found" Error

### Error Details
```
error: "invalid_grant"
error_description: "User not found"
error_uri: "https://auth.jkkn.ai/docs/errors#invalid_grant"
```

### Root Cause
The authentication flow is working correctly, but the **user account doesn't exist in the auth server's database** (`auth.jkkn.ai`).

### Why This Happens
The centralized auth server (`auth.jkkn.ai`) is **separate** from the parent application (`jkkn.ai`). Being a super admin in the parent application does **NOT** automatically create an account in the auth server.

### Comparison with Passenger App
The passenger app works because:
1. Students are registered in the auth server during enrollment
2. The auth server has their credentials stored
3. When they login, the auth server finds their account and returns tokens

For the admin app to work, **admin users must also be registered in the auth server**.

---

## Solution Options

### Option 1: Register Admin User via Auth Server Admin Panel (Recommended)
If the auth server has an admin panel:
1. Login to `https://auth.jkkn.ai/admin` (or equivalent)
2. Navigate to Users section
3. Create a new user with:
   - Email: `venkatagiriraju.jicate@jkkn.ac.in`
   - Full Name: Your name
   - Role: `admin` or `staff`
   - is_super_admin: `true`
   - Institution ID: Your institution ID
   - Permissions: Relevant admin permissions

### Option 2: Register via SQL (If you have database access)
Run the provided SQL script `register-admin-user.sql` on the auth server's database:

```sql
-- Register admin user in auth server database
INSERT INTO users (
  id,
  email,
  full_name,
  role,
  is_super_admin,
  permissions,
  institution_id,
  created_at,
  updated_at,
  email_verified
) VALUES (
  gen_random_uuid(),
  'venkatagiriraju.jicate@jkkn.ac.in',
  'Venkata Giri Raju',
  'super_admin',
  true,
  jsonb_build_object(
    'users', true,
    'admin', true,
    'transport', true,
    'students', true,
    'staff', true,
    'routes', true,
    'vehicles', true,
    'drivers', true,
    'schedules', true,
    'reports', true
  ),
  'jkkn_college',
  now(),
  now(),
  true
)
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  is_super_admin = EXCLUDED.is_super_admin,
  permissions = EXCLUDED.permissions,
  updated_at = now();
```

### Option 3: Contact Auth Server Administrator
If you don't have direct access to the auth server:
1. Contact the auth server administrator
2. Request creation of an admin account
3. Provide your email and required permissions

### Option 4: Use Existing Test Account (For Testing)
If there's a test admin account already registered in the auth server:
1. Ask the auth server admin for test credentials
2. Use those credentials to login
3. Verify the admin app works correctly

---

## Verification Steps

### 1. Check if User Exists in Auth Server
Contact the auth server admin to verify if the user `venkatagiriraju.jicate@jkkn.ac.in` exists in the `users` table.

### 2. Check User Role/Permissions
If the user exists, verify:
- `role` field contains 'admin', 'staff', or similar
- `is_super_admin` is set to `true`
- `permissions` object is not empty
- `email_verified` is `true`

### 3. Test Authentication Flow
After registration:
1. Clear browser cache and localStorage
2. Go to `http://tmsadmin.jkkn.ai`
3. Click "Continue with MyJKKN"
4. Login with registered credentials
5. Check console for successful authentication logs

---

## Expected Success Logs

When authentication works, you should see:
```
✅ Token exchange successful!
👤 User: venkatagiriraju.jicate@jkkn.ac.in
🎫 Role: super_admin
🔑 Is Super Admin: true
✅ Admin access granted for: venkatagiriraju.jicate@jkkn.ac.in
✅ Role accepted: super_admin
📍 TMS-ADMIN: Authentication Complete
```

---

## Technical Details

### Authentication Flow
1. User clicks "Continue with MyJKKN"
2. Admin app redirects to: `https://auth.jkkn.ai/api/auth/authorize?client_id=tms_admin_portal_mfhsyxnn&...`
3. User logs in on auth server
4. Auth server validates credentials against its database
5. **If user not found → ERROR: "User not found"**
6. If found → Auth server redirects back with authorization code
7. Admin app exchanges code for tokens
8. Admin app validates user role/permissions
9. User logged into admin app

### Current Configuration
- Auth Server: `https://auth.jkkn.ai`
- App ID: `tms_admin_portal_mfhsyxnn`
- API Key: `app_149a294c473d403d_b33d88b6a6ebb84d`
- Redirect URI: `http://tmsadmin.jkkn.ai/auth/callback`

### Admin Role Validation (Very Permissive)
The admin app accepts users with:
- `is_super_admin === true` OR
- Role contains: admin, staff, faculty, teacher, transport, manager OR
- Has any permissions in `permissions` object OR
- Has an `institution_id`

---

## Additional Notes

### Why Not Just Allow All Users?
The admin portal provides access to sensitive operations:
- Managing all students, staff, drivers
- Financial reports and payments
- System configuration
- Security settings

Therefore, only verified admin/staff users should have access.

### Difference from Parent App
- **Parent App (`jkkn.ai`)**: Institution management system with its own user database
- **Auth Server (`auth.jkkn.ai`)**: Centralized authentication service for child applications
- These are **separate systems** with separate databases

### Next Steps
1. Register your admin account in the auth server
2. Verify registration was successful
3. Test login again
4. If successful, register other admin users who need access

