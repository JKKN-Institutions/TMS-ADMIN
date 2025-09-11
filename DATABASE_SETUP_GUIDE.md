# Database Setup Guide for TMS Admin System

## Overview

This guide will help you set up the database with **real admin users** and proper environment configuration to replace the mock data currently being used.

## Current Admin Users in Database

The database contains these real admin users with specific roles:

| Role                  | Name                     | Login ID | Password      | Permissions                                   |
| --------------------- | ------------------------ | -------- | ------------- | --------------------------------------------- |
| **Super Admin**       | Super Administrator      | SA001    | superadmin123 | Full system access                            |
| **Transport Manager** | Transport Manager        | TM001    | transport123  | Routes, Drivers, Vehicles, Schedules          |
| **Finance Admin**     | Finance Administrator    | FA001    | finance123    | Payments, Financial Reports                   |
| **Operations Admin**  | Operations Administrator | OA001    | operations123 | Students, Bookings, Notifications, Grievances |
| **Data Entry**        | Data Entry Operator      | DE001    | dataentry123  | Student Management                            |

## Step 1: Environment Configuration

### 1.1 Create Environment File

```bash
# Copy the template
cp .env.local.template .env.local
```

### 1.2 Fill in Your Supabase Credentials

Edit `.env.local` with your actual Supabase project details:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Application Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3001
NODE_ENV=development
```

### 1.3 Get Your Supabase Credentials

1. **Go to your Supabase project dashboard**
2. **Navigate to Settings > API**
3. **Copy the values:**
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon/public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

## Step 2: Database Setup

### 2.1 Run Database Migrations

Execute the SQL files in order in your Supabase SQL editor:

```sql
-- 1. Core schema
\i supabase/01-schema.sql

-- 2. Indexes and triggers
\i supabase/02-indexes-triggers.sql

-- 3. RLS policies
\i supabase/03-rls-policies-simple.sql

-- 4. Seed data
\i supabase/04-seed-data.sql

-- 5. Admin credentials (Creates the 5 admin users)
\i supabase/05-admin-credentials.sql

-- 6. Enhanced grievance system
\i supabase/25-enhanced-grievance-assignment-tracking.sql

-- 7. Real admin data and functions
\i supabase/26-populate-real-admin-data.sql
```

### 2.2 Verify Database Setup

Run this query to verify your admin users are set up correctly:

```sql
-- Check admin users
SELECT
    au.name,
    au.email,
    au.role,
    au.is_active,
    alm.admin_id as login_id
FROM admin_users au
JOIN admin_login_mapping alm ON au.id = alm.admin_user_id
WHERE au.is_active = true;

-- Test the staff function
SELECT * FROM get_available_admin_staff();
```

## Step 3: Test the Connection

### 3.1 Test Database Connection

Run this command to test your connection:

```bash
npm run db:status
```

### 3.2 Test Admin Staff API

After setting up environment variables, test the API:

```bash
curl http://localhost:3001/api/admin/staff
```

**Expected Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "name": "Super Administrator",
      "email": "superadmin@tms.local",
      "role": "super_admin",
      "currentWorkload": 0,
      "maxCapacity": 50,
      "workloadPercentage": 0,
      "specializations": [
        "complaint",
        "suggestion",
        "compliment",
        "technical_issue"
      ],
      "skillLevel": 5,
      "isAvailable": true,
      "workloadStatus": "available"
    }
    // ... other admin users
  ],
  "meta": {
    "total": 5,
    "available": 5,
    "overloaded": 0
  }
}
```

## Step 4: Admin User Specializations

Each admin user has specific specializations for handling grievances:

- **Super Admin**: All categories (complaint, suggestion, compliment, technical_issue)
- **Operations Admin**: complaint, technical_issue
- **Transport Manager**: complaint, suggestion
- **Finance Admin**: complaint
- **Data Entry**: complaint

## Step 5: Bulk Assignment Features

The system supports:

1. **Single Assignment**: Assign all grievances to one admin
2. **Smart Distribution**: Distribute based on:
   - Balanced workload
   - Priority-based assignment
   - Category-based specialization

## Step 6: Assignee-Side Features

Each admin user will have access to:

1. **Assigned Grievances Dashboard**
2. **Workload Management**
3. **Activity Tracking**
4. **Performance Metrics**

## Troubleshooting

### Issue: Still seeing mock data

- Verify environment variables are correctly set
- Restart the development server: `npm run dev`
- Check database connection in browser console

### Issue: Function not found

- Ensure all SQL migration files are executed
- Verify the `get_available_admin_staff()` function exists

### Issue: Authentication errors

- Check RLS policies are properly set up
- Verify admin users exist in the database

## Next Steps

1. **Set up environment variables** (Step 1)
2. **Run database migrations** (Step 2)
3. **Test the connection** (Step 3)
4. **Login with real admin credentials** using the Login IDs above

Once set up, the bulk assign grievances modal will show real admin users instead of mock data, and you'll have full grievance assignment functionality.
