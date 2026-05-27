# TMS Authentication Flow — Implementation Plan

> **Document Type**: Detailed Implementation Plan
> **Date**: May 27, 2026
> **Status**: DRAFT — Awaiting confirmation before implementation
> **Architecture Change**: Same Supabase project (replaces original "separate Supabase" decision)
> **Parent Spec**: [TMS-SPEC.md](./TMS-SPEC.md) (some decisions superseded by this document)
> **Audience**: Engineer implementing TMS auth with zero context

---

## Table of Contents

1. [Architecture Decision: Same Supabase Project](#1-architecture-decision-same-supabase-project)
2. [What Changes from Original TMS-SPEC](#2-what-changes-from-original-tms-spec)
3. [Auth Flow Overview](#3-auth-flow-overview)
4. [Role & Permission Model](#4-role--permission-model)
5. [MyJKKN-Side Setup (Database Migrations)](#5-myjkkn-side-setup-database-migrations)
6. [TMS App: Supabase Client Setup](#6-tms-app-supabase-client-setup)
7. [TMS App: Proxy/Middleware (Route Protection)](#7-tms-app-proxymiddleware-route-protection)
8. [TMS App: Auth Callback & Login Flow](#8-tms-app-auth-callback--login-flow)
9. [TMS App: Auth Provider & Hooks](#9-tms-app-auth-provider--hooks)
10. [TMS App: Permission System (usePermissions)](#10-tms-app-permission-system-usepermissions)
11. [TMS App: Permission Guard Components](#11-tms-app-permission-guard-components)
12. [TMS App: Role-Based Routing & Dashboards](#12-tms-app-role-based-routing--dashboards)
13. [TMS App: Session Management](#13-tms-app-session-management)
14. [TMS App: Sign-Out Flow](#14-tms-app-sign-out-flow)
15. [Multi-Tenancy & Institution Scoping](#15-multi-tenancy--institution-scoping)
16. [Environment Variables](#16-environment-variables)
17. [File Structure](#17-file-structure)
18. [Implementation Phases](#18-implementation-phases)
19. [Security Checklist](#19-security-checklist)
20. [Testing Strategy](#20-testing-strategy)
21. [Appendix A: Complete Type Definitions](#appendix-a-complete-type-definitions)
22. [Appendix B: MyJKKN Auth Flow Reference](#appendix-b-myjkkn-auth-flow-reference)

---

## 1. Architecture Decision: Same Supabase Project

### What Changed

The original TMS-SPEC (March 2026) called for a **separate Supabase project** with shared JWT secret and B2A API for user sync. This plan supersedes that decision:

| Aspect | Original TMS-SPEC | This Plan |
|--------|-------------------|-----------|
| **Database** | Separate Supabase project | **Same Supabase project** as MyJKKN |
| **Auth** | Shared JWT secret, empty auth.users in TMS | **Same auth.users** — Google OAuth directly |
| **User data** | tms_users mirror table via B2A sync | **Direct access** to profiles, custom_roles, user_roles |
| **Permissions** | Fetched via B2A, cached in tms_users.permissions | **Direct SQL** via user_has_permission() |
| **Token refresh** | Redirect to MyJKKN (can't refresh in TMS) | **Native Supabase SSR** auto-refresh |
| **Access gate** | tms_users.access_status field | **Direct billing query** or access_status on profiles |
| **RLS** | auth.uid() mapped to tms_users.myjkkn_user_id | **auth.uid() = profiles.id** directly |

### Why This Is Better

1. **No user sync lag** — TMS sees profile changes immediately (no B2A polling)
2. **No mirror table** — Eliminates tms_users entirely for auth purposes
3. **Native token refresh** — Supabase SSR handles cookies/refresh automatically
4. **Simpler RLS** — Same auth.uid() works across all tables
5. **Fewer moving parts** — No B2A endpoints needed for auth/permissions
6. **Same permission functions** — `user_has_permission()`, `role_has_institution_access()` work directly
7. **Offline resilience** — Supabase client caches session locally

### What TMS Still Has Separately

- **Its own TMS-domain tables** (tms_routes, tms_vehicles, tms_schedules, etc.) — stored in the same Supabase project
- **Its own Next.js codebase** — separate repo, separate deployment at tms.jkkn.ai
- **Its own RLS policies** — using the shared auth functions

---

## 2. What Changes from Original TMS-SPEC

### Removed (No Longer Needed)

- ~~Separate Supabase project creation~~ → Same project
- ~~JWT secret copying~~ → Same auth system
- ~~tms_users mirror table~~ → Direct profiles access
- ~~B2A /verify-access endpoint~~ → Direct billing query
- ~~B2A /permissions endpoint~~ → Direct user_has_permission()
- ~~B2A /users/batch endpoint~~ → Direct profiles query
- ~~JWT health check (60s polling)~~ → Supabase auto-refresh
- ~~Token refresh redirect to MyJKKN~~ → Native refresh
- ~~Data sync cron jobs~~ → Real-time data
- ~~Batch sync with rate limiting~~ → Direct queries

### Kept (Still Valid)

- TMS permission keys (`tms.routes.manage`, `tms.vehicles.manage`, etc.)
- Role-based dashboard routing (student→/dashboard, admin→/admin, etc.)
- Access gate concept (paid transport bill = access)
- Multi-tenancy (institution_id on all TMS tables)
- Transport billing integration (MyJKKN billing module)
- Service request → enrollment flow
- Webhook on payment confirmation

### Modified

- **Access gate**: Instead of checking tms_users.access_status, TMS queries billing tables directly or uses a lightweight `tms_access` view/function
- **Role detection**: Instead of tms_users.role, reads from profiles.role + user_roles

---

## 3. Auth Flow Overview

### Login Flow Diagram

```
  User opens tms.jkkn.ai
       |
       v
  TMS proxy.ts checks Supabase session (cookies)
       |
       +-- No session → Redirect to /auth/login
       |
       +-- Has session → Validate user
            |
            v
       supabase.auth.getUser()
            |
            +-- Error/expired → Redirect to /auth/login
            |
            +-- Valid user → Fetch profile from profiles table
                 |
                 v
            Check: Does user have ANY tms.* permission?
            (via user_has_permission() or merged permissions check)
                 |
                 +-- No TMS permission → /unauthorized
                 |   "You don't have access to TMS.
                 |    Contact your administrator."
                 |
                 +-- Has TMS permission → Check access gate
                      |
                      v
                 Check: Transport bill paid? (for students)
                      |
                      +-- Paid/Grace → ALLOW → Role-based routing
                      |   (student→/dashboard, admin→/admin, etc.)
                      |
                      +-- Not paid → /access-denied
                      |   "Pay your transport bill to access TMS"
                      |
                      +-- Not a student (admin/staff/driver) → ALLOW
                          (access gate only applies to students)
```

### Key Principle: Two-Layer Access Control

1. **Layer 1 — Permission Gate**: Does the user have `tms.*` permissions in their role(s)?
   - Checked in proxy.ts on every request
   - Super admins bypass (always have access)
   - This is the "can you use TMS at all?" check

2. **Layer 2 — Billing Gate** (students only): Has the student paid their transport bill?
   - Checked after permission gate passes
   - Only applies to student role
   - Admin/staff/driver/faculty skip this check
   - Grace period: 7 days after route assignment

---

## 4. Role & Permission Model

### TMS Permission Keys (Expanded)

The original TMS-SPEC defined 7 permission keys. For a production-ready system with proper CRUD granularity:

```
tms.dashboard.view          — Access TMS dashboard
tms.routes.view             — View routes and stops
tms.routes.create           — Create new routes
tms.routes.edit             — Edit existing routes
tms.routes.delete           — Delete routes
tms.vehicles.view           — View fleet vehicles
tms.vehicles.create         — Add vehicles
tms.vehicles.edit           — Edit vehicle details
tms.vehicles.delete         — Remove vehicles
tms.drivers.view            — View driver list
tms.drivers.assign          — Assign drivers to routes/schedules
tms.drivers.manage          — Full driver management
tms.schedules.view          — View schedules
tms.schedules.create        — Create schedule templates
tms.schedules.edit          — Edit schedules
tms.schedules.delete        — Delete schedules
tms.bookings.view           — View own bookings (students)
tms.bookings.view_all       — View all bookings (admin/staff)
tms.bookings.create         — Create/request bookings
tms.bookings.manage         — Approve/reject/manage bookings
tms.attendance.view         — View own attendance (students)
tms.attendance.scan         — Scan QR codes (drivers)
tms.attendance.manage       — Full attendance management
tms.tracking.view           — View live bus tracking
tms.tracking.share          — Share GPS location (drivers)
tms.grievances.submit       — Submit grievances (students)
tms.grievances.view         — View grievances
tms.grievances.manage       — Respond to/resolve grievances
tms.reports.view            — Access analytics & reports
tms.reports.export          — Export report data
tms.settings.view           — View TMS settings
tms.settings.manage         — Manage TMS configuration
tms.enrollment.view         — View enrollment records
tms.enrollment.manage       — Manage student enrollments
```

### Role-Permission Matrix

| Permission | super_admin | transport_manager | faculty | student | driver |
|-----------|:-----------:|:-----------------:|:-------:|:-------:|:------:|
| tms.dashboard.view | Y | Y | Y | Y | Y |
| tms.routes.view | Y | Y | Y | Y | Y |
| tms.routes.create | Y | Y | - | - | - |
| tms.routes.edit | Y | Y | - | - | - |
| tms.routes.delete | Y | Y | - | - | - |
| tms.vehicles.view | Y | Y | - | - | - |
| tms.vehicles.create | Y | Y | - | - | - |
| tms.vehicles.edit | Y | Y | - | - | - |
| tms.vehicles.delete | Y | Y | - | - | - |
| tms.drivers.view | Y | Y | - | - | - |
| tms.drivers.assign | Y | Y | - | - | - |
| tms.drivers.manage | Y | Y | - | - | - |
| tms.schedules.view | Y | Y | Y | Y | Y |
| tms.schedules.create | Y | Y | - | - | - |
| tms.schedules.edit | Y | Y | - | - | - |
| tms.schedules.delete | Y | Y | - | - | - |
| tms.bookings.view | Y | Y | Y | Y | - |
| tms.bookings.view_all | Y | Y | - | - | - |
| tms.bookings.create | Y | Y | - | Y | - |
| tms.bookings.manage | Y | Y | - | - | - |
| tms.attendance.view | Y | Y | Y | Y | Y |
| tms.attendance.scan | Y | Y | - | - | Y |
| tms.attendance.manage | Y | Y | - | - | - |
| tms.tracking.view | Y | Y | Y | Y | - |
| tms.tracking.share | Y | - | - | - | Y |
| tms.grievances.submit | - | - | - | Y | - |
| tms.grievances.view | Y | Y | - | Y | - |
| tms.grievances.manage | Y | Y | - | - | - |
| tms.reports.view | Y | Y | - | - | - |
| tms.reports.export | Y | Y | - | - | - |
| tms.settings.view | Y | Y | - | - | - |
| tms.settings.manage | Y | Y | - | - | - |
| tms.enrollment.view | Y | Y | - | Y | - |
| tms.enrollment.manage | Y | Y | - | - | - |

### How Roles Get TMS Access

**Option A — Existing roles get TMS permissions (recommended for v1):**
- Add `tms.*` permissions to existing roles (`student`, `faculty`, `driver`) via migration
- Create a new `transport_manager` role with full TMS permissions
- Super admin automatically gets all permissions (no migration needed)

**Option B — Dynamic grant via MyJKKN Role Management UI:**
- Admin opens MyJKKN → Settings → Roles → Edit "student" role
- Toggles on `tms.dashboard.view`, `tms.bookings.create`, etc.
- Changes take effect immediately (usePermissions re-fetches on next load)

**Recommended: Use BOTH.** Migration seeds defaults; admin can customize per-institution.

---

## 5. MyJKKN-Side Setup (Database Migrations)

### Migration 1: Add TMS Permission Keys to Catalog

This migration adds TMS permission keys to the existing `PERMISSION_CATEGORIES` in MyJKKN so they appear in the Role Management UI.

**File**: `supabase/migrations/YYYYMMDD_add_tms_permission_keys.sql`

```sql
-- TMS Permission Keys Registration
-- These keys are checked via user_has_permission('tms.xxx') in RLS policies
-- They appear in Role Management UI for admin to grant/revoke

-- No schema changes needed — permission keys live in custom_roles.permissions JSONB
-- This migration seeds default TMS permissions for relevant roles

-- Step 1: Create transport_manager role (if not exists)
INSERT INTO custom_roles (
  id, role_key, role_name, description,
  is_system_role, institution_scope, module_scopes, permissions,
  created_at, updated_at
)
SELECT
  gen_random_uuid(),
  'transport_manager',
  'Transport Manager',
  'Full access to Transport Management System (TMS). Can manage routes, vehicles, drivers, schedules, enrollments, and reports.',
  true,  -- system role
  'own', -- institution-scoped by default
  '{"tms": "own_institution"}'::jsonb,
  '{
    "tms.dashboard.view": true,
    "tms.routes.view": true,
    "tms.routes.create": true,
    "tms.routes.edit": true,
    "tms.routes.delete": true,
    "tms.vehicles.view": true,
    "tms.vehicles.create": true,
    "tms.vehicles.edit": true,
    "tms.vehicles.delete": true,
    "tms.drivers.view": true,
    "tms.drivers.assign": true,
    "tms.drivers.manage": true,
    "tms.schedules.view": true,
    "tms.schedules.create": true,
    "tms.schedules.edit": true,
    "tms.schedules.delete": true,
    "tms.bookings.view": true,
    "tms.bookings.view_all": true,
    "tms.bookings.create": true,
    "tms.bookings.manage": true,
    "tms.attendance.view": true,
    "tms.attendance.scan": true,
    "tms.attendance.manage": true,
    "tms.tracking.view": true,
    "tms.tracking.share": true,
    "tms.grievances.view": true,
    "tms.grievances.manage": true,
    "tms.reports.view": true,
    "tms.reports.export": true,
    "tms.settings.view": true,
    "tms.settings.manage": true,
    "tms.enrollment.view": true,
    "tms.enrollment.manage": true
  }'::jsonb,
  NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM custom_roles WHERE role_key = 'transport_manager'
);

-- Step 2: Grant TMS view permissions to existing student role
UPDATE custom_roles
SET permissions = permissions || '{
  "tms.dashboard.view": true,
  "tms.routes.view": true,
  "tms.schedules.view": true,
  "tms.bookings.view": true,
  "tms.bookings.create": true,
  "tms.attendance.view": true,
  "tms.tracking.view": true,
  "tms.grievances.submit": true,
  "tms.grievances.view": true,
  "tms.enrollment.view": true
}'::jsonb,
    updated_at = NOW()
WHERE role_key = 'student'
  AND NOT (permissions ? 'tms.dashboard.view');

-- Step 3: Grant TMS permissions to existing driver role
UPDATE custom_roles
SET permissions = permissions || '{
  "tms.dashboard.view": true,
  "tms.routes.view": true,
  "tms.schedules.view": true,
  "tms.attendance.view": true,
  "tms.attendance.scan": true,
  "tms.tracking.view": true,
  "tms.tracking.share": true
}'::jsonb,
    updated_at = NOW()
WHERE role_key = 'driver'
  AND NOT (permissions ? 'tms.dashboard.view');

-- Step 4: Grant TMS view permissions to existing faculty role
UPDATE custom_roles
SET permissions = permissions || '{
  "tms.dashboard.view": true,
  "tms.routes.view": true,
  "tms.schedules.view": true,
  "tms.bookings.view": true,
  "tms.attendance.view": true,
  "tms.tracking.view": true
}'::jsonb,
    updated_at = NOW()
WHERE role_key = 'faculty'
  AND NOT (permissions ? 'tms.dashboard.view');
```

### Migration 2: Add TMS Module Scope to Existing Functions

No changes needed to `user_has_permission()` or `role_has_institution_access()` — they already work with any permission key stored in `custom_roles.permissions` JSONB.

TMS just needs to use `tms` as the module key in `get_user_module_scope('tms')`.

### Migration 3: Add TMS Permission Constants to MyJKKN Frontend (TypeScript)

**File**: `lib/constants/permissions.ts` — Add TMS category:

```typescript
// Transport Management System (TMS)
tms: {
  label: 'Transport Management',
  description: 'Transport Management System permissions',
  permissions: {
    'tms.dashboard.view': {
      label: 'View Dashboard',
      description: 'Access TMS dashboard',
    },
    'tms.routes.view': {
      label: 'View Routes',
      description: 'View bus routes and stops',
    },
    'tms.routes.create': {
      label: 'Create Routes',
      description: 'Create new bus routes',
    },
    'tms.routes.edit': {
      label: 'Edit Routes',
      description: 'Edit existing bus routes',
    },
    'tms.routes.delete': {
      label: 'Delete Routes',
      description: 'Delete bus routes',
    },
    // ... (all 33 permission keys defined above)
  },
},
```

This makes TMS permissions visible in MyJKKN's Role Management UI (Settings → Roles → Edit Role → Transport Management section).

---

## 6. TMS App: Supabase Client Setup

### 6.1 Browser Client

**File**: `lib/supabase/client.ts`

```typescript
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

let clientInstance: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClientSupabaseClient() {
  if (clientInstance) return clientInstance;

  clientInstance = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    }
  );

  return clientInstance;
}
```

**Key points**:
- Uses SAME Supabase URL and anon key as MyJKKN
- PKCE flow for OAuth security
- Singleton pattern (one client per browser tab)
- Session persists in localStorage + cookies

### 6.2 Server Client

**File**: `lib/supabase/server.ts`

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component — can't set cookies
          }
        },
      },
    }
  );
}

export function createServiceRoleClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

export async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}
```

**Key points**:
- Cookie-based session for SSR (same pattern as MyJKKN)
- Service role client for admin operations (bypasses RLS)
- `getAuthUser()` helper for server components

### 6.3 Why Same Credentials Work

Since TMS uses the **same Supabase project**:
- Same `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Same `auth.users` table
- Same JWT secret (automatically — it's the same project)
- `auth.uid()` returns the same user ID in both apps
- RLS policies on TMS tables use the same `user_has_permission()` function

**Cookie domain consideration**: If MyJKKN is at `app.jkkn.ai` and TMS is at `tms.jkkn.ai`, Supabase cookies set with `domain=.jkkn.ai` will be shared. However, the default Supabase SSR behavior sets cookies on the specific subdomain. This means:
- Users need to log in separately on TMS (one-time OAuth)
- OR: Set cookie domain to `.jkkn.ai` in both apps (true SSO)

**Recommendation**: Start with separate login (simpler, more secure). Add cross-subdomain SSO later if needed.

---

## 7. TMS App: Proxy/Middleware (Route Protection)

### 7.1 Proxy Architecture

**File**: `proxy.ts` (Next.js middleware)

The TMS proxy is simpler than MyJKKN's because TMS has fewer route patterns and role types.

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// ─── Public paths that skip auth ───
const PUBLIC_PATHS = new Set([
  '/',
  '/auth/login',
  '/auth/callback',
  '/auth/logout',
  '/unauthorized',
  '/access-denied',
]);

const PUBLIC_PATH_PREFIXES = [
  '/_next/',
  '/api/auth/',
  '/favicon',
  '/manifest',
  '/sw.',
  '/icons/',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip public paths
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (PUBLIC_PATH_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next();

  // 2. Create Supabase client with cookie handling
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 3. Validate session
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Fetch profile + check active status
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, role, is_super_admin, is_active, institution_id')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.redirect(new URL('/unauthorized?reason=no_profile', request.url));
  }

  if (!profile.is_active) {
    return NextResponse.redirect(new URL('/unauthorized?reason=inactive', request.url));
  }

  // 5. TMS Permission Gate
  // Super admins bypass all permission checks
  if (!profile.is_super_admin) {
    // Check if user has ANY tms.* permission via RPC
    const { data: hasTmsAccess } = await supabase
      .rpc('user_has_permission', { permission_key: 'tms.dashboard.view' });

    if (!hasTmsAccess) {
      return NextResponse.redirect(new URL('/unauthorized?reason=no_tms_access', request.url));
    }
  }

  // 6. Set headers for downstream use
  response.headers.set('x-user-id', profile.id);
  response.headers.set('x-user-role', profile.role);
  response.headers.set('x-user-institution', profile.institution_id || '');

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

### 7.2 How This Differs from MyJKKN Proxy

| Feature | MyJKKN proxy.ts | TMS proxy.ts |
|---------|----------------|-------------|
| Profile caching | 5-minute in-memory cache | No caching needed (lighter traffic) |
| Student lifecycle check | Yes (active/graduated/pending) | No (billing gate handles this) |
| Profile completion check | Yes (redirect to /complete-profile) | No (profile completed in MyJKKN) |
| Guest/Driver routing | Yes (confined to /guest, /driver) | Role-based dashboard routing |
| Preview/impersonation | Yes | Not needed for v1 |
| LTI/SAML bypass | Yes | Not needed |
| Permission check | Per-route MENU_PERMISSIONS | Single `tms.dashboard.view` gate |
| Retry on network error | Yes (200ms retry) | Adopt same pattern |

### 7.3 Billing Gate (Students Only)

The proxy checks TMS permission. The **billing gate** (transport bill paid?) is checked at the application level, not middleware level. This is because:

1. The billing check requires a more complex query (join billing tables)
2. Different routes have different billing requirements (dashboard = paid, access-denied page = no check)
3. The billing gate only applies to students, not admin/staff/driver

**Implementation**: A React component `<BillingGate>` wraps the main layout for student role, checking billing status on mount.

---

## 8. TMS App: Auth Callback & Login Flow

### 8.1 Login Page

**File**: `app/auth/login/page.tsx`

```typescript
'use client';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';
  const error = searchParams.get('error');

  async function handleGoogleLogin() {
    const supabase = createClientSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">JKKN Transport</h1>
          <p className="mt-2 text-muted-foreground">
            Sign in with your JKKN account to access TMS
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
            {error === 'no_tms_access' && 'You do not have access to TMS. Contact your administrator.'}
            {error === 'no_profile' && 'No profile found. Please sign in via MyJKKN first.'}
            {error === 'inactive' && 'Your account has been deactivated.'}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 border rounded-lg hover:bg-accent transition-colors"
        >
          {/* Google icon */}
          <svg className="w-5 h-5" viewBox="0 0 24 24">...</svg>
          Sign in with Google
        </button>

        <p className="text-center text-sm text-muted-foreground">
          Only JKKN accounts with transport access can sign in.
        </p>
      </div>
    </div>
  );
}
```

### 8.2 Auth Callback

**File**: `app/auth/callback/route.ts`

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const redirect = searchParams.get('redirect') || '/dashboard';

  if (!code) {
    return NextResponse.redirect(new URL('/auth/login?error=no_code', request.url));
  }

  // 1. Exchange code for session
  const response = NextResponse.redirect(new URL(redirect, request.url));
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL('/auth/login?error=auth_failed', request.url));
  }

  // 2. Verify user has a profile (should already exist from MyJKKN)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_super_admin, is_active')
    .eq('id', data.user.id)
    .single();

  if (!profile) {
    // User exists in auth.users but has no profile
    // This means they never logged into MyJKKN
    return NextResponse.redirect(new URL('/auth/login?error=no_profile', request.url));
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/auth/login?error=inactive', request.url));
  }

  // 3. Check TMS access (permission gate)
  if (!profile.is_super_admin) {
    const { data: hasTmsAccess } = await supabase
      .rpc('user_has_permission', { permission_key: 'tms.dashboard.view' });

    if (!hasTmsAccess) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL('/auth/login?error=no_tms_access', request.url));
    }
  }

  // 4. Redirect to appropriate dashboard based on role
  // Role-based routing handled by client-side router
  return response;
}
```

### 8.3 Important: Profile Must Exist in MyJKKN First

TMS does NOT create profiles. Users must have logged into MyJKKN at least once (which creates their profile via the auth callback migration flow). If a user tries to access TMS without a MyJKKN profile:

```
User opens TMS → Google OAuth → Auth callback →
  Profile query returns null →
  Redirect: "Please sign in to MyJKKN first to set up your account"
```

This is by design — MyJKKN is the source of truth for user onboarding.

---

## 9. TMS App: Auth Provider & Hooks

### 9.1 Auth Provider

**File**: `providers/auth-provider.tsx`

```typescript
'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_super_admin: boolean;
  is_active: boolean;
  institution_id: string | null;
  department_id: string | null;
  avatar_url: string | null;
  phone_number: string | null;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileCacheRef = useRef<{ data: Profile; timestamp: number } | null>(null);
  const supabase = createClientSupabaseClient();

  const fetchProfile = useCallback(async (userId: string) => {
    // Check cache
    const cached = profileCacheRef.current;
    if (cached && Date.now() - cached.timestamp < PROFILE_CACHE_TTL) {
      setProfile(cached.data);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, is_super_admin, is_active, institution_id, department_id, avatar_url, phone_number')
      .eq('id', userId)
      .single();

    if (!error && data) {
      setProfile(data);
      profileCacheRef.current = { data, timestamp: Date.now() };
    }
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    profileCacheRef.current = null;
    window.location.href = '/auth/login';
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    profileCacheRef.current = null; // Invalidate cache
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    // Initial session check
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) fetchProfile(user.id);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          profileCacheRef.current = null;
        }
        // Skip TOKEN_REFRESHED — profile unchanged
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase, fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
```

### 9.2 Layout Integration

**File**: `app/layout.tsx`

```typescript
import { AuthProvider } from '@/providers/auth-provider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

---

## 10. TMS App: Permission System (usePermissions)

### 10.1 Permission Hook

**File**: `hooks/use-permissions.ts`

This is a simplified version of MyJKKN's usePermissions, tailored for TMS.

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface UsePermissionsResult {
  permissions: Record<string, boolean>;
  isLoading: boolean;
  isSuperAdmin: boolean;
  isTransportManager: boolean;
  isDriver: boolean;
  isStudent: boolean;
  isFaculty: boolean;
  userRole: string | null;
  can: (permissionKey: string) => boolean;
  canAny: (...permissionKeys: string[]) => boolean;
  canAll: (...permissionKeys: string[]) => boolean;
}

export function usePermissions(): UsePermissionsResult {
  const { profile } = useAuth();
  const supabase = createClientSupabaseClient();

  const { data: mergedPermissions = {}, isLoading } = useQuery({
    queryKey: ['tms-permissions', profile?.id],
    queryFn: async () => {
      if (!profile) return {};
      if (profile.is_super_admin) return {}; // Super admin bypasses all checks

      // Fetch merged permissions from all user roles
      const { data, error } = await supabase
        .rpc('get_user_merged_permissions', { p_user_id: profile.id });

      if (error) {
        console.error('Failed to fetch permissions:', error);
        return {};
      }

      // Filter to only tms.* permissions
      const tmsPermissions: Record<string, boolean> = {};
      if (data && typeof data === 'object') {
        for (const [key, value] of Object.entries(data as Record<string, boolean>)) {
          if (key.startsWith('tms.')) {
            tmsPermissions[key] = value;
          }
        }
      }
      return tmsPermissions;
    },
    enabled: !!profile,
    staleTime: 2 * 60 * 1000,    // 2 minutes
    gcTime: 10 * 60 * 1000,      // 10 minutes
  });

  const isSuperAdmin = profile?.is_super_admin ?? false;

  const can = (key: string): boolean => {
    if (isSuperAdmin) return true;
    return mergedPermissions[key] === true;
  };

  const canAny = (...keys: string[]): boolean => keys.some(can);
  const canAll = (...keys: string[]): boolean => keys.every(can);

  return {
    permissions: mergedPermissions,
    isLoading,
    isSuperAdmin,
    isTransportManager: profile?.role === 'transport_manager' || can('tms.settings.manage'),
    isDriver: profile?.role === 'driver',
    isStudent: profile?.role === 'student',
    isFaculty: profile?.role === 'faculty',
    userRole: profile?.role ?? null,
    can,
    canAny,
    canAll,
  };
}
```

### 10.2 How Permissions Are Resolved

```
usePermissions() called
       |
       v
  Is profile loaded? → No → Return empty, isLoading=true
       |
       Yes
       v
  Is is_super_admin? → Yes → All can() calls return true
       |
       No
       v
  Call RPC get_user_merged_permissions(user_id)
       |
       v
  Returns UNION of all permissions from user_roles → custom_roles.permissions
       |
       v
  Filter to tms.* keys only
       |
       v
  Cache for 2 minutes (TanStack Query staleTime)
       |
       v
  can('tms.routes.create') → checks mergedPermissions['tms.routes.create'] === true
```

---

## 11. TMS App: Permission Guard Components

### 11.1 TMS Permission Guard

**File**: `components/auth/permission-guard.tsx`

```typescript
'use client';

import { usePermissions } from '@/hooks/use-permissions';

interface PermissionGuardProps {
  permission: string | string[];
  requireAll?: boolean;  // true = AND logic, false = OR logic
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGuard({
  permission,
  requireAll = false,
  children,
  fallback = null,
}: PermissionGuardProps) {
  const { can, canAny, canAll, isLoading, isSuperAdmin } = usePermissions();

  if (isLoading) return null;
  if (isSuperAdmin) return <>{children}</>;

  const permissions = Array.isArray(permission) ? permission : [permission];
  const hasAccess = requireAll
    ? canAll(...permissions)
    : canAny(...permissions);

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// Shorthand components
export function CanManageRoutes({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <PermissionGuard permission="tms.routes.edit">{children}</PermissionGuard>;
}

export function CanManageVehicles({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <PermissionGuard permission="tms.vehicles.edit">{children}</PermissionGuard>;
}

export function CanManageDrivers({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <PermissionGuard permission="tms.drivers.manage">{children}</PermissionGuard>;
}

export function CanViewReports({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <PermissionGuard permission="tms.reports.view">{children}</PermissionGuard>;
}

export function CanScanAttendance({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <PermissionGuard permission="tms.attendance.scan">{children}</PermissionGuard>;
}
```

---

## 12. TMS App: Role-Based Routing & Dashboards

### 12.1 Dashboard Router

After authentication, users are routed to role-appropriate dashboards:

```
/dashboard          → Student dashboard (default landing)
/admin              → Transport manager / admin dashboard
/admin/routes       → Route management
/admin/vehicles     → Vehicle management
/admin/drivers      → Driver management
/admin/schedules    → Schedule management
/admin/enrollments  → Enrollment management
/admin/reports      → Analytics & reports
/admin/settings     → TMS settings
/driver             → Driver dashboard
/driver/attendance  → QR scan for attendance
/driver/tracking    → GPS location sharing
/tracking           → Live bus tracking (all roles)
/bookings           → Booking management
/grievances         → Grievance submission/management
/profile            → User profile
```

### 12.2 Layout-Level Role Routing

**File**: `app/(protected)/layout.tsx`

```typescript
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_super_admin, full_name, avatar_url, institution_id')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/auth/login?error=no_profile');

  return (
    <div className="flex h-screen">
      <Sidebar profile={profile} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
```

### 12.3 Sidebar Navigation Filtering

**File**: `lib/navigation.ts`

```typescript
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;  // Required TMS permission
  roles?: string[];     // Allowed roles (OR logic)
}

export const TMS_NAV_ITEMS: NavItem[] = [
  // Student-facing
  { label: 'Dashboard', href: '/dashboard', icon: Home, permission: 'tms.dashboard.view' },
  { label: 'My Route', href: '/my-route', icon: MapPin, permission: 'tms.routes.view' },
  { label: 'Live Tracking', href: '/tracking', icon: Navigation, permission: 'tms.tracking.view' },
  { label: 'My Bookings', href: '/bookings', icon: Ticket, permission: 'tms.bookings.view' },
  { label: 'Attendance', href: '/attendance', icon: QrCode, permission: 'tms.attendance.view' },
  { label: 'Grievances', href: '/grievances', icon: MessageSquare, permission: 'tms.grievances.submit' },

  // Driver-facing
  { label: 'Driver Dashboard', href: '/driver', icon: Truck, roles: ['driver'] },
  { label: 'Scan Attendance', href: '/driver/attendance', icon: ScanLine, permission: 'tms.attendance.scan' },
  { label: 'Share Location', href: '/driver/tracking', icon: Radio, permission: 'tms.tracking.share' },

  // Admin-facing
  { label: 'Admin Dashboard', href: '/admin', icon: LayoutDashboard, permission: 'tms.settings.view' },
  { label: 'Routes', href: '/admin/routes', icon: Route, permission: 'tms.routes.edit' },
  { label: 'Vehicles', href: '/admin/vehicles', icon: Bus, permission: 'tms.vehicles.view' },
  { label: 'Drivers', href: '/admin/drivers', icon: Users, permission: 'tms.drivers.view' },
  { label: 'Schedules', href: '/admin/schedules', icon: Calendar, permission: 'tms.schedules.view' },
  { label: 'Enrollments', href: '/admin/enrollments', icon: UserPlus, permission: 'tms.enrollment.view' },
  { label: 'Reports', href: '/admin/reports', icon: BarChart3, permission: 'tms.reports.view' },
  { label: 'Settings', href: '/admin/settings', icon: Settings, permission: 'tms.settings.manage' },
];
```

The sidebar component filters items based on `usePermissions().can(item.permission)`.

---

## 13. TMS App: Session Management

### 13.1 Token Lifecycle

Since TMS uses the same Supabase project, session management is identical to MyJKKN:

1. **Login**: Google OAuth → `exchangeCodeForSession()` → stores session in cookies
2. **Auto-refresh**: Supabase SSR automatically refreshes tokens on every server request
3. **Expiry**: Default JWT expiry is 1 hour; refresh token is long-lived
4. **Browser**: `autoRefreshToken: true` handles client-side token renewal
5. **Server**: `createServerClient` with cookie handlers refreshes on each request

### 13.2 Session Expiry Handling

```
Browser detects expired token (via API 401 or auth state change)
       |
       v
Supabase client attempts refresh with refresh_token
       |
       +-- Success → Silent refresh, user unaffected
       |
       +-- Failure (refresh token also expired, >7 days idle)
            |
            v
       Auth state → SIGNED_OUT
            |
            v
       AuthProvider clears state → redirect to /auth/login
```

### 13.3 Cross-Tab Synchronization

Supabase browser client uses `BroadcastChannel` to sync auth state across tabs. If a user logs out in one TMS tab, all tabs redirect to login.

---

## 14. TMS App: Sign-Out Flow

### 14.1 Client-Side Sign-Out

```typescript
// In AuthProvider
const signOut = async () => {
  const supabase = createClientSupabaseClient();
  await supabase.auth.signOut();
  // Clear any TMS-specific localStorage
  localStorage.removeItem('tms-preferences');
  // Redirect to login
  window.location.href = '/auth/login';
};
```

### 14.2 Server-Side Logout API (Optional)

**File**: `app/api/auth/logout/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
```

### 14.3 Important: TMS Sign-Out Does NOT Sign Out of MyJKKN

Since both apps share the same Supabase project, signing out of TMS clears the TMS subdomain's cookies. However:

- If cookie domain is set to `.jkkn.ai` (cross-subdomain SSO), signing out of TMS also signs out of MyJKKN
- If cookies are per-subdomain (default), signing out of TMS only affects TMS

**Recommendation**: Keep cookies per-subdomain for v1. Users manage MyJKKN and TMS sessions independently.

---

## 15. Multi-Tenancy & Institution Scoping

### 15.1 How Institution Scoping Works in TMS

TMS tables (routes, vehicles, schedules, etc.) all have `institution_id` columns. RLS policies use the same MyJKKN functions:

```sql
-- Example: TMS routes RLS policy
CREATE POLICY "tms_routes_select" ON tms_routes
  FOR SELECT USING (
    is_super_admin()
    OR (
      user_has_permission('tms.routes.view')
      AND role_has_institution_access(institution_id)
    )
  );

CREATE POLICY "tms_routes_insert" ON tms_routes
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR (
      user_has_permission('tms.routes.create')
      AND role_has_institution_access(institution_id)
    )
  );
```

### 15.2 Institution Context in TMS

**File**: `hooks/use-institution.ts`

```typescript
'use client';

import { useAuth } from '@/providers/auth-provider';

export function useInstitution() {
  const { profile } = useAuth();

  return {
    institutionId: profile?.institution_id ?? null,
    // TMS v1: single institution per user
    // TMS v2: multi-institution support via useUserInstitutionAccess
  };
}
```

### 15.3 Module Scope for TMS

The `get_user_module_scope('tms')` function returns the user's TMS data scope:

- `'all_institutions'` — Super admin, transport_manager with `institution_scope='all'`
- `'own_institution'` — Default for most roles
- `'own_records'` — Students (only see own bookings, attendance, etc.)

---

## 16. Environment Variables

### TMS App `.env.local`

```bash
# Same Supabase project as MyJKKN
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUz...

# Service role (server-side only, never exposed to browser)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUz...

# App configuration
NEXT_PUBLIC_APP_URL=https://tms.jkkn.ai
NEXT_PUBLIC_MYJKKN_URL=https://app.jkkn.ai

# Optional: Cross-subdomain SSO
# NEXT_PUBLIC_COOKIE_DOMAIN=.jkkn.ai
```

### MyJKKN `.env.local` Changes

None — MyJKKN doesn't need to know about TMS for auth purposes. TMS reads from the shared database directly.

---

## 17. File Structure

```
tms-app/
├── app/
│   ├── auth/
│   │   ├── login/
│   │   │   └── page.tsx            ← Google OAuth login page
│   │   ├── callback/
│   │   │   └── route.ts           ← OAuth code exchange + permission check
│   │   └── logout/
│   │       └── route.ts           ← Server-side logout
│   ├── (protected)/
│   │   ├── layout.tsx              ← Auth-gated layout with sidebar
│   │   ├── dashboard/
│   │   │   └── page.tsx            ← Student dashboard
│   │   ├── admin/
│   │   │   ├── page.tsx            ← Admin dashboard
│   │   │   ├── routes/             ← Route management
│   │   │   ├── vehicles/           ← Vehicle management
│   │   │   ├── drivers/            ← Driver management
│   │   │   ├── schedules/          ← Schedule management
│   │   │   ├── enrollments/        ← Enrollment management
│   │   │   ├── reports/            ← Reports
│   │   │   └── settings/           ← TMS settings
│   │   ├── driver/
│   │   │   ├── page.tsx            ← Driver dashboard
│   │   │   ├── attendance/         ← QR scan
│   │   │   └── tracking/           ← GPS sharing
│   │   ├── tracking/
│   │   │   └── page.tsx            ← Live bus tracking
│   │   ├── bookings/
│   │   │   └── page.tsx            ← Booking management
│   │   ├── attendance/
│   │   │   └── page.tsx            ← View own attendance
│   │   ├── grievances/
│   │   │   └── page.tsx            ← Submit/view grievances
│   │   └── profile/
│   │       └── page.tsx            ← User profile
│   ├── unauthorized/
│   │   └── page.tsx                ← No TMS access page
│   ├── access-denied/
│   │   └── page.tsx                ← Transport bill not paid
│   └── layout.tsx                  ← Root layout with AuthProvider
├── components/
│   ├── auth/
│   │   ├── permission-guard.tsx    ← Permission-based conditional render
│   │   └── billing-gate.tsx        ← Transport bill payment gate (students)
│   └── layout/
│       ├── sidebar.tsx             ← Role-filtered navigation sidebar
│       └── header.tsx              ← Top bar with user menu
├── hooks/
│   ├── use-permissions.ts          ← TMS permission hook
│   └── use-institution.ts          ← Institution context
├── lib/
│   ├── supabase/
│   │   ├── client.ts               ← Browser Supabase client
│   │   └── server.ts               ← Server Supabase client
│   └── navigation.ts               ← Sidebar nav items with permission mapping
├── providers/
│   └── auth-provider.tsx           ← Global auth context + useAuth hook
├── types/
│   ├── auth.ts                     ← Auth-related TypeScript types
│   └── database.ts                 ← Supabase generated types
├── proxy.ts                        ← Next.js middleware (auth + permission gate)
└── .env.local                      ← Supabase credentials
```

---

## 18. Implementation Phases

### Phase 1: Foundation (Day 1-2)

**Goal**: TMS app boots, user can log in via Google, session persists.

| # | Task | Files | Dependency |
|---|------|-------|-----------|
| 1.1 | Set up Supabase clients (browser + server) | `lib/supabase/client.ts`, `lib/supabase/server.ts` | Supabase credentials |
| 1.2 | Create login page with Google OAuth | `app/auth/login/page.tsx` | 1.1 |
| 1.3 | Create auth callback handler | `app/auth/callback/route.ts` | 1.1 |
| 1.4 | Create AuthProvider + useAuth hook | `providers/auth-provider.tsx` | 1.1 |
| 1.5 | Wire up root layout with AuthProvider | `app/layout.tsx` | 1.4 |
| 1.6 | Create proxy.ts with session check only | `proxy.ts` | 1.1 |
| 1.7 | Create minimal /dashboard and /unauthorized pages | `app/(protected)/dashboard/page.tsx`, `app/unauthorized/page.tsx` | 1.4 |
| 1.8 | Verify: Login → see dashboard → refresh → still logged in | Manual testing | All above |

### Phase 2: Permission Gate (Day 2-3)

**Goal**: Only users with TMS permissions can access the app.

| # | Task | Files | Dependency |
|---|------|-------|-----------|
| 2.1 | Create MyJKKN migration: TMS permission keys + transport_manager role | `supabase/migrations/YYYYMMDD_add_tms_permissions.sql` | None |
| 2.2 | Add TMS permission constants to MyJKKN frontend | `lib/constants/permissions.ts` (MyJKKN) | 2.1 |
| 2.3 | Grant TMS permissions to test roles in MyJKKN | Admin UI or migration | 2.1 |
| 2.4 | Add permission check to TMS proxy.ts | `proxy.ts` | 2.1 |
| 2.5 | Add permission check to TMS auth callback | `app/auth/callback/route.ts` | 2.1 |
| 2.6 | Create usePermissions hook | `hooks/use-permissions.ts` | 1.4 |
| 2.7 | Create PermissionGuard component | `components/auth/permission-guard.tsx` | 2.6 |
| 2.8 | Verify: User without tms.* perms → /unauthorized | Manual testing | All above |

### Phase 3: Role-Based Routing (Day 3-4)

**Goal**: Different roles see different dashboards and navigation.

| # | Task | Files | Dependency |
|---|------|-------|-----------|
| 3.1 | Define TMS navigation items with permission mapping | `lib/navigation.ts` | 2.6 |
| 3.2 | Build sidebar component with permission filtering | `components/layout/sidebar.tsx` | 3.1 |
| 3.3 | Build protected layout with sidebar | `app/(protected)/layout.tsx` | 3.2 |
| 3.4 | Create role-specific dashboard pages (student, admin, driver) | `app/(protected)/dashboard/`, `admin/`, `driver/` | 3.3 |
| 3.5 | Add role-based redirect logic to root `/` route | `app/page.tsx` | 2.6 |
| 3.6 | Verify: Admin sees admin nav, student sees student nav | Manual testing | All above |

### Phase 4: Billing Gate (Day 4-5)

**Goal**: Students without paid transport bills are blocked from TMS features.

| # | Task | Files | Dependency |
|---|------|-------|-----------|
| 4.1 | Create BillingGate component (student-only check) | `components/auth/billing-gate.tsx` | 2.6 |
| 4.2 | Create /access-denied page | `app/access-denied/page.tsx` | None |
| 4.3 | Create billing check service/hook | `hooks/use-transport-billing.ts` | 1.1 |
| 4.4 | Wire BillingGate into student layout | `app/(protected)/layout.tsx` | 4.1 |
| 4.5 | Verify: Student with paid bill → dashboard, unpaid → /access-denied | Manual testing | All above |

### Phase 5: Sign-Out & Edge Cases (Day 5)

**Goal**: Clean sign-out, session edge cases handled.

| # | Task | Files | Dependency |
|---|------|-------|-----------|
| 5.1 | Create sign-out flow (client + server) | `AuthProvider`, `app/api/auth/logout/route.ts` | 1.4 |
| 5.2 | Handle expired session (auto-redirect) | `proxy.ts`, `AuthProvider` | 1.6 |
| 5.3 | Handle network errors (retry logic) | `proxy.ts` | 1.6 |
| 5.4 | Add profile display in header/sidebar | `components/layout/header.tsx` | 1.4 |
| 5.5 | Add institution context hook | `hooks/use-institution.ts` | 1.4 |
| 5.6 | End-to-end testing: all roles, all flows | Manual testing | All above |

---

## 19. Security Checklist

- [ ] **PKCE flow enabled** — prevents authorization code interception
- [ ] **Service role key never exposed** — only in server-side code, never in NEXT_PUBLIC_*
- [ ] **RLS enabled on ALL TMS tables** — no table without policies
- [ ] **Permission check in proxy** — every request validated, not just client-side
- [ ] **Profile exists check** — TMS rejects users without MyJKKN profile
- [ ] **is_active check** — deactivated accounts blocked at proxy level
- [ ] **No raw SQL in client** — all queries through Supabase client with RLS
- [ ] **Cookie security** — `secure: true`, `sameSite: 'lax'` in production
- [ ] **CORS configured** — only tms.jkkn.ai allowed, not wildcard
- [ ] **Rate limiting** — on auth endpoints (login, callback)
- [ ] **Error messages** — never expose internal details (SQL errors, stack traces)
- [ ] **Session timeout** — JWT expires in 1 hour, refresh token in 7 days
- [ ] **No permission escalation** — TMS can't modify roles/permissions (read-only from MyJKKN)

---

## 20. Testing Strategy

### Unit Tests

| Component | Test |
|-----------|------|
| `usePermissions` | Returns correct permissions for each role |
| `PermissionGuard` | Shows/hides children based on permission |
| `AuthProvider` | Handles sign-in, sign-out, profile fetch |
| `proxy.ts` | Redirects unauthenticated users, blocks users without TMS perms |

### Integration Tests

| Flow | Test |
|------|------|
| Google OAuth login | End-to-end: click login → redirect → callback → dashboard |
| Permission gate | User without TMS perms → sees /unauthorized |
| Billing gate | Student without paid bill → sees /access-denied |
| Role routing | Admin → /admin, Student → /dashboard, Driver → /driver |
| Sign-out | Clear session → redirect to login |
| Session refresh | After 1 hour → silent refresh → still logged in |
| Cross-institution | Transport manager at Institution A can't see Institution B routes |

### Test Users (Suggested)

| Email | Role | TMS Permissions | Expected |
|-------|------|----------------|----------|
| admin@jkkn.ac.in | super_admin | All (implicit) | Full access |
| tm@jkkn.ac.in | transport_manager | All tms.* | Admin dashboard |
| faculty@jkkn.ac.in | faculty | tms.view + tracking | Limited nav |
| student@jkkn.ac.in | student (bill paid) | tms.student perms | Student dashboard |
| student2@jkkn.ac.in | student (bill unpaid) | tms.student perms | /access-denied |
| noaccess@jkkn.ac.in | staff (no tms perms) | None | /unauthorized |

---

## Appendix A: Complete Type Definitions

### `types/auth.ts`

```typescript
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone_number: string | null;
  role: string;
  is_super_admin: boolean;
  is_active: boolean;
  institution_id: string | null;
  department_id: string | null;
  avatar_url: string | null;
  learner_id: string | null;
  profile_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  is_primary: boolean;
  assigned_at: string;
  role: CustomRole;
}

export interface CustomRole {
  id: string;
  role_key: string;
  role_name: string;
  description: string | null;
  institution_id: string | null;
  is_system_role: boolean;
  institution_scope: 'all' | 'own';
  module_scopes: Record<string, string>;
  permissions: Record<string, boolean>;
}

export type TmsPermissionKey =
  | 'tms.dashboard.view'
  | 'tms.routes.view'
  | 'tms.routes.create'
  | 'tms.routes.edit'
  | 'tms.routes.delete'
  | 'tms.vehicles.view'
  | 'tms.vehicles.create'
  | 'tms.vehicles.edit'
  | 'tms.vehicles.delete'
  | 'tms.drivers.view'
  | 'tms.drivers.assign'
  | 'tms.drivers.manage'
  | 'tms.schedules.view'
  | 'tms.schedules.create'
  | 'tms.schedules.edit'
  | 'tms.schedules.delete'
  | 'tms.bookings.view'
  | 'tms.bookings.view_all'
  | 'tms.bookings.create'
  | 'tms.bookings.manage'
  | 'tms.attendance.view'
  | 'tms.attendance.scan'
  | 'tms.attendance.manage'
  | 'tms.tracking.view'
  | 'tms.tracking.share'
  | 'tms.grievances.submit'
  | 'tms.grievances.view'
  | 'tms.grievances.manage'
  | 'tms.reports.view'
  | 'tms.reports.export'
  | 'tms.settings.view'
  | 'tms.settings.manage'
  | 'tms.enrollment.view'
  | 'tms.enrollment.manage';
```

---

## Appendix B: MyJKKN Auth Flow Reference

### Key Files in MyJKKN to Reference

| File | Purpose | Copy/Adapt for TMS? |
|------|---------|---------------------|
| `proxy.ts` | Route protection middleware | Adapt (simpler version) |
| `lib/supabase/client.ts` | Browser Supabase client | Copy (same pattern) |
| `lib/supabase/server.ts` | Server Supabase client | Copy (same pattern) |
| `app/auth/login/page.tsx` | Google OAuth login | Adapt (TMS branding) |
| `app/auth/callback/route.ts` | Auth code exchange | Adapt (skip profile creation, add TMS perm check) |
| `providers/auth-provider.tsx` | Global auth context | Adapt (simplified, no student lifecycle) |
| `hooks/use-permissions.ts` | Permission hook | Adapt (filter to tms.* keys only) |
| `components/auth/permission-guard.tsx` | Conditional render by permission | Adapt (simpler, no admission bypasses) |
| `lib/constants/permissions.ts` | Permission key catalog | Add TMS section |
| `supabase/setup/02_functions.sql` | RLS helper functions | No changes (same functions work) |

### Key Supabase Functions (Already Exist, No Changes)

| Function | Signature | Used By TMS For |
|----------|-----------|----------------|
| `user_has_permission(key TEXT)` | Returns BOOLEAN | Proxy permission gate, RLS policies |
| `role_has_institution_access(inst_id UUID)` | Returns BOOLEAN | RLS policies on TMS tables |
| `get_user_module_scope(module TEXT)` | Returns TEXT | Determining data scope for queries |
| `get_user_merged_permissions(user_id UUID)` | Returns JSONB | usePermissions hook |
| `is_super_admin()` | Returns BOOLEAN | RLS policy super admin bypass |
| `get_user_accessible_institutions(user_id UUID)` | Returns SETOF UUID | Multi-institution dropdown (v2) |

### Key Difference from MyJKKN Auth

| Aspect | MyJKKN | TMS |
|--------|--------|-----|
| Profile creation | Creates profile on first login | Requires pre-existing profile |
| Student lifecycle | Validates active/graduated/pending | Only checks billing gate |
| Pre-registered migration | Migrates is_pre_registered profiles | Not needed |
| Guest role | Confines to /guest/* | Not supported |
| LTI integration | Handles MathWorks SSO | Not needed |
| SAML | Supports SP-initiated SSO | Not needed |
| Dev login | Magic link exchange | Optional (for dev testing) |
| Profile completion | Forces /complete-profile | Not needed (done in MyJKKN) |
| Preview sessions | Super admin impersonation | Not needed for v1 |

---

## Decision Log

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| D1 | Same Supabase project (not separate) | Eliminates B2A sync, mirror tables, JWT sharing complexity | 2026-05-27 |
| D2 | TMS does NOT create profiles | MyJKKN is user onboarding source of truth | 2026-05-27 |
| D3 | Permission gate at proxy level | Every request validated server-side, not just client | 2026-05-27 |
| D4 | Billing gate at component level | Complex query, student-only, route-specific logic | 2026-05-27 |
| D5 | Per-subdomain cookies (not cross-domain SSO) | Simpler, more secure for v1 | 2026-05-27 |
| D6 | Single `tms.dashboard.view` as proxy gate | One check covers "has any TMS access" | 2026-05-27 |
| D7 | Filter permissions to tms.* in usePermissions | TMS doesn't need to know about admission.* etc. | 2026-05-27 |
