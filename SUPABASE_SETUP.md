# TMS Supabase Database Setup Guide

This guide will help you set up a complete Supabase database for your Transportation Management System (TMS) application.

## 🎯 Overview

The TMS database includes:

- **20 Core Tables** with proper relationships
- **Row Level Security (RLS)** for data protection
- **Automated Triggers** for data consistency
- **Performance Indexes** for fast queries
- **Sample Data** for testing

## 📋 Prerequisites

1. [Supabase Account](https://supabase.com) (free tier is sufficient)
2. Node.js 18+ installed
3. Basic understanding of SQL and PostgreSQL

## 🚀 Step-by-Step Setup

### 1. Create Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Click **"New Project"**
3. Choose your organization
4. Fill in project details:
   - **Name**: `tms-production` (or your preferred name)
   - **Database Password**: Generate a strong password
   - **Region**: Choose closest to your users
5. Click **"Create new project"**
6. Wait for project initialization (2-3 minutes)

### 2. Get Project Credentials

From your Supabase project dashboard:

1. Go to **Settings** → **API**
2. Copy the following values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **Anon public key**: `eyJhb...` (safe to use in frontend)
   - **Service role key**: `eyJhb...` (keep secret, server-side only)

### 3. Run Database Schema

Go to **SQL Editor** in your Supabase dashboard and run the following files in order:

#### A. Main Schema (01-schema.sql)

```sql
-- Copy and paste the entire content from supabase/01-schema.sql
-- This creates all tables, relationships, and constraints
```

#### B. Indexes and Triggers (02-indexes-triggers.sql)

```sql
-- Copy and paste the entire content from supabase/02-indexes-triggers.sql
-- This adds performance indexes and automated triggers
```

#### C. Row Level Security (Use Simplified Version)

**⚠️ Important**: If you get "permission denied for schema auth" error, use the simplified version:

```sql
-- Copy and paste the entire content from supabase/03-rls-policies-simple.sql
-- This simplified version avoids auth schema permission issues
-- It provides basic RLS protection for students and admin users
```

**Alternative** (if you have service role access):

```sql
-- Copy and paste the entire content from supabase/03-rls-policies.sql
-- This sets up comprehensive data access control and security
```

#### D. Sample Data (04-seed-data.sql) [Optional]

```sql
-- Copy and paste the content to insert sample data for testing
-- This includes sample institutions, users, routes, etc.
```

### 4. Configure Environment Variables

Create a `.env.local` file in your project root:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Application Configuration
NEXTAUTH_SECRET=your_random_secret_key
NEXTAUTH_URL=http://localhost:3000

# Optional: Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

### 5. Install Required Dependencies

```bash
npm install @supabase/supabase-js
# or
yarn add @supabase/supabase-js
```

### 6. Test the Connection

Create a simple test file to verify connection:

```javascript
// test-supabase.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testConnection() {
  try {
    const { data, error } = await supabase
      .from("institutions")
      .select("*")
      .limit(1);

    if (error) {
      console.error("Connection failed:", error);
    } else {
      console.log("✅ Connection successful!", data);
    }
  } catch (err) {
    console.error("❌ Connection error:", err);
  }
}

testConnection();
```

## 🔐 Authentication Setup

### 1. Configure Auth Settings

In Supabase Dashboard → **Authentication** → **Settings**:

1. **Site URL**: `http://localhost:3000` (development) / your domain (production)
2. **Redirect URLs**: Add your callback URLs
3. **Email Templates**: Customize if needed
4. **Enable Email Confirmation**: Recommended for production

### 2. Create Admin Users

Use the SQL Editor to create your first admin user:

```sql
-- Create admin user in auth.users
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  uuid_generate_v4(),
  'authenticated',
  'authenticated',
  'admin@yourdomain.com',
  crypt('your_password', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
);

-- Create corresponding admin_users record
INSERT INTO admin_users (id, name, email, role, is_active)
SELECT
  id,
  'Super Admin',
  email,
  'super_admin',
  true
FROM auth.users
WHERE email = 'admin@yourdomain.com';

-- Add permissions
INSERT INTO admin_permissions (admin_user_id, module, actions)
SELECT
  id,
  'all',
  ARRAY['read', 'create', 'update', 'delete']
FROM admin_users
WHERE email = 'admin@yourdomain.com';
```

## 📊 Verify Installation

### 1. Check Tables

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

### 2. Check RLS Policies

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public';
```

### 3. Check Triggers

```sql
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public';
```

## 🔧 Configuration Options

### Performance Tuning

- **Connection Pooling**: Supabase handles this automatically
- **Query Optimization**: Use proper indexes (already included)
- **Caching**: Implement Redis for frequently accessed data

### Security Best Practices

1. **Never expose service role key** in frontend code
2. **Use RLS policies** for all data access
3. **Validate user permissions** before operations
4. **Regular backups** using Supabase dashboard

### Monitoring

- **Dashboard Analytics**: Built into Supabase
- **Query Performance**: Monitor in SQL Editor
- **Error Tracking**: Implement in your application

## 🚨 Troubleshooting

### Common Issues

1. **Connection Errors**

   - Verify environment variables
   - Check project URL and keys
   - Ensure project is active

2. **"Permission denied for schema auth" Error**

   - **Problem**: `ERROR: 42501: permission denied for schema auth`
   - **Cause**: Regular users cannot create functions in the protected `auth` schema
   - **Solution**: Use `03-rls-policies-simple.sql` instead of `03-rls-policies.sql`
   - **Note**: The simplified version provides basic RLS protection without auth schema access

3. **RLS Permission Denied**

   - Check RLS policies are correctly applied
   - Verify user authentication
   - Confirm admin permissions are set up

4. **Schema Errors**

   - Run SQL files in correct order
   - Check for foreign key constraints
   - Verify enum types

5. **Trigger Failures**
   - Check trigger function syntax
   - Verify permissions
   - Review error logs

### Debug Commands

```sql
-- Check RLS status
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- View function definitions
SELECT proname, prosrc
FROM pg_proc
WHERE proname LIKE '%update%';

-- Check sequences
SELECT sequence_name, last_value
FROM information_schema.sequences;
```

## 📈 Next Steps

1. **Deploy to Production**: Update environment variables
2. **Set up Backups**: Configure automated backups
3. **Monitor Performance**: Use Supabase analytics
4. **Scale as Needed**: Upgrade plan if required

## 🆘 Support

- **Supabase Docs**: [https://supabase.com/docs](https://supabase.com/docs)
- **Community Support**: [https://github.com/supabase/supabase/discussions](https://github.com/supabase/supabase/discussions)
- **Database Issues**: Check Supabase Dashboard logs

---

## 📝 Database Schema Summary

### Core Entities

- **Institutions** → **Departments** → **Programs**
- **Students** with **Transport Profiles** and **Route Allocations**
- **Routes** with **Stops**, **Drivers**, and **Vehicles**
- **Schedules** and **Bookings** for trip management
- **Payments** and **Notifications** for operations
- **Grievances** for feedback management

### User Types

- **Super Admin**: Full system access
- **Transport Manager**: Routes, drivers, vehicles
- **Finance Admin**: Payments and financial data
- **Operations Admin**: Students, bookings, grievances
- **Data Entry**: Limited student management

### Security Features

- Row Level Security on all tables
- Role-based access control
- Data isolation between user types
- Automated audit trails

This setup provides a robust, scalable foundation for your TMS application!
