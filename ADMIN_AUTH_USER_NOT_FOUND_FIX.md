# Admin Authentication - User Not Found Fix

## 🐛 Issue Identified

The auth server is returning an error during token exchange:

```json
{
  "error": "invalid_grant",
  "error_description": "User not found",
  "error_uri": "https://auth.jkkn.ai/docs/errors#invalid_grant"
}
```

**Source:** https://tmsadmin.jkkn.ai/auth/callback

**Error Location:** Token exchange endpoint at `https://auth.jkkn.ai/api/auth/token`

## ✅ Root Cause

The user `venkatagiriraju.jicate@jkkn.ac.in` **does not exist** in the auth server's user database. 

This is different from the previous issues:
1. ✅ OAuth authorization flow works (got authorization code)
2. ✅ Endpoint is correct (`/api/auth/authorize`)
3. ✅ Scopes are correct (`read write profile`)
4. ❌ **User is not registered in auth server database**

## 🔧 Solution Options

### **Option 1: Register User in Auth Server Database (Recommended)**

Run the SQL script to register your user in the auth server database:

```bash
# See: register-admin-user.sql
```

**Steps:**
1. Access your auth server database (Supabase dashboard)
2. Go to SQL Editor
3. Run the provided SQL script: `register-admin-user.sql`
4. This will create/update your user with super admin privileges

**SQL Preview:**
```sql
INSERT INTO users (
  email,
  full_name,
  role,
  is_super_admin,
  permissions,
  ...
)
VALUES (
  'venkatagiriraju.jicate@jkkn.ac.in',
  'Venkatagiriraju',
  'Super Administrator',
  true,
  jsonb_build_object('admin_access', true, ...),
  ...
);
```

### **Option 2: Use Self-Registration Feature**

If the auth server has a self-registration or sign-up feature:

1. Go to the auth server's registration page
2. Create an account with `venkatagiriraju.jicate@jkkn.ac.in`
3. After registration, update the user in database to set `is_super_admin = true`

### **Option 3: Contact Auth Server Administrator**

If you don't have direct database access:
1. Contact the auth server administrator
2. Request user creation for `venkatagiriraju.jicate@jkkn.ac.in`
3. Ensure super admin privileges are granted

## 📊 User Database Requirements

The auth server needs a user record with:

| Field | Value | Required |
|-------|-------|----------|
| `email` | `venkatagiriraju.jicate@jkkn.ac.in` | ✅ Yes |
| `full_name` | `Venkatagiriraju` | ✅ Yes |
| `role` | `Super Administrator` or `admin` | ✅ Yes |
| `is_super_admin` | `true` | ✅ Yes |
| `institution_id` | Your institution ID | ⚠️ Recommended |
| `permissions` | Admin permissions object | ⚠️ Recommended |
| `password_hash` | Hashed password | ⚠️ If using password auth |

## 🔍 Debugging Steps

### 1. Check if User Exists in Auth Server

Run this query in the auth server database:

```sql
SELECT id, email, full_name, role, is_super_admin, permissions
FROM users 
WHERE email = 'venkatagiriraju.jicate@jkkn.ac.in';
```

**Expected Result:**
- If returns 0 rows → User doesn't exist (need to create)
- If returns 1 row → User exists (check role and permissions)

### 2. Verify Application Registration

Check if the admin app is properly registered:

```sql
SELECT app_id, app_name, allowed_redirect_uris, is_active
FROM applications
WHERE app_id = 'tms_admin_portal_mfhsyxnn';
```

**Should return:**
```
app_id: tms_admin_portal_mfhsyxnn
app_name: TMS Admin Portal
allowed_redirect_uris: ["http://tmsadmin.jkkn.ai/auth/callback", ...]
is_active: true
```

### 3. Check Redirect URI Match

Ensure the redirect URI in your `.env.local` **exactly matches** what's in the database:

**.env.local:**
```env
NEXT_PUBLIC_REDIRECT_URI=http://tmsadmin.jkkn.ai/auth/callback
```

**Database:**
```sql
SELECT allowed_redirect_uris 
FROM applications 
WHERE app_id = 'tms_admin_portal_mfhsyxnn';
```

Should include: `"http://tmsadmin.jkkn.ai/auth/callback"`

## 🎯 After Fixing

Once the user is registered in the auth server database:

1. **Clear browser cache and cookies**
2. **Try logging in again**
3. **Expected flow:**
   ```
   ✅ Click "Continue with MyJKKN"
   ✅ Redirect to auth server
   ✅ Enter credentials (if not already logged in)
   ✅ Auth server validates user EXISTS
   ✅ Redirect back with authorization code
   ✅ Token exchange succeeds (user found!)
   ✅ Admin role validated
   ✅ Redirect to dashboard - LOGGED IN!
   ```

## 🔐 Security Note

When creating users in production:
- ✅ Use proper password hashing (bcrypt, argon2)
- ✅ Set strong passwords
- ✅ Enable 2FA if available
- ✅ Limit super admin accounts to essential personnel
- ✅ Audit user access regularly

## 📝 Common Database Schemas

### Users Table (Typical Structure)
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50),
  role VARCHAR(100) NOT NULL,
  institution_id VARCHAR(100),
  is_super_admin BOOLEAN DEFAULT false,
  permissions JSONB DEFAULT '{}'::jsonb,
  profile_completed BOOLEAN DEFAULT false,
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  last_login TIMESTAMP
);
```

### User Credentials Table (If Separate)
```sql
CREATE TABLE user_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  provider VARCHAR(50) DEFAULT 'local',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

## 🚨 Important Notes

1. **Database Access**: You need access to the auth server's database
2. **Schema Variations**: Actual table structure may differ
3. **Password Auth**: If auth server uses passwords, you'll need to set one
4. **SSO**: If using SSO (Google, etc.), user might be auto-created
5. **Parent App vs Auth Server**: These might be different databases!

## ✅ Verification Checklist

After creating the user:

- [ ] User exists in auth server database
- [ ] User has `is_super_admin = true`
- [ ] User has valid role (contains "admin")
- [ ] User has permissions object (if required)
- [ ] Password/credentials are set (if using password auth)
- [ ] Application redirect URI is correct
- [ ] Can login to auth server directly
- [ ] Token exchange succeeds
- [ ] Admin app recognizes user

## 🎉 Expected Result

Once the user is properly registered:
```
🔄 Login Flow
├─ ✅ OAuth authorization succeeds
├─ ✅ Token exchange succeeds (user found!)
├─ ✅ Admin validation passes
└─ ✅ Dashboard access granted

👤 User: venkatagiriraju.jicate@jkkn.ac.in
🎫 Role: Super Administrator
🔑 Super Admin: true
📍 Status: AUTHENTICATED
```

---

## 📞 Next Steps

1. **Run `register-admin-user.sql`** in auth server database
2. **Verify user creation** with SELECT query
3. **Try logging in again**
4. **Share results** if still encountering issues

The OAuth flow is working perfectly - we just need your user account in the auth server database! 🚀
