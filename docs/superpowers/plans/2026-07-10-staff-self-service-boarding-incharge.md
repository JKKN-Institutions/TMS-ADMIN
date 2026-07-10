# Staff Self-Service Boarding In-Charge Selection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any active `bus_required` staff member log in, pick the bus/route they are in-charge of, and be auto-assigned as the boarding scanner for it — no admin doing the pairing.

**Architecture:** Reuse the existing assignment → `transport_boarding` role → `/boarding` portal pipeline. Add (a) a SECURITY-DEFINER eligibility RPC that is the sole authority on "who may self-pick," (b) an entry path through the login + proxy gates for eligible-but-unassigned staff, and (c) a `/boarding/select-route` picker whose POST creates the assignment. The moment a staff picks, they rejoin the exact code path an admin-assigned staff already uses.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`), TypeScript, Supabase (Postgres + RLS + service-role client), TanStack Table, Tailwind v4, react-hot-toast, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-10-staff-self-service-boarding-incharge-design.md`

## Global Constraints

- **Follow the MODERN route pattern**, not legacy `DatabaseService`: `withAuth` + `AuthContext`, `createServiceRoleClient` for RLS-bypassing writes, a `requirePerm`/eligibility check for authorization, and the `{ success, data }` / `{ error }` JSON shape. Copy the shape of `app/api/boarding/access/route.ts`.
- **The MyJKKN `staff` table is READ-ONLY for TMS.** Never write to it. The chosen route lives only in `tms_staff_route_assignment`.
- **Migrations:** apply via the Supabase MCP (`mcp__supabase__apply_migration`) AND commit the `.sql` file under `supabase/migrations/`. The MCP targets the real app DB (`kvizhngldtiuufknvehv`).
- **Verification substrate (this repo has no route unit-test harness, and ESLint is broken):** verify each task with `npx tsc --noEmit` (confirm the touched files add no new errors), dev-server route probes (`curl` for HTTP status), and Supabase SQL via MCP (`mcp__supabase__execute_sql`). Auth-gated *page* flows can only be fully verified by the user in their authenticated browser — call that out, don't fake it.
- **Permission constant:** `TMS_PERMISSIONS.ATTENDANCE_SCAN === 'tms.attendance.scan'` (`lib/constants/tms-permissions.ts`).
- **Commits:** you are on branch `feat/weekly-booking-window`. `git add` the **specific files** for each task — never `git add -A` (parallel sessions touch this tree). End every commit message with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Assumption for probes:** the dev server is running at `http://localhost:3000` (`npm run dev`). Start it once before the tasks that use `curl`.

---

### Task 1: Migration — `source` column + eligibility RPC

**Files:**
- Create: `supabase/migrations/20260710120000_staff_self_service_boarding_incharge.sql`

**Interfaces:**
- Produces: DB function `tms_staff_boarding_eligibility(p_profile_id uuid) → jsonb` shaped `{ "eligible": boolean, "assigned_route_count": int }`; column `tms_staff_route_assignment.source text` (`'admin'|'self'`, default `'admin'`).

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260710120000_staff_self_service_boarding_incharge.sql`:

```sql
-- Staff self-service boarding in-charge selection.
-- 1) provenance column on the assignment table; 2) eligibility oracle RPC.

-- Provenance: how the assignment was made. Existing rows are all admin-made.
ALTER TABLE tms_staff_route_assignment
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'admin'
    CHECK (source IN ('admin','self'));

-- Eligibility oracle: is this logged-in user an active bus_required staff member,
-- and how many active route assignments do they already have? SECURITY DEFINER so
-- it can read the RLS-protected `staff` table (a user-scoped client sees nothing) —
-- same reason proxy.ts calls tms_student_transport_access / user_has_permission.
CREATE OR REPLACE FUNCTION public.tms_staff_boarding_eligibility(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email    text;
  v_eligible boolean := false;
  v_count    int := 0;
BEGIN
  SELECT lower(email) INTO v_email FROM profiles WHERE id = p_profile_id LIMIT 1;
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'assigned_route_count', 0);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM staff s
    WHERE coalesce(s.bus_required, false) = true
      AND coalesce(s.is_active, false) = true
      AND (lower(s.email) = v_email OR lower(s.institution_email) = v_email)
  ) INTO v_eligible;

  SELECT count(*) INTO v_count
  FROM tms_staff_route_assignment a
  WHERE a.is_active = true AND lower(a.staff_email) = v_email;

  RETURN jsonb_build_object('eligible', v_eligible, 'assigned_route_count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tms_staff_boarding_eligibility(uuid)
  TO authenticated, service_role;
```

- [ ] **Step 2: Apply the migration to the live DB**

Use the Supabase MCP tool `mcp__supabase__apply_migration` with name `staff_self_service_boarding_incharge` and the SQL above.
Expected: success, no error.

- [ ] **Step 3: Verify the column exists (executable check)**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'tms_staff_route_assignment' AND column_name = 'source';
```
Expected: exactly 1 row — `source | text | 'admin'::text`.

- [ ] **Step 4: Verify the RPC shape (executable check)**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT public.tms_staff_boarding_eligibility('00000000-0000-0000-0000-000000000000'::uuid) AS r;
```
Expected: `{"eligible": false, "assigned_route_count": 0}` (unknown profile → not eligible, shape correct).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260710120000_staff_self_service_boarding_incharge.sql
git commit -m "feat(boarding): migration — assignment source column + staff eligibility RPC

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Extract boarding-role helpers to `lib/boarding/roles.ts`

**Files:**
- Create: `lib/boarding/roles.ts`
- Modify: `app/api/admin/staff-route-assignments/route.ts`

**Interfaces:**
- Produces: `grantBoardingRole(supabase: Svc, staffEmail: string, assignedBy: string): Promise<void>` and `maybeRevokeBoardingRole(supabase: Svc, assignmentId: string): Promise<void>`, where `Svc = ReturnType<typeof createServiceRoleClient>`.
- Consumes: nothing new.

- [ ] **Step 1: Create the shared helper file**

Create `lib/boarding/roles.ts` — move the two functions verbatim out of the admin route:

```ts
import { createServiceRoleClient } from '@/lib/supabase/server';

type Svc = ReturnType<typeof createServiceRoleClient>;

// Boarding scanners are designated by route assignment: assigning a staff grants
// them the dedicated `transport_boarding` role (via user_roles), so the proxy
// /boarding gate + client can() pass. Best-effort — never fails the assignment.
export async function grantBoardingRole(supabase: Svc, staffEmail: string, assignedBy: string) {
  try {
    const { data: prof } = await supabase.from('profiles').select('id').ilike('email', staffEmail).maybeSingle();
    const profileId = (prof as { id: string } | null)?.id;
    if (!profileId) return;
    const { data: role } = await supabase.from('custom_roles').select('id').eq('role_key', 'transport_boarding').maybeSingle();
    const roleId = (role as { id: string } | null)?.id;
    if (!roleId) return;
    const { data: existing } = await supabase.from('user_roles').select('id').eq('user_id', profileId).eq('role_id', roleId).maybeSingle();
    if (existing) return;
    await supabase.from('user_roles').insert({ user_id: profileId, role_id: roleId, is_primary: false, assigned_by: assignedBy });
  } catch (e) {
    console.error('grantBoardingRole (non-fatal):', e);
  }
}

// Revoke the boarding role only if the staff has NO remaining active assignments.
export async function maybeRevokeBoardingRole(supabase: Svc, assignmentId: string) {
  try {
    const { data: a } = await supabase.from('tms_staff_route_assignment').select('staff_email').eq('id', assignmentId).maybeSingle();
    const email = (a as { staff_email: string } | null)?.staff_email;
    if (!email) return;
    const { data: remaining } = await supabase
      .from('tms_staff_route_assignment').select('id').eq('staff_email', email).eq('is_active', true).limit(1).maybeSingle();
    if (remaining) return;
    const { data: prof } = await supabase.from('profiles').select('id').ilike('email', email).maybeSingle();
    const profileId = (prof as { id: string } | null)?.id;
    if (!profileId) return;
    const { data: role } = await supabase.from('custom_roles').select('id').eq('role_key', 'transport_boarding').maybeSingle();
    const roleId = (role as { id: string } | null)?.id;
    if (!roleId) return;
    await supabase.from('user_roles').delete().eq('user_id', profileId).eq('role_id', roleId);
  } catch (e) {
    console.error('maybeRevokeBoardingRole (non-fatal):', e);
  }
}
```

- [ ] **Step 2: Update the admin route to import the helpers and stamp `source`**

In `app/api/admin/staff-route-assignments/route.ts`:

1. **Delete** the two local function definitions `grantBoardingRole` and `maybeRevokeBoardingRole` (currently lines ~21–56) and the now-unused local `type Svc = ...` if it is used only by them (keep it if other code uses it).
2. Add the import near the top (after the existing imports):

```ts
import { grantBoardingRole, maybeRevokeBoardingRole } from '@/lib/boarding/roles';
```

3. In `postAssignment`, add `source: 'admin'` to the insert object so admin-made rows are explicit:

```ts
    const { data: assignment, error } = await supabase
      .from('tms_staff_route_assignment')
      .insert({ staff_email: staffEmail, route_id: routeId, assigned_by: auth.userId, notes, is_active: true, source: 'admin' })
      .select('*')
      .single();
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `app/api/admin/staff-route-assignments/route.ts` or `lib/boarding/roles.ts`.

- [ ] **Step 4: Probe the admin route still parses (unauth → 401)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/admin/staff-route-assignments`
Expected: `401` (proxy blocks unauthenticated) — confirms the module compiles and serves.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/roles.ts app/api/admin/staff-route-assignments/route.ts
git commit -m "refactor(boarding): extract grant/revoke boarding-role helpers to lib

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Eligibility helper + expose `eligible` from `/api/boarding/access`

**Files:**
- Create: `lib/boarding/eligibility.ts`
- Modify: `app/api/boarding/access/route.ts`

**Interfaces:**
- Produces: `getStaffBoardingEligibility(supabase, profileId): Promise<{ eligible: boolean; assignedRouteCount: number }>`; `GET /api/boarding/access` response gains `eligible: boolean`.
- Consumes: DB RPC `tms_staff_boarding_eligibility` (Task 1).

- [ ] **Step 1: Create the eligibility helper**

Create `lib/boarding/eligibility.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface StaffBoardingEligibility {
  eligible: boolean;
  assignedRouteCount: number;
}

/**
 * Is this authenticated user an active bus_required staff member (and how many
 * active route assignments do they already have)? Wraps the SECURITY DEFINER RPC
 * so proxy.ts, the OAuth callback, and the boarding API routes share one contract.
 * Fail-closed: any error → not eligible.
 */
export async function getStaffBoardingEligibility(
  supabase: SupabaseClient,
  profileId: string
): Promise<StaffBoardingEligibility> {
  try {
    const { data } = await supabase.rpc('tms_staff_boarding_eligibility', { p_profile_id: profileId });
    const row = (data ?? {}) as { eligible?: boolean; assigned_route_count?: number };
    return { eligible: !!row.eligible, assignedRouteCount: row.assigned_route_count ?? 0 };
  } catch {
    return { eligible: false, assignedRouteCount: 0 };
  }
}
```

- [ ] **Step 2: Return `eligible` from the access endpoint**

Replace the body of `getAccess` in `app/api/boarding/access/route.ts` so eligibility is computed regardless of the scan permission (an eligible-but-unassigned staff lacks the permission but must still see `eligible:true`):

```ts
async function getAccess(auth: AuthContext) {
  try {
    if (auth.isSuperAdmin) {
      return NextResponse.json({ success: true, data: { allowed: true, assignedRouteCount: 0, eligible: false, superAdmin: true } });
    }
    const elig = await getStaffBoardingEligibility(auth.supabase, auth.userId);
    const hasScan = await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN);
    const routeIds = hasScan ? await getAssignedRouteIdsForUser(auth) : [];
    return NextResponse.json({
      success: true,
      data: { allowed: routeIds.length > 0, assignedRouteCount: routeIds.length, eligible: elig.eligible },
    });
  } catch (e) {
    console.error('boarding access check error:', e);
    // Fail closed — if we can't confirm access, don't grant it.
    return NextResponse.json({ success: true, data: { allowed: false, assignedRouteCount: 0, eligible: false } });
  }
}
```

Add the import at the top of the file:

```ts
import { getStaffBoardingEligibility } from '@/lib/boarding/eligibility';
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `lib/boarding/eligibility.ts` or `app/api/boarding/access/route.ts`.

- [ ] **Step 4: Probe (unauth → 401)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/boarding/access`
Expected: `401`.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/eligibility.ts app/api/boarding/access/route.ts
git commit -m "feat(boarding): eligibility helper + expose eligible from access endpoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `GET /api/boarding/available-routes` (picker data)

**Files:**
- Create: `app/api/boarding/available-routes/route.ts`

**Interfaces:**
- Produces: `GET /api/boarding/available-routes` → `{ success: true, data: AvailableRoute[] }` where `AvailableRoute = { id, route_number, route_name, start_location, end_location, departure_time, arrival_time, total_capacity, current_passengers }`.
- Consumes: `getStaffBoardingEligibility` (Task 3), `TMS_PERMISSIONS.ATTENDANCE_SCAN`.

- [ ] **Step 1: Create the endpoint**

Create `app/api/boarding/available-routes/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStaffBoardingEligibility } from '@/lib/boarding/eligibility';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

/**
 * Active routes offered to a boarding staffer choosing which bus they are
 * in-charge of. Reachable by a super admin, anyone holding tms.attendance.scan,
 * OR an eligible bus_required staffer (the self-service pre-assignment window).
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

const ROUTE_COLS =
  'id, route_number, route_name, start_location, end_location, departure_time, arrival_time, total_capacity, current_passengers';

async function getAvailableRoutes(auth: AuthContext) {
  try {
    let allowed = await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN);
    if (!allowed) {
      const elig = await getStaffBoardingEligibility(auth.supabase, auth.userId);
      allowed = elig.eligible;
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from('tms_route')
      .select(ROUTE_COLS)
      .eq('status', 'active')
      .order('route_number', { ascending: true });

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [] });
      console.error('available-routes query error:', error);
      return NextResponse.json({ error: 'Failed to load routes' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (e) {
    console.error('available-routes error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_req, auth) => getAvailableRoutes(auth));
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/api/boarding/available-routes/route.ts`.

- [ ] **Step 3: Probe (unauth → 401 from proxy)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/boarding/available-routes`
Expected: `401`.

- [ ] **Step 4: Commit**

```bash
git add app/api/boarding/available-routes/route.ts
git commit -m "feat(boarding): available-routes endpoint for the in-charge picker

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `POST /api/boarding/self-assign` (the self-service write)

**Files:**
- Create: `app/api/boarding/self-assign/route.ts`

**Interfaces:**
- Produces: `POST /api/boarding/self-assign` body `{ routeId: string }` → `{ success: true, assignment }` on 201; `403` (not eligible), `409` (already assigned), `404`/`400` (bad route).
- Consumes: `getStaffBoardingEligibility` (Task 3), `grantBoardingRole` (Task 2), `logActivity`.

- [ ] **Step 1: Create the endpoint**

Create `app/api/boarding/self-assign/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStaffBoardingEligibility } from '@/lib/boarding/eligibility';
import { grantBoardingRole } from '@/lib/boarding/roles';
import { logActivity } from '@/lib/activity/log';

/**
 * A bus_required staffer self-selects the ONE route they are in-charge of. This
 * is the self-service equivalent of the admin assign flow: it creates the
 * tms_staff_route_assignment (source='self') and grants the transport_boarding
 * role so the staffer flows through the existing gates afterwards. One-time:
 * a staffer with an existing active assignment is rejected (admin must change it).
 */
async function postSelfAssign(request: NextRequest, auth: AuthContext) {
  try {
    const body = await request.json().catch(() => ({}));
    const routeId = String(body?.routeId ?? '').trim();
    if (!routeId) {
      return NextResponse.json({ error: 'Route is required' }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    // The assignment key is the staffer's email (matches getAssignedRouteIdsForUser).
    const { data: prof } = await svc.from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    const email = ((prof as { email: string | null } | null)?.email ?? '').toLowerCase().trim();
    if (!email) {
      return NextResponse.json({ error: 'Your profile has no email on file' }, { status: 400 });
    }

    // Server-side authority: eligibility + one-time guard.
    const elig = await getStaffBoardingEligibility(auth.supabase, auth.userId);
    if (!elig.eligible) {
      return NextResponse.json({ error: 'You are not eligible to select a route' }, { status: 403 });
    }
    if (elig.assignedRouteCount > 0) {
      return NextResponse.json(
        { error: 'You already have a route. Contact an admin to change it.' },
        { status: 409 }
      );
    }

    // ── PHASE 2 SEAM (staff fees) ──────────────────────────────────────────────
    // When staff transport fees exist, block here if this staffer is not cleared
    // (mirror the learner tms_student_transport_access gate). No-op in Phase 1.

    // Validate the route is real and active.
    const { data: route, error: routeErr } = await svc
      .from('tms_route').select('id, status').eq('id', routeId).maybeSingle();
    if (routeErr?.code === '42P01') {
      return NextResponse.json({ error: 'Routes table not found' }, { status: 503 });
    }
    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }
    if ((route as { status: string }).status !== 'active') {
      return NextResponse.json({ error: 'That route is not active' }, { status: 400 });
    }

    const { data: assignment, error } = await svc
      .from('tms_staff_route_assignment')
      .insert({ staff_email: email, route_id: routeId, assigned_by: auth.userId, source: 'self', is_active: true })
      .select('*')
      .single();
    if (error) {
      // 23505 = the active (staff_email, route_id) unique index — treat as already-done.
      if (error.code === '23505') {
        return NextResponse.json({ error: 'You already have this route.' }, { status: 409 });
      }
      console.error('self-assign insert error:', error);
      return NextResponse.json({ error: 'Failed to select route' }, { status: 500 });
    }

    await grantBoardingRole(svc, email, auth.userId);
    await logActivity(auth, request, {
      module: 'staff-route-assignments',
      action: 'self-assign',
      entityType: 'tms_staff_route_assignment',
      entityId: (assignment as { id: string } | null)?.id,
      entityLabel: email,
      description: `Self-assigned ${email} to route ${routeId}`,
      metadata: { staffEmail: email, routeId, source: 'self' },
    });

    return NextResponse.json({ success: true, message: 'Route selected', assignment }, { status: 201 });
  } catch (e) {
    console.error('self-assign error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => postSelfAssign(request, auth));
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/api/boarding/self-assign/route.ts`. If `logActivity`'s option keys differ, open `lib/activity/log.ts` and match the existing call in `app/api/admin/staff-route-assignments/route.ts` exactly.

- [ ] **Step 3: Probe (unauth → 401)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/boarding/self-assign -H "Content-Type: application/json" -d '{"routeId":"x"}'`
Expected: `401`.

- [ ] **Step 4: Commit**

```bash
git add app/api/boarding/self-assign/route.ts
git commit -m "feat(boarding): self-assign endpoint — staff picks their in-charge route

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Let eligible staff through the `proxy.ts` boarding gate

**Files:**
- Modify: `proxy.ts` (the area-gate block, currently ~lines 162–186)

**Interfaces:**
- Consumes: DB RPC `tms_staff_boarding_eligibility` (Task 1) via the proxy's user-scoped `supabase`.

- [ ] **Step 1: Add the eligibility escape hatch on the boarding deny path**

In `proxy.ts`, replace the opening of the area-gate block:

```ts
  if (!profile.is_super_admin && !areaExempt) {
    const hasAccess = areaPermRes.data;

    if (!hasAccess) {
```

with:

```ts
  if (!profile.is_super_admin && !areaExempt) {
    let hasAccess = areaPermRes.data;

    // Staff self-service: a bus_required staffer WITHOUT tms.attendance.scan may
    // still enter the boarding area to PICK a route. JIT eligibility, paid only on
    // the boarding deny path (the brief pre-assignment window; the hot path already
    // holds the permission and never reaches this RPC).
    if (!hasAccess && area === 'boarding') {
      const { data: elig } = await supabase.rpc('tms_staff_boarding_eligibility', {
        p_profile_id: user.id,
      });
      if ((elig as { eligible?: boolean } | null)?.eligible) hasAccess = true;
    }

    if (!hasAccess) {
```

(The rest of the block — the redirect-to-home logic — is unchanged.)

- [ ] **Step 2: Add the Phase 2 fees seam comment**

Immediately AFTER the closing `}` of the `if (!profile.is_super_admin && !areaExempt) { ... }` area-gate block and BEFORE the `// 5b. Transport-payment gate` comment, insert:

```ts
  // ── PHASE 2 SEAM (staff fees) ────────────────────────────────────────────────
  // Symmetric to the learner gate (5b below): an eligible boarding staffer whose
  // transport fees are NOT cleared will be redirected to /boarding/fees here, via
  // a tms_staff_transport_access RPC. Not implemented in Phase 1 (no staff bills).
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `proxy.ts`.

- [ ] **Step 4: Probe the gate still serves (unauth page → 307 redirect to login)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/boarding/select-route`
Expected: `307` (proxy redirects unauthenticated page requests to `/auth/login`). This confirms `proxy.ts` compiled and runs; it does NOT yet prove the eligible-staff path (that needs the user's authenticated browser — flag in the final smoke test).

- [ ] **Step 5: Commit**

```bash
git add proxy.ts
git commit -m "feat(boarding): admit eligible bus_required staff to the boarding area gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Land eligible staff on the picker at login (`auth/callback`)

**Files:**
- Modify: `app/auth/callback/route.ts`

**Interfaces:**
- Consumes: DB RPC `tms_staff_boarding_eligibility` (Task 1).

- [ ] **Step 1: Add eligibility to the TMS-access gate**

In `app/auth/callback/route.ts`, inside `if (!profile.is_super_admin) { ... }`, after the `AREA_KEYS` loop computes `hasAnyTms` and BEFORE the `if (!hasAnyTms) { signOut ... }` block, insert an eligibility fallback and remember the result:

```ts
    // Bus_required staff have no area permission until they pick a route. Admit
    // them via the eligibility oracle so they can reach /boarding/select-route.
    let boardingEligible = false;
    let staffAssignedCount = 0;
    if (!hasAnyTms) {
      const { data: elig } = await supabase.rpc('tms_staff_boarding_eligibility', {
        p_profile_id: data.user.id,
      });
      const e = elig as { eligible?: boolean; assigned_route_count?: number } | null;
      if (e?.eligible) {
        hasAnyTms = true;
        boardingEligible = true;
        staffAssignedCount = e.assigned_route_count ?? 0;
      }
    }
```

Note: `hasAnyTms` is currently declared with `let`; if it is `const`, change it to `let`. `boardingEligible`/`staffAssignedCount` must be declared here (function scope) so the home-computation block below can read them.

- [ ] **Step 2: Route eligible-unassigned staff to the picker as their home**

Replace the home-computation block near the end:

```ts
  if (!searchParams.get('redirect')) {
    let home = resolveHomeForRole(profile.role, profile.is_super_admin);
    if (home === '/dashboard' && !profile.is_super_admin) {
      const { data: canScan } = await supabase.rpc('user_has_permission', {
        permission_name: 'tms.attendance.scan',
      });
      if (canScan) home = '/boarding/scan';
    }
    response.headers.set('location', new URL(home, request.url).toString());
  }
```

with:

```ts
  if (!searchParams.get('redirect')) {
    let home = resolveHomeForRole(profile.role, profile.is_super_admin);
    if (home === '/dashboard' && !profile.is_super_admin) {
      const { data: canScan } = await supabase.rpc('user_has_permission', {
        permission_name: 'tms.attendance.scan',
      });
      if (canScan) home = '/boarding/scan';
      else if (boardingEligible && staffAssignedCount === 0) home = '/boarding/select-route';
    }
    response.headers.set('location', new URL(home, request.url).toString());
  }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/auth/callback/route.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/auth/callback/route.ts
git commit -m "feat(boarding): land eligible bus_required staff on the route picker at login

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Boarding layout — add the `select` state + minimal shell

**Files:**
- Modify: `app/boarding/layout.tsx`

**Interfaces:**
- Consumes: `GET /api/boarding/access` now returning `{ allowed, assignedRouteCount, eligible }` (Task 3).

- [ ] **Step 1: Widen the access state and derive `select`**

In `app/boarding/layout.tsx`, change the access state type:

```ts
  const [access, setAccess] = useState<'checking' | 'allowed' | 'select' | 'denied'>('checking');
```

Update the access-check effect body so it distinguishes eligible-unassigned:

```ts
  useEffect(() => {
    if (loading || !user || !profile) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/boarding/access', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json().catch(() => ({}));
        const d = json?.data ?? {};
        if (cancelled) return;
        if (res.ok && d.allowed) setAccess('allowed');
        else if (res.ok && d.eligible) setAccess('select');
        else setAccess('denied');
      } catch {
        if (!cancelled) setAccess('denied');
      }
    })();
    return () => { cancelled = true; };
  }, [loading, user, profile]);
```

- [ ] **Step 2: Redirect stray paths and render a minimal shell for `select`**

Add an effect (below the access-check effect) that keeps an unassigned-eligible staffer on the picker:

```ts
  useEffect(() => {
    if (access === 'select' && pathname !== '/boarding/select-route') {
      router.replace('/boarding/select-route');
    }
  }, [access, pathname, router]);
```

Then, in the render, BEFORE the `if (access === 'denied')` block, add a `select`-state branch that renders `children` without the scanner sidebar/bottom-nav:

```ts
  if (access === 'select') {
    return (
      <BugReporterWrapper>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
          <header className="app-header">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-green-600 rounded-lg flex items-center justify-center">
                <Bus className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">JKKN Boarding</h1>
            </div>
            <button
              onClick={() => signOut()}
              className="p-2 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </header>
          <div className="content-body fade-in">{children}</div>
        </div>
      </BugReporterWrapper>
    );
  }
```

(`Bus` and `LogOut` are already imported in this file; `signOut`, `pathname`, `router` are already in scope.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/boarding/layout.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/boarding/layout.tsx
git commit -m "feat(boarding): layout select-state shell for eligible unassigned staff

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The picker — `app/boarding/select-route/page.tsx`

**Files:**
- Create: `app/boarding/select-route/page.tsx`

**Interfaces:**
- Consumes: `GET /api/boarding/available-routes` (Task 4), `POST /api/boarding/self-assign` (Task 5), `GET /api/boarding/access` (Task 3, to detect the locked state).

- [ ] **Step 1: Create the picker page**

Create `app/boarding/select-route/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bus, Check, Loader2, MapPin, Clock, Users, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

interface AvailableRoute {
  id: string;
  route_number: string | null;
  route_name: string | null;
  start_location: string | null;
  end_location: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  total_capacity: number | null;
  current_passengers: number | null;
}

export default function SelectRoutePage() {
  const router = useRouter();
  const [routes, setRoutes] = useState<AvailableRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // If they already have a route, the picker is locked (no self-switch).
        const accessRes = await fetch('/api/boarding/access', { cache: 'no-store', credentials: 'same-origin' });
        const accessJson = await accessRes.json().catch(() => ({}));
        if (!cancelled && (accessJson?.data?.assignedRouteCount ?? 0) > 0) {
          setLocked(true);
          setLoading(false);
          return;
        }

        const res = await fetch('/api/boarding/available-routes', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load routes');
        if (!cancelled) setRoutes((json.data ?? []) as AvailableRoute[]);
      } catch (e) {
        if (!cancelled) {
          console.error('select-route load error:', e);
          toast.error('Failed to load routes');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleConfirm = async () => {
    if (!selectedId) return toast.error('Please select a bus/route first');
    setSaving(true);
    try {
      const res = await fetch('/api/boarding/self-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ routeId: selectedId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to select route');
      toast.success('You are now the in-charge of this bus');
      router.replace('/boarding/scan');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to select route');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (locked) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
          <Lock className="h-6 w-6 text-gray-400" />
        </div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Your route is set</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          You&apos;re already the in-charge of a bus. Contact an admin to change your route.
        </p>
        <button
          onClick={() => router.replace('/boarding/scan')}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Go to boarding
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-green-600">
          <Bus className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Choose your bus</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Pick the bus you&apos;re in-charge of. You can only choose once — an admin can change it later.
        </p>
      </div>

      {routes.length === 0 ? (
        <p className="text-center text-sm text-gray-500">No active routes are available right now.</p>
      ) : (
        <div className="space-y-3">
          {routes.map((r) => {
            const active = r.id === selectedId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? 'border-green-600 bg-green-50 dark:bg-green-500/10'
                    : 'border-gray-200 bg-white hover:border-green-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-green-500/40'
                }`}
              >
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  active ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 text-transparent'
                }`}>
                  <Check className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-white">{r.route_name || 'Route'}</span>
                    <span className="font-mono text-xs text-gray-500">{r.route_number || '—'}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{r.start_location || '—'} → {r.end_location || '—'}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{r.departure_time || '—'} – {r.arrival_time || '—'}</span>
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{r.current_passengers ?? 0}/{r.total_capacity ?? 0}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleConfirm}
          disabled={saving || !selectedId}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? 'Setting…' : "I'm the in-charge of this bus"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/boarding/select-route/page.tsx`.

- [ ] **Step 3: Probe (unauth page → 307)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/boarding/select-route`
Expected: `307` (redirect to login) — confirms the route compiles and serves.

- [ ] **Step 4: Commit**

```bash
git add app/boarding/select-route/page.tsx
git commit -m "feat(boarding): self-service route picker page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Admin list — show assignment `source`

**Files:**
- Modify: `app/(admin)/staff-route-assignments/columns.tsx`

**Interfaces:**
- Consumes: `tms_staff_route_assignment.source` (Task 1), surfaced by the existing `GET /api/admin/staff-route-assignments` `select('*')`.

- [ ] **Step 1: Add `source` to the row type**

In `app/(admin)/staff-route-assignments/columns.tsx`, add to the `AssignmentRow` interface:

```ts
  source?: 'admin' | 'self' | null;
```

- [ ] **Step 2: Add a Source badge column**

Insert this column object into the returned array, immediately before the `assigned_at` column:

```tsx
    {
      accessorKey: 'source',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
      size: 120,
      cell: ({ row }) => {
        const self = row.original.source === 'self';
        return (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              self
                ? 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300'
            }`}
          >
            {self ? 'Self-selected' : 'Admin'}
          </span>
        );
      },
    },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/(admin)/staff-route-assignments/columns.tsx`.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/staff-route-assignments/columns.tsx"
git commit -m "feat(boarding): show assignment source (self vs admin) in the admin list

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (after all tasks) — user-driven smoke test

Auth-gated page flows cannot be verified headless (the agent's browser is unauthenticated). The user runs this once, in their authenticated browser:

1. **Seed one eligible staffer (temporary, via Supabase MCP):** pick a real staff row whose `email`/`institution_email` matches a loginable `profiles` row and set `bus_required=true, is_active=true`. Confirm the oracle:

   ```sql
   SELECT public.tms_staff_boarding_eligibility(
     (SELECT id FROM profiles WHERE lower(email) = lower('<that-staff-email>'))
   );
   -- Expect: {"eligible": true, "assigned_route_count": 0}
   ```

2. **Log in as that staffer.** Expected: lands on `/boarding/select-route` (not signed out, not `/dashboard`).
3. **Pick a route → "I'm the in-charge of this bus."** Expected: toast, redirect to `/boarding/scan`, route details visible.
4. **Confirm the write:**

   ```sql
   SELECT staff_email, route_id, source, is_active
   FROM tms_staff_route_assignment
   WHERE lower(staff_email) = lower('<that-staff-email>') AND is_active = true;
   -- Expect: one row, source = 'self'
   ```

5. **Revisit `/boarding/select-route`.** Expected: the **locked** state ("Your route is set — contact an admin to change").
6. **Admin view:** `/staff-route-assignments` shows the row with a **Self-selected** badge.
7. **Cleanup:** if the seeded staffer was only for testing, admin-remove the assignment (frees them to pick again) and reset the `bus_required` flag if it was changed only for the test.

## Notes for the executor

- **Migration application is destructive-ish (DDL on prod DB).** It is additive (`ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`) and safe to re-run, but confirm HEAD before committing — parallel sessions commit to this repo.
- If `npx tsc --noEmit` surfaces *pre-existing* errors unrelated to your files, that's expected in this repo; only fail a task on errors in the files that task touched.
- `logActivity`'s exact option keys: mirror the working call already in `app/api/admin/staff-route-assignments/route.ts` if the compiler disagrees with the keys used in Task 5.
