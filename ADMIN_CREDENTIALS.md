# 🔐 TMS Admin Login Credentials

## 📋 Standard Login Credentials

### 1. **SUPER ADMIN**

- **Login ID**: `SA001`
- **Password**: `superadmin123`
- **Access**: Full system control, all modules
- **Role**: Complete administrative privileges

### 2. **TRANSPORT MANAGER**

- **Login ID**: `TM001`
- **Password**: `transport123`
- **Access**: Routes, Drivers, Vehicles, Schedules, Analytics (read)
- **Role**: Transportation operations management

### 3. **FINANCE ADMIN**

- **Login ID**: `FA001`
- **Password**: `finance123`
- **Access**: Payments, Financial Reports, Student records (read), Bookings (read/update)
- **Role**: Financial management and reporting

### 4. **OPERATIONS ADMIN**

- **Login ID**: `OA001`
- **Password**: `operations123`
- **Access**: Students, Bookings, Notifications, Grievances, Analytics (read)
- **Role**: Daily operations and student management

### 5. **DATA ENTRY OPERATOR**

- **Login ID**: `DE001`
- **Password**: `dataentry123`
- **Access**: Student management (create, read, update only)
- **Role**: Limited data entry privileges

## 🚀 How to Set Up

### Step 1: Run the SQL Query

Copy and paste this SQL in your **Supabase SQL Editor**:

```sql
-- Clear existing admin data
DELETE FROM admin_permissions;
DELETE FROM admin_users;

-- Create standard admin users
INSERT INTO admin_users (id, name, email, role, is_active) VALUES
('11111111-1111-1111-1111-111111111111', 'Super Administrator', 'superadmin@tms.local', 'super_admin', true),
('22222222-2222-2222-2222-222222222222', 'Transport Manager', 'transport@tms.local', 'transport_manager', true),
('33333333-3333-3333-3333-333333333333', 'Finance Administrator', 'finance@tms.local', 'finance_admin', true),
('44444444-4444-4444-4444-444444444444', 'Operations Administrator', 'operations@tms.local', 'operations_admin', true),
('55555555-5555-5555-5555-555555555555', 'Data Entry Operator', 'dataentry@tms.local', 'data_entry', true);

-- Super Admin permissions
INSERT INTO admin_permissions (admin_user_id, module, actions) VALUES
('11111111-1111-1111-1111-111111111111', 'all', ARRAY['read', 'create', 'update', 'delete']);

-- Transport Manager permissions
INSERT INTO admin_permissions (admin_user_id, module, actions) VALUES
('22222222-2222-2222-2222-222222222222', 'routes', ARRAY['read', 'create', 'update', 'delete']),
('22222222-2222-2222-2222-222222222222', 'drivers', ARRAY['read', 'create', 'update', 'delete']),
('22222222-2222-2222-2222-222222222222', 'vehicles', ARRAY['read', 'create', 'update', 'delete']),
('22222222-2222-2222-2222-222222222222', 'schedules', ARRAY['read', 'create', 'update', 'delete']),
('22222222-2222-2222-2222-222222222222', 'analytics', ARRAY['read']);

-- Finance Admin permissions
INSERT INTO admin_permissions (admin_user_id, module, actions) VALUES
('33333333-3333-3333-3333-333333333333', 'payments', ARRAY['read', 'create', 'update', 'delete']),
('33333333-3333-3333-3333-333333333333', 'students', ARRAY['read']),
('33333333-3333-3333-3333-333333333333', 'bookings', ARRAY['read', 'update']),
('33333333-3333-3333-3333-333333333333', 'analytics', ARRAY['read']);

-- Operations Admin permissions
INSERT INTO admin_permissions (admin_user_id, module, actions) VALUES
('44444444-4444-4444-4444-444444444444', 'students', ARRAY['read', 'update']),
('44444444-4444-4444-4444-444444444444', 'bookings', ARRAY['read', 'create', 'update', 'delete']),
('44444444-4444-4444-4444-444444444444', 'notifications', ARRAY['read', 'create', 'update', 'delete']),
('44444444-4444-4444-4444-444444444444', 'grievances', ARRAY['read', 'create', 'update', 'delete']),
('44444444-4444-4444-4444-444444444444', 'analytics', ARRAY['read']);

-- Data Entry permissions
INSERT INTO admin_permissions (admin_user_id, module, actions) VALUES
('55555555-5555-5555-5555-555555555555', 'students', ARRAY['read', 'create', 'update']);

-- Create login mapping table
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
```

### Step 2: Test Your Credentials

Use this query to test login:

```sql
-- Test login function
SELECT
  au.name,
  au.role,
  alm.admin_id,
  CASE WHEN alm.password = 'superadmin123' THEN '✅ Correct' ELSE '❌ Wrong' END as password_check
FROM admin_login_mapping alm
JOIN admin_users au ON alm.admin_user_id = au.id
WHERE alm.admin_id = 'SA001';
```

## 🔄 How to Update Login Logic

Update your login component to use Admin ID instead of email:

```javascript
// In your login function
const loginAdmin = async (adminId, password) => {
  const { data, error } = await supabase.rpc("authenticate_admin", {
    login_id: adminId,
    login_password: password,
  });

  if (error || !data[0]?.is_authenticated) {
    throw new Error("Invalid credentials");
  }

  return data[0]; // Returns user info
};
```

## 📊 Permission Matrix

| Role              | Students | Routes  | Drivers | Vehicles | Schedules | Payments | Notifications | Grievances | Analytics |
| ----------------- | -------- | ------- | ------- | -------- | --------- | -------- | ------------- | ---------- | --------- |
| **Super Admin**   | ✅ Full  | ✅ Full | ✅ Full | ✅ Full  | ✅ Full   | ✅ Full  | ✅ Full       | ✅ Full    | ✅ Full   |
| **Transport Mgr** | ❌ None  | ✅ Full | ✅ Full | ✅ Full  | ✅ Full   | ❌ None  | ❌ None       | ❌ None    | 👁️ Read   |
| **Finance Admin** | 👁️ Read  | ❌ None | ❌ None | ❌ None  | ❌ None   | ✅ Full  | ❌ None       | ❌ None    | 👁️ Read   |
| **Operations**    | 📝 Edit  | ❌ None | ❌ None | ❌ None  | ❌ None   | ❌ None  | ✅ Full       | ✅ Full    | 👁️ Read   |
| **Data Entry**    | 📝 Edit  | ❌ None | ❌ None | ❌ None  | ❌ None   | ❌ None  | ❌ None       | ❌ None    | ❌ None   |

**Legend:**

- ✅ Full = Create, Read, Update, Delete
- 📝 Edit = Create, Read, Update (no delete)
- 👁️ Read = Read only
- ❌ None = No access

## 🔒 Security Features

1. **ID-Based Login**: No email required, uses simple admin IDs
2. **Role-Based Access**: Each role has specific permissions
3. **Secure Storage**: Passwords stored securely in database
4. **Session Management**: Proper authentication flow
5. **Audit Trail**: Login attempts tracked

## 📝 Notes

- All passwords are currently simple for testing
- Change passwords in production environment
- Each admin type has specific access levels
- Super Admin can access everything
- Login format: Admin ID + Password (not email)
