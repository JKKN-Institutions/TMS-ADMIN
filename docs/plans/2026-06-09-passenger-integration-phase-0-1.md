# Passenger Integration — Phase 0 & 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use @executing-plans to implement this plan task-by-task.
> Companion analysis: `docs/PASSENGER_INTEGRATION_ANALYSIS.md`.

**Goal:** Stand up the foundation for a Learner ("student") dashboard that coexists with the Admin dashboard in this one Next.js app — role-aware routing, RBAC seeding, identity linkage, a self-scoped `/api/student/me`, and a working `/student/*` shell a real student can log into.

**Architecture:** Re-platform, not merge. Learners already have Supabase `profiles` rows (role `student`, 4,969 of them) and authenticate through the existing `@supabase/ssr` + `proxy.ts` + `user_has_permission()` pipeline. We add a new URL-prefixed area `/student/*` with its own layout shell, generalise `proxy.ts` to route each role to its area, seed `tms.passenger.*` permissions onto the `student`/`driver` `custom_roles` rows, and link identity via new `profile_id` FK columns. Learner-facing APIs derive identity from the session (never a client `studentId`), reusing the existing `lib/passengers/*` mapping.

**Tech Stack:** Next.js 16 (`proxy.ts`), `@supabase/ssr`, TanStack Query, Tailwind v4 + shadcn/Radix `components/ui/*`, Supabase Postgres (RLS + `custom_roles`/`user_roles` RBAC, RPC `user_has_permission`).

---

## Conventions & verification model (read before starting)

This repo has **no Jest/unit runner** and **ESLint is broken** (see project memory `env_eslint_broken`). The skill's "write a failing test" steps are therefore adapted to this project's real verification model (memory `project_auth_verification`):

- **Type check (agent):** `npx tsc --noEmit` — confirm no NEW errors in the files you touched (the project may have pre-existing errors elsewhere; compare before/after on your files).
- **Route probes (agent, unauthenticated):** `npm run dev` then `curl -i` the route. The agent's browser is **unauthenticated**, so protected pages return `307 → /auth/login` and protected APIs return `401`. That proves the gate *exists*; it does not prove the happy path.
- **Authenticated checks (USER, in their browser):** any "logged-in as a student" verification must be done by the user with a real `student` account. Each such step is marked **[USER VERIFY]**.
- **DB changes:** apply via the Supabase MCP (`apply_migration` for DDL, `execute_sql` for checks) per memory `project_supabase_db_access`, **and** commit the `.sql` file under `supabase/migrations/`. Use @supabase-expert for migration authoring.
- **Commit cadence:** one commit per task. Branch first (don't commit foundation work straight to `main`).

**Pre-flight (do once, before Task 0.1):**
```bash
git checkout -b feat/passenger-foundation
```

---

## PHASE 0 — Prerequisites (DB + catalog)

### Task 0.1: Add identity-link columns (`profile_id`) + backfill

Links a Supabase auth identity (`profiles.id`) to its transport record. `tms_driver` is TMS-owned (safe). `learners_profiles` is a **MyJKKN-owned master** — adding a column needs owner awareness; if that's not permitted, use the bridge-table alternative in the note below (the rest of the plan only calls `getLearnerRowForUser`, so the storage choice is isolated).

**Files:**
- Create: `supabase/migrations/20260609090000_add_profile_id_links.sql`

**Step 1: Write the migration**
```sql
-- Link transport records to Supabase auth identities (profiles.id == auth.users.id).
-- Idempotent: safe to re-run.

-- TMS-owned table — unambiguous.
ALTER TABLE public.tms_driver
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_tms_driver_profile_id ON public.tms_driver(profile_id);

-- MyJKKN-owned master (see note). Column-add coordinated with owner.
ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_profile_id ON public.learners_profiles(profile_id);

-- Backfill learners by email (college_email preferred, then student_email),
-- only for student-role profiles to avoid cross-role mismatches.
UPDATE public.learners_profiles lp
SET profile_id = p.id
FROM public.profiles p
WHERE lp.profile_id IS NULL
  AND p.role = 'student'
  AND lower(p.email) IN (lower(lp.college_email), lower(lp.student_email));

-- Driver backfill is DEFERRED to Phase 2 (driver shell): tms_driver has NO email
-- column — it links via staff_id → staff → profiles. The column is added now
-- (additive, safe); the backfill join through `staff` is done when we build /driver.
```

**Step 2: Apply it**

Use the Supabase MCP `apply_migration` with name `add_profile_id_links` and the SQL above.

**Step 3: Verify the backfill landed**

Run via `execute_sql`:
```sql
SELECT
  (SELECT count(*) FROM learners_profiles WHERE profile_id IS NOT NULL) AS learners_linked,
  (SELECT count(*) FROM learners_profiles WHERE bus_required IS TRUE AND profile_id IS NULL) AS bus_learners_unlinked,
  (SELECT count(*) FROM tms_driver WHERE profile_id IS NOT NULL) AS drivers_linked;
```
Expected: `learners_linked` > 0; investigate `bus_learners_unlinked` (email-format gaps) but it does not block Phase 1 — the runtime helper has an email fallback.

**Step 4: Commit**
```bash
git add supabase/migrations/20260609090000_add_profile_id_links.sql
git commit -m "feat(db): add profile_id FK linking learners_profiles/tms_driver to profiles"
```

> **Note — if MyJKKN forbids the `learners_profiles` column:** create a TMS-owned bridge instead — `CREATE TABLE tms_learner_identity (learner_id uuid PRIMARY KEY REFERENCES learners_profiles(id), profile_id uuid UNIQUE REFERENCES profiles(id))` — and adjust only `getLearnerRowForUser` (Task 1.4) to join through it. Nothing else changes.

---

### Task 0.2: Add passenger/driver permission keys to the catalog

**Files:**
- Modify: `lib/constants/tms-permissions.ts:51-52` (append before the closing `} as const;`)

**Step 1: Add the keys**

Insert after the `ENROLLMENT_*` block (line 52):
```ts
  // Learner / Passenger self-service (granted to the `student` role).
  // Pass-based + admin-recorded payments (confirmed v1): learner VIEWS payment
  // status (admin records it), so payment is `.view`, not `.pay`. No booking key.
  PASSENGER_SELF_VIEW: 'tms.passenger.self.view',
  PASSENGER_PAYMENT_VIEW: 'tms.passenger.payment.view',
  PASSENGER_ENROLL: 'tms.passenger.enrollment.request',

  // Driver self-service (granted to the `driver` role).
  DRIVER_SELF_VIEW: 'tms.driver.self.view',
```
(Reuse existing keys for booking/schedule/grievance/tracking — do not duplicate them.)

**Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. `TMS_PERMISSIONS.PASSENGER_SELF_VIEW` now resolves.

**Step 3: Commit**
```bash
git add lib/constants/tms-permissions.ts
git commit -m "feat(rbac): add tms.passenger.* and tms.driver.self.view permission keys"
```

---

### Task 0.3: Seed permissions onto the `student` and `driver` roles

`user_has_permission()` falls back to `profiles.role = custom_roles.role_key`, so updating **one row per role** grants every student/driver. `custom_roles.permissions` is a flat `{key: bool}` map; merge with `||`.

**Files:**
- Create: `supabase/migrations/20260609091000_seed_passenger_permissions.sql`

**Step 1: Write the migration**
```sql
-- Grant learner self-service perms to ALL students via the shared `student` role.
UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
  'tms.passenger.self.view', true,
  'tms.passenger.payment.view', true,
  'tms.passenger.enrollment.request', true,
  'tms.grievances.submit', true,
  'tms.tracking.view', true
)
WHERE role_key = 'student';
-- Pass-based v1: NO 'tms.bookings.create' / 'tms.schedules.view' (no per-trip booking).

-- Grant driver self-service perms to ALL drivers via the shared `driver` role.
UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
  'tms.driver.self.view', true,
  'tms.tracking.share', true,
  'tms.tracking.view', true
)
WHERE role_key = 'driver';
```

**Step 2: Apply it** via `apply_migration` (name `seed_passenger_permissions`).

**Step 3: Verify the grant resolves**
```sql
SELECT role_key,
       (permissions->>'tms.passenger.self.view')::bool AS self_view,
       (permissions->>'tms.dashboard.view')::bool      AS admin_view  -- must stay false/absent for student
FROM custom_roles WHERE role_key IN ('student','driver');
```
Expected: `student.self_view = true`, `student.admin_view` is `false`/null (students must NOT gain admin access).

**Step 4: Commit**
```bash
git add supabase/migrations/20260609091000_seed_passenger_permissions.sql
git commit -m "feat(rbac): seed tms.passenger.*/tms.driver.* onto student and driver roles"
```

---

## PHASE 1 — Foundation build

### Task 1.1: Area resolution + home-routing helper (pure module)

**Files:**
- Create: `lib/auth/areas.ts`

**Step 1: Write the module**
```ts
// Maps requests to a dashboard "area" and decides where each role lands.
// Pure functions — no I/O — so they're trivially reusable in proxy.ts, the
// OAuth callback, and client guards.

export type Area = 'admin' | 'student' | 'driver' | 'boarding';

/** Resolve a pathname (page or /api/*) to its area. Admin owns the root URLs. */
export function resolveArea(pathname: string): Area {
  if (pathname === '/student' || pathname.startsWith('/student/') || pathname.startsWith('/api/student/')) return 'student';
  if (pathname === '/driver' || pathname.startsWith('/driver/') || pathname.startsWith('/api/driver/')) return 'driver';
  if (pathname === '/boarding' || pathname.startsWith('/boarding/') || pathname.startsWith('/api/boarding/')) return 'boarding';
  return 'admin';
}

/** The single permission that grants entry to each area. */
export const AREA_PERMISSION: Record<Area, string> = {
  admin: 'tms.dashboard.view',
  student: 'tms.passenger.self.view',
  driver: 'tms.driver.self.view',
  boarding: 'tms.attendance.scan',
};

/** Where a freshly-authenticated user should land, by role. */
export function resolveHomeForRole(role: string, isSuperAdmin: boolean): string {
  if (isSuperAdmin) return '/dashboard';
  if (role === 'student') return '/student/dashboard';
  if (role === 'driver') return '/driver/dashboard';
  return '/dashboard';
}
```

**Step 2: Verify type-check** — `npx tsc --noEmit` → no new errors.

**Step 3: Commit**
```bash
git add lib/auth/areas.ts
git commit -m "feat(auth): add area-resolution + role-home helpers"
```

---

### Task 1.2: Generalise `proxy.ts` for role-aware area gating

Replace the single `tms.dashboard.view` gate (currently `proxy.ts:100-117`) with an area-based gate that bounces a user to *their* home instead of a dead end.

**Files:**
- Modify: `proxy.ts` (add import; replace step 5 block, lines 100-117)

**Step 1: Add the import** (top of file, after line 2)
```ts
import { resolveArea, AREA_PERMISSION, resolveHomeForRole } from '@/lib/auth/areas';
```

**Step 2: Replace the step-5 block** (the `// 5. TMS permission gate ...` block) with:
```ts
  // 5. Area-based access gate (super admins bypass all areas).
  if (!profile.is_super_admin) {
    const area = resolveArea(pathname);
    const { data: hasAccess } = await supabase.rpc('user_has_permission', {
      permission_name: AREA_PERMISSION[area],
    });

    if (!hasAccess) {
      if (isApi) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      // Send them to their own area's home rather than a 403 dead-end.
      const home = resolveHomeForRole(profile.role, profile.is_super_admin);
      if (pathname === home) {
        // They lack access even to their own home → genuine no-access.
        return NextResponse.redirect(
          new URL('/unauthorized?reason=no_tms_access', request.url)
        );
      }
      return NextResponse.redirect(new URL(home, request.url));
    }
  }
```

**Step 3: Verify type-check** — `npx tsc --noEmit` → no new errors.

**Step 4: Route probe (agent)** — `npm run dev`, then:
```bash
curl -i http://localhost:3000/student/dashboard
```
Expected: `307` → `/auth/login?redirect=/student/dashboard` (unauthenticated). Confirms the proxy still gates and the new area path is reachable.

**Step 5: [USER VERIFY]** Log in as a **student** account → should land on/redirect to `/student/dashboard` (a stub until Task 1.6) and NOT be able to open `/dashboard` (admin) — visiting `/dashboard` should bounce back to `/student/dashboard`. Log in as an **admin** → `/dashboard` works unchanged.

> ⚠️ **Sequencing:** This task makes students get bounced *to* `/student/dashboard`. Ship it together with at least the Task 1.6 stub so the target exists. If verifying 1.2 alone, expect the bounce target to 404 until 1.6.

**Step 6: Commit**
```bash
git add proxy.ts
git commit -m "feat(auth): generalise proxy gate to route each role to its area"
```

---

### Task 1.3: Role-based post-login redirect in the OAuth callback

Today the callback always redirects to `/dashboard` and hard-requires `tms.dashboard.view` (`app/auth/callback/route.ts:70-81`), which would reject students. Relax to "has any area access" and land them by role.

**Files:**
- Modify: `app/auth/callback/route.ts`

**Step 1: Import the helper** (after line 2)
```ts
import { resolveHomeForRole } from '@/lib/auth/areas';
```

**Step 2: Replace the `if (!profile.is_super_admin) { ... }` block** (lines 70-81) with:
```ts
  // Gate: the user must have access to at least one TMS area.
  if (!profile.is_super_admin) {
    const { data: areaPerms } = await supabase.rpc('get_user_merged_permissions', {
      p_user_id: data.user.id,
    });
    const merged = (areaPerms ?? {}) as Record<string, boolean>;
    // user_has_permission() has a profiles.role fallback the merged RPC lacks,
    // so also check the single-arg overload for the admin key as a safety net.
    const { data: adminViaFallback } = await supabase.rpc('user_has_permission', {
      permission_name: 'tms.dashboard.view',
    });
    const hasAnyTms =
      adminViaFallback === true ||
      merged['tms.dashboard.view'] === true ||
      merged['tms.passenger.self.view'] === true ||
      merged['tms.driver.self.view'] === true ||
      merged['tms.attendance.scan'] === true;

    if (!hasAnyTms) {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL('/auth/login?error=no_tms_access', request.url)
      );
    }
  }
```

**Step 3: Replace the fixed redirect** — change line 18:
```ts
  const redirect = searchParams.get('redirect') || '/dashboard';
```
to defer the default until the profile is known. After the gate block (Step 2), before `return response;` (line 83), compute and use the role home when no explicit redirect was requested:
```ts
  // If no explicit redirect was requested, land the user in their area home.
  if (!searchParams.get('redirect')) {
    const home = resolveHomeForRole(profile.role, profile.is_super_admin);
    return NextResponse.redirect(new URL(home, request.url));
  }
  return response;
```
(Leave the early `const response = NextResponse.redirect(new URL(redirect, ...))` as-is for the explicit-redirect case; the new block overrides only the default.)

**Step 4: Verify type-check** — `npx tsc --noEmit` → no new errors.

**Step 5: [USER VERIFY]** Fresh login as a student lands on `/student/dashboard`; as an admin lands on `/dashboard`.

**Step 6: Commit**
```bash
git add app/auth/callback/route.ts
git commit -m "feat(auth): redirect post-login by role; accept any TMS area permission"
```

---

### Task 1.4: Self-scoped learner identity helper + `/api/student/me`

The IDOR fix: identity comes from `auth.userId`, never a client param. Reuse the canonical `lib/passengers/*` select + mapping.

**Files:**
- Create: `lib/student/identity.ts`
- Create: `app/api/student/me/route.ts`
- Read for reference (don't modify): `lib/passengers/types.ts` (`LEARNER_SELECT`, `mapLearner`, `LearnerRow`), `lib/passengers/refs.ts` (`loadPassengerRefs`)

**Step 1: Confirm the reusable exports exist**

Run: `grep -n "export" lib/passengers/types.ts lib/passengers/refs.ts`
Expected: `LEARNER_SELECT`, `mapLearner`, `LearnerRow`, `loadPassengerRefs` are exported. (If the `ref` field names differ, adapt the `loadPassengerRefs` call below to match.)

**Step 2: Write the identity helper**
```ts
// lib/student/identity.ts
import type { AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { LEARNER_SELECT, type LearnerRow } from '@/lib/passengers/types';

/**
 * Resolve the learners_profiles row for the authenticated user — by the hard
 * profile_id FK first, then an email fallback during the linkage transition.
 * Identity is ALWAYS derived from the session (auth.userId); callers can never
 * pass a learner id, which closes the IDOR class the passenger app had.
 */
export async function getLearnerRowForUser(auth: AuthContext): Promise<LearnerRow | null> {
  const svc = createServiceRoleClient();

  // Canonical link: profiles.learner_id → learners_profiles.id (verified 1:1 FK,
  // the authoritative person↔identity key — email is unreliable for the transport
  // cohort, which barely carries it).
  const { data: prof } = await auth.supabase
    .from('profiles')
    .select('learner_id, email')
    .eq('id', auth.userId)
    .single();

  if (prof?.learner_id) {
    const byLearnerId = await svc
      .from('learners_profiles')
      .select(LEARNER_SELECT)
      .eq('id', prof.learner_id)
      .maybeSingle();
    if (byLearnerId.data) return byLearnerId.data as unknown as LearnerRow;
  }

  // Fallback 1: the reverse profile_id FK we backfilled.
  const byFk = await svc
    .from('learners_profiles')
    .select(LEARNER_SELECT)
    .eq('profile_id', auth.userId)
    .maybeSingle();
  if (byFk.data) return byFk.data as unknown as LearnerRow;

  // Fallback 2 (last resort): institutional email match.
  if (!prof?.email) return null;
  const email = prof.email.toLowerCase();
  const byEmail = await svc
    .from('learners_profiles')
    .select(LEARNER_SELECT)
    .or(`college_email.eq.${email},student_email.eq.${email}`)
    .maybeSingle();
  return (byEmail.data as unknown as LearnerRow) ?? null;
}
```

**Step 3: Write the route**
```ts
// app/api/student/me/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { mapLearner } from '@/lib/passengers/types';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { getLearnerRowForUser } from '@/lib/student/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getMe(_request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.PASSENGER_SELF_VIEW))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const row = await getLearnerRowForUser(auth);
  if (!row) {
    return NextResponse.json({ error: 'Learner profile not found' }, { status: 404 });
  }

  const supabase = createServiceRoleClient();
  const refs = await loadPassengerRefs(supabase, {
    institutionIds: [row.institution_id],
    departmentIds: [row.department_id],
    routeIds: [row.transport_route_id],
    stopIds: [row.transport_stop_id],
    programIds: [row.program_id],
    semesterIds: [row.semester_id],
  });

  return NextResponse.json({ success: true, data: mapLearner(row, refs) });
}

export const GET = withAuth((request, auth) => getMe(request, auth));
```

**Step 4: Verify type-check** — `npx tsc --noEmit` → no new errors. (If `LearnerRow` lacks any of the ref id fields used above, drop those entries from the `loadPassengerRefs` call.)

**Step 5: Route probe (agent)** — `curl -i http://localhost:3000/api/student/me`
Expected: `401 {"error":"Unauthorized"}` (unauthenticated) — proves the gate.

**Step 6: [USER VERIFY]** Logged in as a student, open `http://localhost:3000/api/student/me` → `200 { success: true, data: { ...your learner profile with route/stop names... } }`. As an admin without `tms.passenger.self.view` → `403`.

**Step 7: Commit**
```bash
git add lib/student/identity.ts app/api/student/me/route.ts
git commit -m "feat(student): self-scoped /api/student/me from session identity"
```

---

### Task 1.5: Student navigation + shell layout

**Files:**
- Create: `lib/student/navigation.ts`
- Create: `app/student/layout.tsx`

**Step 1: Write the nav model**
```ts
// lib/student/navigation.ts
import { LayoutDashboard, Route, Calendar, CreditCard, MessageCircle, Bell, MapPin, User, Settings } from 'lucide-react';
import type { ComponentType } from 'react';

export interface StudentNavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** Pages not built yet render disabled. Remove the flag as each phase lands. */
  comingSoon?: boolean;
}

export const studentNavigation: StudentNavItem[] = [
  { name: 'Home', href: '/student/dashboard', icon: LayoutDashboard },
  { name: 'My Route', href: '/student/routes', icon: Route, comingSoon: true },
  { name: 'Schedules', href: '/student/schedules', icon: Calendar, comingSoon: true },
  { name: 'Payments', href: '/student/payments', icon: CreditCard, comingSoon: true },
  { name: 'Grievances', href: '/student/grievances', icon: MessageCircle, comingSoon: true },
  { name: 'Notifications', href: '/student/notifications', icon: Bell, comingSoon: true },
  { name: 'Live Track', href: '/student/live-track', icon: MapPin, comingSoon: true },
  { name: 'Profile', href: '/student/profile', icon: User },
  { name: 'Settings', href: '/student/settings', icon: Settings },
];
```

**Step 2: Write the shell** (client guard = role-based, since the client merged-perms RPC ignores the `profiles.role` fallback — see plan header insight)
```tsx
// app/student/layout.tsx
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { usePermissions } from '@/hooks/use-permissions';
import { studentNavigation } from '@/lib/student/navigation';
import { cn } from '@/lib/utils';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const { isStudent, isSuperAdmin } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    // Server proxy is the real boundary; this is a fast client guard.
    if (!isStudent && !isSuperAdmin) router.replace('/dashboard');
  }, [loading, user, profile, isStudent, isSuperAdmin, router, pathname]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-card">
        <div className="h-14 flex items-center px-4 font-semibold">JKKN Transport</div>
        <nav className="flex-1 px-2 space-y-1">
          {studentNavigation.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return item.comingSoon ? (
              <span key={item.href} className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground/60 cursor-not-allowed">
                <Icon className="h-4 w-4" /> {item.name}
                <span className="ml-auto text-[10px] uppercase">soon</span>
              </span>
            ) : (
              <Link key={item.href} href={item.href}
                className={cn('flex items-center gap-3 px-3 py-2 rounded-md text-sm',
                  active ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted')}>
                <Icon className="h-4 w-4" /> {item.name}
              </Link>
            );
          })}
        </nav>
        <button onClick={signOut} className="m-2 px-3 py-2 text-sm text-left text-destructive hover:bg-muted rounded-md">
          Sign out
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b flex items-center px-4 justify-between">
          <span className="font-medium md:hidden">JKKN Transport</span>
          <span className="text-sm text-muted-foreground truncate">{profile.full_name || profile.email}</span>
        </header>
        <main className="flex-1 p-4 pb-20 md:pb-4">{children}</main>
      </div>

      {/* Mobile bottom nav (built items only) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t bg-card flex justify-around py-2">
        {studentNavigation.filter((i) => !i.comingSoon).slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href}
              className={cn('flex flex-col items-center text-[11px]', active ? 'text-primary' : 'text-muted-foreground')}>
              <Icon className="h-5 w-5" /> {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

**Step 3: Verify type-check** — `npx tsc --noEmit` → no new errors. Confirm `@/lib/utils` exports `cn` (it does — `lib/utils.ts`).

**Step 4: Commit**
```bash
git add lib/student/navigation.ts app/student/layout.tsx
git commit -m "feat(student): add student area shell + navigation"
```

---

### Task 1.6: Student dashboard, profile, settings pages (read-only, existing data)

**Files:**
- Create: `app/student/dashboard/page.tsx`
- Create: `app/student/profile/page.tsx`
- Create: `app/student/settings/page.tsx`

**Step 1: Dashboard — show transport assignment from `/api/student/me`**
```tsx
// app/student/dashboard/page.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

async function fetchMe() {
  const res = await fetch('/api/student/me', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load profile');
  return (await res.json()).data;
}

export default function StudentDashboardPage() {
  const { data: me, isLoading, error } = useQuery({ queryKey: ['student-me'], queryFn: fetchMe });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (error) return <div className="text-destructive">Could not load your transport profile.</div>;

  const enrolled = me?.busRequired ?? me?.bus_required;
  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Welcome{me?.firstName ? `, ${me.firstName}` : ''}</h1>
      <Card>
        <CardHeader><CardTitle>Transport status</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Enrolled for transport: <strong>{enrolled ? 'Yes' : 'No'}</strong></p>
          <p>Route: <strong>{me?.routeName ?? me?.transport_route_name ?? '—'}</strong></p>
          <p>Boarding stop: <strong>{me?.stopName ?? me?.transport_stop_name ?? '—'}</strong></p>
          <p>Transport fee: <strong>{me?.transportFee ?? me?.transport_fee ?? '—'}</strong></p>
        </CardContent>
      </Card>
    </div>
  );
}
```
> The exact field names come from `mapLearner` in `lib/passengers/types.ts` — open it and replace the `me?.xxx` accessors with the real DTO keys (the `??` pairs above hedge camelCase vs snake_case; pick the right one).

**Step 2: Profile page** — same `fetchMe`, render the learner's identity fields read-only (name, roll number, email, department/program/route/stop names). Reuse `Card`.

**Step 3: Settings page** — minimal stub:
```tsx
// app/student/settings/page.tsx
export default function StudentSettingsPage() {
  return <div className="max-w-2xl"><h1 className="text-xl font-semibold mb-2">Settings</h1><p className="text-muted-foreground text-sm">Notification & account settings — coming in a later phase.</p></div>;
}
```

**Step 4: Verify type-check** — `npx tsc --noEmit` → no new errors.

**Step 5: Route probe (agent)** — `curl -i http://localhost:3000/student/dashboard` → `307 → /auth/login` (unauthenticated).

**Step 6: [USER VERIFY]** Logged in as a student: `/student/dashboard` renders your real route/stop/fee; the shell sidebar/bottom-nav work; `/student/profile` shows your details; the admin sidebar is NOT shown. Logged in as an admin: `/student/dashboard` bounces to `/dashboard`.

**Step 7: Commit**
```bash
git add app/student/dashboard/page.tsx app/student/profile/page.tsx app/student/settings/page.tsx
git commit -m "feat(student): read-only dashboard, profile, settings on existing data"
```

---

### Task 1.7 (optional, recommended): Make client `can()` consistent for students

`get_user_merged_permissions()` ignores the `profiles.role` fallback, so `usePermissions().can('tms.passenger.*')` returns `false` for students with no `user_roles` row. The shell (Task 1.5) avoids `can()` for this reason, but future student pages will want it. This patches the **shared** RPC to merge the role fallback — confirm with the MyJKKN owner before applying, since MyJKKN consumes the same function.

**Files:**
- Create: `supabase/migrations/20260609092000_merged_perms_role_fallback.sql`

**Step 1: Write the migration** — extend `get_user_merged_permissions(p_user_id)` to also OR-merge `(SELECT permissions FROM custom_roles cr JOIN profiles p ON p.role = cr.role_key WHERE p.id = p_user_id)` into `merged_permissions` before returning. (Author with @supabase-expert; keep `SECURITY DEFINER` and the existing OR-merge shape.)

**Step 2: Apply + verify**
```sql
SELECT (get_user_merged_permissions('<a-student-profile-id>')->>'tms.passenger.self.view')::bool;
```
Expected: `true`.

**Step 3: [USER VERIFY]** As a student, a page using `usePermissions().can('tms.passenger.self.view')` now returns `true`.

**Step 4: Commit**
```bash
git add supabase/migrations/20260609092000_merged_perms_role_fallback.sql
git commit -m "fix(rbac): merge profiles.role fallback into get_user_merged_permissions"
```

---

## Done-ness checklist for Phases 0–1

- [ ] `profile_id` FKs exist + backfilled; unlinked bus-learners count understood.
- [ ] `tms.passenger.*` / `tms.driver.self.view` keys in the catalog and seeded on the `student`/`driver` roles.
- [ ] A real **student** logs in → lands on `/student/dashboard`, sees their route/stop/fee, cannot reach `/dashboard`.
- [ ] A real **admin** logs in → unchanged `/dashboard`, cannot be forced into `/student/*` data (403 on `/api/student/me`).
- [ ] `npx tsc --noEmit` clean on all touched files.
- [ ] Each task committed on `feat/passenger-foundation`.

## What Phase 2+ builds on this (preview)

Phase 2 adds read-only `/student/routes` + `/student/notifications` (data already exists: `tms_route`/`tms_route_stop`, `notifications`) and the `/driver/*` shell. Phase 3 introduces the first new `tms_*` transactional tables (enrollment, schedules, bookings, attendance). See `docs/PASSENGER_INTEGRATION_ANALYSIS.md` §6 for the full roadmap.

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-06-09-passenger-integration-phase-0-1.md`. Two execution options:

1. **Subagent-Driven (this session)** — I dispatch a fresh subagent per task and review between tasks (REQUIRED SUB-SKILL: @subagent-driven-development).
2. **Parallel Session (separate)** — open a new session and run @executing-plans with review checkpoints.

Which approach?
