# TMS-ADMIN Authentication Implementation Plan (Codebase-Specific)

> **Date**: May 27, 2026
> **Status**: DRAFT — Awaiting confirmation
> **TMS Repo**: `github.com/JKKN-Institutions/TMS-ADMIN`
> **Framework**: Next.js 16.2.6 + React 19.2.6 + Supabase + Tailwind CSS 4
> **Goal**: Replace demo auth with real Supabase Auth using MyJKKN's shared database
> **Parent Plan**: [TMS-AUTH-IMPLEMENTATION-PLAN.md](./TMS-AUTH-IMPLEMENTATION-PLAN.md) (architecture reference)

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Target State](#2-target-state)
3. [Dependency Changes](#3-dependency-changes)
4. [Phase 1 — Supabase Client Refactor](#phase-1--supabase-client-refactor)
5. [Phase 2 — Auth Provider & Hooks](#phase-2--auth-provider--hooks)
6. [Phase 3 — Login & Callback Flow](#phase-3--login--callback-flow)
7. [Phase 4 — Proxy Middleware](#phase-4--proxy-middleware)
8. [Phase 5 — Layout & Navigation Rewire](#phase-5--layout--navigation-rewire)
9. [Phase 6 — Permission System](#phase-6--permission-system)
10. [Phase 7 — API Route Protection](#phase-7--api-route-protection)
11. [Phase 8 — MyJKKN-Side Migrations](#phase-8--myjkkn-side-migrations)
12. [Phase 9 — Cleanup & Testing](#phase-9--cleanup--testing)
13. [File Change Summary](#file-change-summary)
14. [Verification Checklist](#verification-checklist)

---

## 1. Current State Assessment

### What Exists (Demo Auth)

| File | Current Behavior | Problem |
|------|-----------------|---------|
| `app/login/page.tsx` | Hardcoded demo users (SA001, TM001, etc.) with role picker | No real authentication |
| `app/auth/callback/page.tsx` | Stub — just redirects to `/login` | No OAuth code exchange |
| `app/(admin)/layout.tsx` | Reads `localStorage.adminUser`, redirects if missing | Client-side only, easily bypassed |
| `lib/supabase.ts` | Creates client with SERVICE_ROLE_KEY only | No user-scoped auth, no RLS |
| `lib/auth/auth-context.tsx` | Full AuthContext with permission methods | **Defined but NOT used** anywhere |
| `lib/auth/parent-auth-service.ts` | Token management service for centralized auth | **Defined but NOT used** — was for auth.jkkn.ai |
| `app/api/admin/*/route.ts` (96 routes) | All use service role client, zero auth checks | **Completely open** APIs |
| `types/index.ts` | `AdminUser` with `UserRole` union type (5 roles) | Disconnected from MyJKKN roles |
| `next.config.js` | Redirects `/` → `/login` | Needs to redirect to `/auth/login` |
| No `middleware.ts` or `proxy.ts` | — | No server-side route protection |

### Environment Variables (Current)

```
NEXT_PUBLIC_SUPABASE_URL=https://gsvbrytleqdxpdfbykqh.supabase.co  ← SEPARATE project
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_AUTH_SERVER_URL=https://auth.jkkn.ai                     ← UNUSED centralized auth
NEXT_PUBLIC_APP_ID=tms_admin_portal_mfhsyxnn                        ← UNUSED
API_KEY=app_149a294c473d403d_b33d88b6a6ebb84d                       ← UNUSED
NEXT_PUBLIC_REDIRECT_URI=http://tmsadmin.jkkn.ai/auth/callback       ← Will change
```

---

## 2. Target State

After implementation:

| Aspect | Before | After |
|--------|--------|-------|
| **Supabase project** | Separate (`gsvbrytleqdxpdfbykqh`) | MyJKKN's shared project |
| **Login** | Demo credentials | Google OAuth via Supabase Auth |
| **Session** | localStorage `adminUser` | Supabase SSR cookies (httpOnly) |
| **Route protection** | Client-side useEffect | Server-side `proxy.ts` middleware |
| **API auth** | None (service role for all) | Session-based + service role for admin ops |
| **Permissions** | Hardcoded role arrays in layout | `user_has_permission()` RPC + `usePermissions` hook |
| **User profile** | Demo user object | Real `profiles` table from MyJKKN |
| **Role detection** | `user.role` from localStorage | `profiles.role` + `user_roles` multi-role system |
| **Institution scoping** | None | `role_has_institution_access()` on all queries |
| **Navigation filtering** | `item.roles.includes(user.role)` | `usePermissions().can(item.permission)` |

---

## 3. Dependency Changes

### Install (in TMS project)

```bash
npm install @supabase/ssr @tanstack/react-query
```

### Why These Are Needed

- **`@supabase/ssr`** — Server-side Supabase client with cookie-based sessions. Required for `proxy.ts` middleware and server components. The current `@supabase/supabase-js` only does service-role calls.
- **`@tanstack/react-query`** — Caches permission data with stale-time management. Prevents re-fetching permissions on every page navigation. MyJKKN uses this same pattern for `usePermissions`.

### Already Present (No Change)

- `@supabase/supabase-js` ^2.50.3 — Keep for service-role operations in API routes
- `next` ^16.2.6 — Supports `proxy.ts` middleware natively

---

## Phase 1 — Supabase Client Refactor

### Task 1.1: Create Browser Client

**Create**: `lib/supabase/client.ts`

```typescript
import { createBrowserClient } from '@supabase/ssr';

let clientInstance: ReturnType<typeof createBrowserClient> | null = null;

export function createClientSupabaseClient() {
  if (clientInstance) return clientInstance;

  clientInstance = createBrowserClient(
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

### Task 1.2: Create Server Client

**Create**: `lib/supabase/server.ts`

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
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
            // Server Component — can't set cookies (expected)
          }
        },
      },
    }
  );
}

export function createServiceRoleClient() {
  const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
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

### Task 1.3: Update Old Supabase Client

**Modify**: `lib/supabase.ts`

Keep for backward-compatibility with existing 96 API routes (they all import from here). Rename internal references to clarify it's the **service role** client only.

```typescript
// lib/supabase.ts — SERVICE ROLE client only (API routes)
// For user-scoped auth, use lib/supabase/client.ts (browser) or lib/supabase/server.ts (SSR)
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// ... (keep existing lazy singleton, no changes to behavior)
// This file continues to export service-role clients for API routes
```

Add a comment at the top making it clear this is service-role only. Existing API routes continue to work unchanged.

### Task 1.4: Update Environment Variables

**Modify**: `.env.local`

```bash
# Switch to MyJKKN's Supabase project
NEXT_PUBLIC_SUPABASE_URL=<MyJKKN Supabase URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<MyJKKN anon key>
SUPABASE_SERVICE_ROLE_KEY=<MyJKKN service role key>

# TMS app URL
NEXT_PUBLIC_APP_URL=https://tms.jkkn.ai
NEXT_PUBLIC_MYJKKN_URL=https://app.jkkn.ai

# Remove unused centralized auth vars
# (delete NEXT_PUBLIC_AUTH_SERVER_URL, NEXT_PUBLIC_APP_ID, API_KEY, NEXT_PUBLIC_REDIRECT_URI)
```

---

## Phase 2 — Auth Provider & Hooks

### Task 2.1: Create Auth Provider

**Create**: `providers/auth-provider.tsx`

Full implementation in [TMS-AUTH-IMPLEMENTATION-PLAN.md, Section 9.1](./TMS-AUTH-IMPLEMENTATION-PLAN.md#91-auth-provider).

Key points:
- Exposes `user` (Supabase auth user), `profile` (profiles table data), `loading`, `signOut`, `refreshProfile`
- 5-minute profile cache to avoid re-fetching on every navigation
- Auth state change listener (SIGNED_IN, SIGNED_OUT, USER_UPDATED)
- Skips TOKEN_REFRESHED events (profile doesn't change)

### Task 2.2: Create usePermissions Hook

**Create**: `hooks/use-permissions.ts`

Full implementation in [TMS-AUTH-IMPLEMENTATION-PLAN.md, Section 10.1](./TMS-AUTH-IMPLEMENTATION-PLAN.md#101-permission-hook).

Key points:
- Calls `get_user_merged_permissions()` RPC (same function MyJKKN uses)
- Filters to `tms.*` permission keys only
- 2-minute stale time via React Query
- Returns: `can(key)`, `canAny(...keys)`, `canAll(...keys)`, `isSuperAdmin`, `isTransportManager`, `isStudent`, `isDriver`, `isFaculty`

### Task 2.3: Create useInstitution Hook

**Create**: `hooks/use-institution.ts`

```typescript
'use client';
import { useAuth } from '@/providers/auth-provider';

export function useInstitution() {
  const { profile } = useAuth();
  return {
    institutionId: profile?.institution_id ?? null,
  };
}
```

### Task 2.4: Create TanStack Query Provider

**Create**: `providers/query-provider.tsx`

```typescript
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, retry: 1 },
    },
  }));
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

### Task 2.5: Wire Providers into Root Layout

**Modify**: `app/layout.tsx`

```typescript
import { AuthProvider } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <QueryProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
```

---

## Phase 3 — Login & Callback Flow

### Task 3.1: Replace Login Page

**Replace**: `app/login/page.tsx` → `app/auth/login/page.tsx`

- Remove hardcoded demo users and role picker
- Add Google OAuth button via `supabase.auth.signInWithOAuth({ provider: 'google' })`
- Show branded TMS login page with JKKN logo
- Handle error params (no_tms_access, no_profile, inactive)
- Redirect to `/auth/callback?redirect=/dashboard`

Full implementation in [TMS-AUTH-IMPLEMENTATION-PLAN.md, Section 8.1](./TMS-AUTH-IMPLEMENTATION-PLAN.md#81-login-page).

### Task 3.2: Replace Auth Callback

**Replace**: `app/auth/callback/page.tsx` → `app/auth/callback/route.ts`

Change from a React page to a **route handler** (server-side):
- Exchange OAuth code for session via `exchangeCodeForSession(code)`
- Verify profile exists in `profiles` table (must exist from MyJKKN)
- Check `is_active` status
- Check TMS permission via `user_has_permission('tms.dashboard.view')` RPC
- Redirect to dashboard on success, `/auth/login?error=xxx` on failure

Full implementation in [TMS-AUTH-IMPLEMENTATION-PLAN.md, Section 8.2](./TMS-AUTH-IMPLEMENTATION-PLAN.md#82-auth-callback).

### Task 3.3: Create Logout Route

**Create**: `app/api/auth/logout/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
```

### Task 3.4: Create Static Pages

**Create**: `app/unauthorized/page.tsx`
- Shows "No TMS Access" message with appropriate reason
- Link to contact administrator
- Link back to MyJKKN

**Create**: `app/access-denied/page.tsx`
- Shows "Transport bill not paid" message (students only)
- Link to MyJKKN billing

### Task 3.5: Update Redirect in next.config.js

**Modify**: `next.config.js`

```javascript
async redirects() {
  return [
    {
      source: '/',
      destination: '/auth/login',  // Changed from /login
      permanent: false,
    },
    {
      source: '/login',            // Backward compat
      destination: '/auth/login',
      permanent: true,
    },
  ];
},
```

---

## Phase 4 — Proxy Middleware

### Task 4.1: Create proxy.ts

**Create**: `proxy.ts` (project root)

This is the core security layer. Every request passes through here.

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PATHS = new Set([
  '/auth/login',
  '/auth/callback',
  '/unauthorized',
  '/access-denied',
]);

const PUBLIC_PREFIXES = ['/_next/', '/api/auth/', '/favicon', '/manifest', '/icons/', '/sw.'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public paths
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next();

  // Create Supabase client with cookie handling
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Validate session
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Fetch profile + TMS permission check
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_super_admin, is_active, institution_id')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.is_active) {
    return NextResponse.redirect(new URL('/unauthorized?reason=inactive', request.url));
  }

  // TMS Permission Gate
  if (!profile.is_super_admin) {
    const { data: hasTmsAccess } = await supabase
      .rpc('user_has_permission', { permission_key: 'tms.dashboard.view' });
    if (!hasTmsAccess) {
      return NextResponse.redirect(new URL('/unauthorized?reason=no_tms_access', request.url));
    }
  }

  // Pass user context via headers
  response.headers.set('x-user-id', profile.id);
  response.headers.set('x-user-role', profile.role);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

---

## Phase 5 — Layout & Navigation Rewire

### Task 5.1: Rewrite Admin Layout

**Modify**: `app/(admin)/layout.tsx`

Major changes:
1. **Remove** localStorage auth check (lines 39-53)
2. **Replace** with `useAuth()` hook from new AuthProvider
3. **Replace** role-based nav filtering (`item.roles.includes(user.role)`) with permission-based (`usePermissions().can(item.permission)`)
4. **Replace** `handleLogout` to use `signOut()` from AuthProvider
5. **Replace** `AdminUser` type with `Profile` from auth provider
6. **Update** user display (name, avatar, role) from real profile data

### Current Navigation with Role Arrays → New with Permission Keys

```typescript
// BEFORE (current):
const allNavigation = [
  { name: 'Dashboard', href: '/dashboard', roles: ['super_admin', 'transport_admin', 'staff'] },
  { name: 'Drivers', href: '/drivers', roles: ['super_admin', 'transport_admin'] },
  // ...
];
const navigation = allNavigation.filter(item => item.roles.includes(user.role));

// AFTER (new):
const allNavigation = [
  { name: 'Dashboard', href: '/dashboard', permission: 'tms.dashboard.view' },
  { name: 'Analytics', href: '/analytics', permission: 'tms.reports.view' },
  { name: 'Passengers', href: '/students', permission: 'tms.enrollment.view' },
  { name: 'Drivers', href: '/drivers', permission: 'tms.drivers.view' },
  { name: 'Vehicles', href: '/vehicles', permission: 'tms.vehicles.view' },
  { name: 'GPS Devices', href: '/gps-devices', permission: 'tms.tracking.view' },
  { name: 'Track All', href: '/track-all', permission: 'tms.tracking.view' },
  { name: 'Routes', href: '/routes', permission: 'tms.routes.view' },
  { name: 'Schedules', href: '/schedules', permission: 'tms.schedules.view' },
  { name: 'Route Optimization', href: '/route-optimization', permission: 'tms.routes.edit' },
  { name: 'Staff Assignments', href: '/staff-route-assignments', permission: 'tms.drivers.assign' },
  { name: 'Enrollments', href: '/enrollment-requests', permission: 'tms.enrollment.manage' },
  { name: 'Grievances', href: '/grievances', permission: 'tms.grievances.manage' },
  { name: 'My Grievances', href: '/my-grievances', permission: 'tms.grievances.submit' },
  { name: 'Payments', href: '/payments', permission: 'tms.bookings.view_all' },
  { name: 'Notifications', href: '/notifications', permission: 'tms.settings.view' },
  { name: 'Bug Management', href: '/bug-management', permission: 'tms.settings.manage' },
  { name: 'Authorize', href: '/authorize', permission: 'tms.settings.manage' },
  { name: 'Settings', href: '/settings', permission: 'tms.settings.manage' },
];
const { can, isSuperAdmin, isLoading } = usePermissions();
const navigation = allNavigation.filter(item =>
  isSuperAdmin || can(item.permission)
);
```

### Task 5.2: Update User Display in Sidebar

Replace hardcoded user display with real profile data:

```typescript
// BEFORE:
<span>{user.name}</span>
<span>{user.role.replace('_', ' ')}</span>

// AFTER:
const { profile } = useAuth();
<span>{profile?.full_name ?? profile?.email}</span>
<span className="capitalize">{profile?.role?.replace('_', ' ')}</span>
{profile?.avatar_url && <img src={profile.avatar_url} ... />}
```

---

## Phase 6 — Permission System

### Task 6.1: Create Permission Guard Component

**Create**: `components/auth/permission-guard.tsx`

Full implementation in [TMS-AUTH-IMPLEMENTATION-PLAN.md, Section 11.1](./TMS-AUTH-IMPLEMENTATION-PLAN.md#111-tms-permission-guard).

Usage in pages:

```typescript
// In any TMS page:
import { PermissionGuard } from '@/components/auth/permission-guard';

<PermissionGuard permission="tms.routes.create">
  <Button onClick={openAddRouteModal}>Add Route</Button>
</PermissionGuard>
```

### Task 6.2: Create Permission Constants

**Create**: `lib/constants/tms-permissions.ts`

```typescript
export const TMS_PERMISSIONS = {
  DASHBOARD_VIEW: 'tms.dashboard.view',
  ROUTES_VIEW: 'tms.routes.view',
  ROUTES_CREATE: 'tms.routes.create',
  ROUTES_EDIT: 'tms.routes.edit',
  ROUTES_DELETE: 'tms.routes.delete',
  VEHICLES_VIEW: 'tms.vehicles.view',
  VEHICLES_CREATE: 'tms.vehicles.create',
  VEHICLES_EDIT: 'tms.vehicles.edit',
  VEHICLES_DELETE: 'tms.vehicles.delete',
  DRIVERS_VIEW: 'tms.drivers.view',
  DRIVERS_ASSIGN: 'tms.drivers.assign',
  DRIVERS_MANAGE: 'tms.drivers.manage',
  SCHEDULES_VIEW: 'tms.schedules.view',
  SCHEDULES_CREATE: 'tms.schedules.create',
  SCHEDULES_EDIT: 'tms.schedules.edit',
  SCHEDULES_DELETE: 'tms.schedules.delete',
  BOOKINGS_VIEW: 'tms.bookings.view',
  BOOKINGS_VIEW_ALL: 'tms.bookings.view_all',
  BOOKINGS_CREATE: 'tms.bookings.create',
  BOOKINGS_MANAGE: 'tms.bookings.manage',
  ATTENDANCE_VIEW: 'tms.attendance.view',
  ATTENDANCE_SCAN: 'tms.attendance.scan',
  ATTENDANCE_MANAGE: 'tms.attendance.manage',
  TRACKING_VIEW: 'tms.tracking.view',
  TRACKING_SHARE: 'tms.tracking.share',
  GRIEVANCES_SUBMIT: 'tms.grievances.submit',
  GRIEVANCES_VIEW: 'tms.grievances.view',
  GRIEVANCES_MANAGE: 'tms.grievances.manage',
  REPORTS_VIEW: 'tms.reports.view',
  REPORTS_EXPORT: 'tms.reports.export',
  SETTINGS_VIEW: 'tms.settings.view',
  SETTINGS_MANAGE: 'tms.settings.manage',
  ENROLLMENT_VIEW: 'tms.enrollment.view',
  ENROLLMENT_MANAGE: 'tms.enrollment.manage',
} as const;
```

---

## Phase 7 — API Route Protection

### Task 7.1: Create API Auth Helper

**Create**: `lib/api/with-auth.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

interface AuthContext {
  userId: string;
  userRole: string;
  isSuperAdmin: boolean;
  institutionId: string | null;
  supabase: ReturnType<typeof createServerClient>;
}

type AuthenticatedHandler = (
  request: NextRequest,
  auth: AuthContext
) => Promise<NextResponse>;

export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest) => {
    // Create user-scoped Supabase client
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll() { /* API routes don't set cookies */ },
        },
      }
    );

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'No profile found' }, { status: 403 });
    }

    return handler(request, {
      userId: profile.id,
      userRole: profile.role,
      isSuperAdmin: profile.is_super_admin,
      institutionId: profile.institution_id,
      supabase,
    });
  };
}
```

### Task 7.2: Migrate API Routes (Incremental)

The 96 existing API routes all create their own service-role client inline. Migration strategy:

**Phase 7.2a — Critical routes first** (dashboard, drivers, vehicles, routes):

```typescript
// BEFORE (current pattern in every API route):
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  // ... query without auth
}

// AFTER (with auth):
import { withAuth } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const GET = withAuth(async (request, auth) => {
  // auth.userId, auth.userRole, auth.isSuperAdmin available
  // Use service role client for queries that need to bypass RLS
  const supabase = createServiceRoleClient();
  // ... existing query logic unchanged
  // BUT: add institution_id filter where appropriate
});
```

**Phase 7.2b — Remaining routes** (grievances, notifications, GPS, etc.):

Same pattern. The key change is wrapping each handler with `withAuth()`. The actual query logic stays the same since API routes already use service-role client. The auth wrapper just validates the user has a session.

**Note**: Full RLS migration (switching from service-role to user-scoped client) is a separate, larger effort. For v1, wrapping with `withAuth()` ensures only authenticated TMS users can call APIs.

---

## Phase 8 — MyJKKN-Side Migrations

These changes are made in the **MyJKKN project** (`D:\Projects\MyJKKN`), not the TMS project.

### Task 8.1: Add TMS Permission Keys to Permission Catalog

**Modify** (MyJKKN): `lib/constants/permissions.ts`

Add TMS section to `PERMISSION_CATEGORIES`:

```typescript
tms: {
  label: 'Transport Management',
  description: 'Transport Management System (TMS) permissions',
  permissions: {
    'tms.dashboard.view': { label: 'View Dashboard', description: 'Access TMS dashboard' },
    'tms.routes.view': { label: 'View Routes', description: 'View bus routes and stops' },
    'tms.routes.create': { label: 'Create Routes', description: 'Create new bus routes' },
    // ... (all 33 keys from TMS-AUTH-IMPLEMENTATION-PLAN.md Section 4)
  },
},
```

### Task 8.2: Create Supabase Migration

**Create** (MyJKKN): `supabase/migrations/YYYYMMDD_add_tms_permission_keys.sql`

Full SQL in [TMS-AUTH-IMPLEMENTATION-PLAN.md, Section 5, Migration 1](./TMS-AUTH-IMPLEMENTATION-PLAN.md#migration-1-add-tms-permission-keys-to-catalog).

Creates `transport_manager` role and grants TMS permissions to `student`, `driver`, `faculty` roles.

### Task 8.3: Apply Migration via MCP

```sql
-- Run via mcp__supabase__apply_migration
-- Creates transport_manager role + seeds TMS permissions on existing roles
```

---

## Phase 9 — Cleanup & Testing

### Task 9.1: Remove Dead Auth Files

**Delete**:
- `lib/auth/auth-context.tsx` — Replaced by `providers/auth-provider.tsx`
- `lib/auth/parent-auth-service.ts` — Was for centralized auth.jkkn.ai (unused, now replaced)
- `app/login/page.tsx` — Replaced by `app/auth/login/page.tsx`

### Task 9.2: Update Type Definitions

**Modify**: `types/index.ts`

```typescript
// BEFORE:
export type UserRole =
  | 'super_admin'
  | 'transport_manager'
  | 'finance_admin'
  | 'operations_admin'
  | 'data_entry';

// AFTER (align with MyJKKN roles):
export type UserRole =
  | 'super_admin'
  | 'administrator'
  | 'transport_manager'
  | 'faculty'
  | 'student'
  | 'driver'
  | 'staff'
  | 'hod'
  | 'principal'
  | string;  // Allow dynamic custom roles

// Update AdminUser to match MyJKKN profile shape
export interface TmsUser {
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
```

### Task 9.3: Remove Unused Environment Variables

Remove from `.env.local`:
- `NEXT_PUBLIC_AUTH_SERVER_URL`
- `NEXT_PUBLIC_APP_ID`
- `API_KEY`
- `NEXT_PUBLIC_REDIRECT_URI`
- `NEXTAUTH_SECRET`

### Task 9.4: Update Dashboard Page

**Modify**: `app/(admin)/dashboard/page.tsx`

Replace localStorage user check with `useAuth()`:

```typescript
// BEFORE:
const storedUser = localStorage.getItem('adminUser');
// ...

// AFTER:
const { profile, loading } = useAuth();
if (loading) return <DashboardSkeleton />;
```

---

## File Change Summary

### New Files (TMS Project)

| File | Purpose |
|------|---------|
| `lib/supabase/client.ts` | Browser Supabase client (PKCE, auto-refresh) |
| `lib/supabase/server.ts` | Server Supabase client (cookie-based SSR) |
| `providers/auth-provider.tsx` | AuthProvider + useAuth hook |
| `providers/query-provider.tsx` | TanStack Query provider |
| `hooks/use-permissions.ts` | TMS permission hook |
| `hooks/use-institution.ts` | Institution context |
| `components/auth/permission-guard.tsx` | Permission-gated rendering |
| `lib/constants/tms-permissions.ts` | Permission key constants |
| `lib/api/with-auth.ts` | API route auth middleware |
| `proxy.ts` | Next.js middleware (auth + permission gate) |
| `app/auth/login/page.tsx` | Google OAuth login page |
| `app/auth/callback/route.ts` | OAuth code exchange handler |
| `app/api/auth/logout/route.ts` | Server-side logout |
| `app/unauthorized/page.tsx` | No TMS access page |
| `app/access-denied/page.tsx` | Transport bill not paid page |

### Modified Files (TMS Project)

| File | Change |
|------|--------|
| `app/layout.tsx` | Add AuthProvider + QueryProvider wrappers |
| `app/(admin)/layout.tsx` | Replace localStorage auth with useAuth + usePermissions |
| `lib/supabase.ts` | Add clarifying comments (keep for API routes) |
| `next.config.js` | Redirect `/` → `/auth/login`, add `/login` redirect |
| `types/index.ts` | Align UserRole with MyJKKN, add TmsUser type |
| `.env.local` | Switch to MyJKKN Supabase credentials |
| `package.json` | Add `@supabase/ssr`, `@tanstack/react-query` |
| `app/(admin)/dashboard/page.tsx` | Replace localStorage user with useAuth |

### Deleted Files (TMS Project)

| File | Reason |
|------|--------|
| `lib/auth/auth-context.tsx` | Replaced by providers/auth-provider.tsx |
| `lib/auth/parent-auth-service.ts` | Was for centralized auth (unused) |
| `app/login/page.tsx` | Replaced by app/auth/login/page.tsx |
| `app/auth/callback/page.tsx` | Replaced by app/auth/callback/route.ts |

### New Files (MyJKKN Project)

| File | Purpose |
|------|---------|
| `supabase/migrations/YYYYMMDD_add_tms_permissions.sql` | TMS permission keys + transport_manager role |
| `lib/constants/permissions.ts` (modification) | Add TMS section to permission catalog |

---

## Verification Checklist

### After Phase 1 (Supabase Client)
- [ ] `lib/supabase/client.ts` creates browser client with PKCE
- [ ] `lib/supabase/server.ts` creates server client with cookies
- [ ] `.env.local` points to MyJKKN Supabase project
- [ ] Existing API routes still work (lib/supabase.ts unchanged)
- [ ] `npm run build` succeeds

### After Phase 3 (Login Flow)
- [ ] `/auth/login` shows Google OAuth button
- [ ] Clicking "Sign in with Google" initiates OAuth flow
- [ ] After Google consent, `/auth/callback` exchanges code for session
- [ ] Session cookies set correctly in browser
- [ ] User with profile → redirected to `/dashboard`
- [ ] User without profile → redirected to `/auth/login?error=no_profile`

### After Phase 4 (Proxy)
- [ ] Unauthenticated request to `/dashboard` → redirected to `/auth/login`
- [ ] User without `tms.dashboard.view` permission → `/unauthorized`
- [ ] Super admin → can access all routes
- [ ] Session refresh works (no login loop)

### After Phase 5 (Layout)
- [ ] Sidebar shows only permitted nav items
- [ ] User name + avatar from real profile
- [ ] Sign-out clears session and redirects to login
- [ ] No localStorage references remain in admin layout

### After Phase 8 (MyJKKN Migrations)
- [ ] `transport_manager` role exists in `custom_roles`
- [ ] Student role has `tms.dashboard.view` + student TMS permissions
- [ ] Driver role has `tms.attendance.scan` + `tms.tracking.share`
- [ ] Faculty role has `tms.dashboard.view` + view permissions
- [ ] TMS permissions visible in MyJKKN Role Management UI

### End-to-End Tests
- [ ] Super admin: Login → see all nav → access all pages → sign out
- [ ] Transport manager: Login → see management nav → CRUD routes
- [ ] Faculty: Login → limited nav (view routes, tracking) → cannot create
- [ ] Student: Login → student nav (bookings, attendance, grievances)
- [ ] User without TMS perms: Login → `/unauthorized`
- [ ] Expired session: Auto-redirect to login, re-login works
- [ ] API call without session: Returns 401

---

## Implementation Order (Recommended)

```
Day 1: Phase 1 (Supabase clients) + Phase 8 (MyJKKN migrations)
        → Verify: build passes, migrations applied

Day 2: Phase 2 (Auth provider, hooks, query provider) + Phase 3 (Login, callback)
        → Verify: can log in with Google, session persists

Day 3: Phase 4 (Proxy middleware) + Phase 5 (Layout rewire)
        → Verify: routes protected, nav filtered by permission

Day 4: Phase 6 (Permission guards) + Phase 7 (API auth wrapper)
        → Verify: UI buttons gated, API returns 401 for unauthenticated

Day 5: Phase 9 (Cleanup, testing, edge cases)
        → Verify: all dead files removed, all test scenarios pass
```
