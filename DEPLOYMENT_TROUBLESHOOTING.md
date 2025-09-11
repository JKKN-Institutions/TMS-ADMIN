# Admin App Deployment Issue: "Something went wrong"

## Problem Description

The admin app shows "Something went wrong" after deployment while the passenger app works fine with the same Supabase setup.

## Root Cause Analysis

The issue is caused by **missing environment variables** in the admin app's deployment environment. The admin app's database service throws an error immediately when the module is imported if environment variables are missing, while the passenger app handles this more gracefully.

## Key Differences Between Apps

### Admin App (`admin/lib/database.ts`)
```typescript
// This throws an error immediately when the module is imported
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables')
}
```

### Passenger App (`passenger/lib/supabase.ts`)
```typescript
// This uses lazy initialization - error only happens when actually used
function getSupabaseClient() {
  if (!_supabase) {
    // Environment variables checked here, not at module level
    // ...
  }
  return _supabase;
}
```

## Solution Steps

### 1. Verify Environment Variables in Vercel

For the **admin app** deployment, ensure these environment variables are set:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 2. Check Variable Names

The admin app uses `SUPABASE_SERVICE_ROLE_KEY` while the passenger app might use `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Make sure you're using the correct variable names for each app.

**Admin App Environment Variables:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (Service Role Key - for server-side operations)

**Passenger App Environment Variables:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Anonymous Key - for client-side operations)

### 3. Verify in Vercel Dashboard

1. Go to your Vercel dashboard
2. Select the admin app project
3. Go to **Settings** → **Environment Variables**
4. Ensure both variables are set with the correct values
5. **Important**: Redeploy after adding/changing environment variables

### 4. Test Environment Variables

Add this temporary API route to test environment variables:

**File: `admin/app/api/test-env/route.ts`**
```typescript
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    nodeEnv: process.env.NODE_ENV,
    // Don't log actual values for security
    supabaseUrlLength: process.env.NEXT_PUBLIC_SUPABASE_URL?.length || 0,
    serviceKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
  })
}
```

### 5. Build-Time vs Runtime Variables

Ensure you're using the correct variable types:

- `NEXT_PUBLIC_*` variables are available in the browser
- Non-prefixed variables are only available on the server
- The admin app needs both types

### 6. Check Build Logs

In Vercel's deployment logs, look for:
- Environment variable loading errors
- Build-time errors related to missing variables
- Any warnings about missing configuration

## Quick Fix Commands

### Check Current Environment Variables
```bash
# In your admin app directory
npm run dev
# Check if the app starts locally with your .env.local file
```

### Verify Health Endpoint
```bash
# Test your deployed admin app
curl https://your-admin-app.vercel.app/api/health
```

### Expected Response
```json
{
  "status": "healthy",
  "message": "TMS Admin application is running",
  "database": "connected",
  "timestamp": "2025-01-02T10:30:00.000Z"
}
```

## Prevention

To prevent this issue in the future:

1. **Use lazy initialization** for database clients (like the passenger app)
2. **Add proper error boundaries** with informative messages
3. **Test deployment with missing environment variables**
4. **Document required environment variables** clearly

## Still Having Issues?

If the admin app still shows "Something went wrong":

1. Check the browser console for specific error messages
2. Check Vercel's function logs for server-side errors
3. Verify that the health endpoint (`/api/health`) works
4. Compare environment variable setup between admin and passenger apps
5. Try redeploying after ensuring all environment variables are set

The improved error boundary will now show specific messages about missing environment variables, making it easier to diagnose the issue. 