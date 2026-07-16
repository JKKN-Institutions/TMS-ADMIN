# Staff Bus In-Charge Willingness Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/boarding/select-route` pick-any-route list with a one-time willingness toggle that auto-assigns the staffer's own route from the staff master.

**Architecture:** Reuse the existing pipeline (assignment → `transport_boarding` role → `/boarding` portal) untouched. Extend the `tms_staff_boarding_eligibility` SECURITY DEFINER RPC to also resolve the staffer's own `staff.transport_route_id`, so the client-supplied `routeId` parameter can be deleted from `/api/boarding/self-assign` entirely. One screen is replaced; one endpoint and one page are deleted.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres + plpgsql RPC), Tailwind, vitest, react-hot-toast, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-16-staff-incharge-willingness-toggle-design.md`

## Global Constraints

These apply to every task below.

- **Base branch is `origin/main`.** Do NOT build on local `main` (~35 commits stale) or on `feat/driver-mobile-supply` (41 commits of unrelated driver-mobile work). Run `git fetch` first and branch from `origin/main`.
- **The spec lives on the wrong branch.** It was committed as `bea3f8f` on `feat/driver-mobile-supply`. Cherry-pick it onto the new branch: `git cherry-pick bea3f8f`.
- **Never use `git add -A` or `git stash`.** Parallel sessions commit to this repo mid-task; stage only the exact files each task names.
- **Do NOT run `npm run lint`.** ESLint is broken in this repo (circular config) and crashes.
- **`tsc` is not a clean signal.** The repo carries ~828 pre-existing `never`-type errors and `next.config` sets `typescript.ignoreBuildErrors: true`. Always filter output to the files you changed.
- **vitest has no `@/` path alias.** `vitest.config.ts` sets `include: ['lib/**/*.test.ts']` and `environment: 'node'` with no alias config, so test files and the `lib/` modules they import MUST use relative imports (`./access-state`). Application code outside `lib/` tests uses `@/` normally.
- **`staff` is read-only for TMS.** It is MyJKKN-owned. Never write to it. The route is READ from `staff.transport_route_id` and recorded only in `tms_staff_route_assignment`.
- **Staff transport fees are OUT OF SCOPE.** Do not build a fee gate, a fees page, or a `tms_staff_transport_access` RPC. Leave both existing `PHASE 2 SEAM (staff fees)` comments (in `proxy.ts` and `app/api/boarding/self-assign/route.ts`) exactly where they are.
- **Migrations are committed AND applied.** Write the file under `supabase/migrations/`, then apply it to the live database via the Supabase MCP `apply_migration` tool. The project's Supabase MCP targets the real app DB (`kvizhngldtiuufknvehv`).
- **Commit message trailer.** End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Exact user-facing copy** (do not paraphrase — this wording was approved):
  - Heading: `Bus in-charge`
  - `Willing to be the bus in-charge?` / `You will not pay transport fees.`
  - `Not willing?` / `Transport fees apply.`
  - Toggle label: `I'm willing to be the bus in-charge`
  - Button: `Confirm`
  - Declined heading: `Transport fees apply`
  - Declined body: `You've opted out of being a bus in-charge, so transport fees apply to your travel. Please contact the transport office.`

---

### Task 1: Pure access-state helper

The layout's four-way branch is the only real decision logic in this feature; everything else is I/O. Extracting it makes it testable — including the assigned-but-no-permission case that would otherwise only appear in production.

**Files:**
- Create: `lib/boarding/access-state.ts`
- Test: `lib/boarding/access-state.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `deriveBoardingAccess(input: BoardingAccessInput): BoardingAccess` where
  `type BoardingAccess = 'allowed' | 'choose' | 'denied'` and
  `interface BoardingAccessInput { allowed: boolean; eligible: boolean; assignedRouteCount: number; hasRoute: boolean }`.
  Task 6 imports **only the function** — it keeps its own `useState` literal union
  (`'checking' | 'allowed' | 'choose' | 'denied'`) because it owns the extra `'checking'` state.

- [ ] **Step 1: Write the failing test**

Create `lib/boarding/access-state.test.ts`. Note the relative import — the `@/` alias does not work under vitest.

```ts
import { describe, it, expect } from 'vitest';
import { deriveBoardingAccess } from './access-state';

describe('deriveBoardingAccess', () => {
  it('opens the portal when the staffer is assigned and permitted', () => {
    expect(deriveBoardingAccess({
      allowed: true, eligible: true, assignedRouteCount: 1, hasRoute: true,
    })).toBe('allowed');
  });

  it('opens the portal for a super admin (allowed without eligibility)', () => {
    expect(deriveBoardingAccess({
      allowed: true, eligible: false, assignedRouteCount: 0, hasRoute: false,
    })).toBe('allowed');
  });

  it('offers the toggle to an eligible, unassigned staffer with a route', () => {
    expect(deriveBoardingAccess({
      allowed: false, eligible: true, assignedRouteCount: 0, hasRoute: true,
    })).toBe('choose');
  });

  it('denies an eligible staffer whose route is not allocated', () => {
    expect(deriveBoardingAccess({
      allowed: false, eligible: true, assignedRouteCount: 0, hasRoute: false,
    })).toBe('denied');
  });

  it('denies an assigned staffer who lacks the scan permission (failed role grant)', () => {
    // Must NOT be 'choose' — they already have an assignment, so offering the
    // toggle would invite a confirm the server rejects with 409.
    expect(deriveBoardingAccess({
      allowed: false, eligible: true, assignedRouteCount: 1, hasRoute: true,
    })).toBe('denied');
  });

  it('denies a non-eligible user', () => {
    expect(deriveBoardingAccess({
      allowed: false, eligible: false, assignedRouteCount: 0, hasRoute: true,
    })).toBe('denied');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/boarding/access-state.test.ts`

Expected: FAIL — `Failed to resolve import "./access-state"`.

- [ ] **Step 3: Write the minimal implementation**

Create `lib/boarding/access-state.ts`:

```ts
export type BoardingAccess = 'allowed' | 'choose' | 'denied';

export interface BoardingAccessInput {
  /** Holds tms.attendance.scan AND is assigned to at least one active route. */
  allowed: boolean;
  /** Active bus_required staff (the eligibility RPC's verdict). */
  eligible: boolean;
  /** Active tms_staff_route_assignment rows for this staffer. */
  assignedRouteCount: number;
  /** staff.transport_route_id resolves to an ACTIVE route. */
  hasRoute: boolean;
}

/**
 * What may this staffer see in the boarding portal?
 *
 *  - 'allowed' — the full portal.
 *  - 'choose'  — the in-charge willingness toggle (eligible, not yet assigned,
 *                and their staff-master route is usable).
 *  - 'denied'  — the blocked screen.
 *
 * `assignedRouteCount === 0` is required for 'choose' so an already-assigned
 * staffer whose role grant failed is denied rather than offered a toggle the
 * server would reject with 409. The layout's 'checking' state is NOT modelled
 * here: it means "the fetch has not resolved yet", which is not a decision.
 */
export function deriveBoardingAccess(input: BoardingAccessInput): BoardingAccess {
  if (input.allowed) return 'allowed';
  if (input.eligible && input.assignedRouteCount === 0 && input.hasRoute) return 'choose';
  return 'denied';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/boarding/access-state.test.ts`

Expected: PASS — `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/access-state.ts lib/boarding/access-state.test.ts
git commit -m "$(cat <<'EOF'
feat(boarding): pure deriveBoardingAccess helper for the portal gate

Extracts the layout's four-way access branch so it can be tested,
including the assigned-but-no-permission case that would otherwise
only surface in production.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migration — the eligibility RPC resolves the staffer's own route

This is a live change to a function `proxy.ts` calls on every boarding login, so it lands on its own and is verified before any code depends on it. It is purely additive: `eligible` and `assigned_route_count` keep their exact meaning, so the currently-deployed code keeps working.

**Files:**
- Create: `supabase/migrations/20260716120000_staff_incharge_route_from_master.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `public.tms_staff_boarding_eligibility(p_profile_id uuid) → jsonb` now returning four keys:
  `{ eligible: boolean, assigned_route_count: int, route_id: uuid|null, has_route: boolean }`.
  Task 3 reads `route_id` and `has_route`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260716120000_staff_incharge_route_from_master.sql`:

```sql
-- Staff bus in-charge: the route comes from the STAFF MASTER, not from the client.
--
-- Previously /api/boarding/self-assign took routeId from the request body and only
-- checked that the route was active -- never that it was the caller's own route, so
-- any eligible staffer could make themselves in-charge of any bus in the fleet.
-- Resolving the route here lets that parameter be deleted entirely.
--
-- ADDITIVE ONLY: `eligible` and `assigned_route_count` keep their exact meaning, so
-- proxy.ts / the OAuth callback / the boarding APIs all keep working mid-deploy.
--
-- `eligible` deliberately does NOT require a route: proxy must still admit a
-- route-less staffer so they land on the denied screen INSIDE the boarding portal,
-- rather than being bounced to some other area's home.

CREATE OR REPLACE FUNCTION public.tms_staff_boarding_eligibility(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email    text;
  v_eligible boolean := false;
  v_count    int := 0;
  v_route_id uuid;
BEGIN
  SELECT lower(email) INTO v_email FROM profiles WHERE id = p_profile_id LIMIT 1;
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'assigned_route_count', 0,
                              'route_id', NULL, 'has_route', false);
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

  -- The staffer's OWN route, allocated by an admin in the staff module. The `staff`
  -- table is MyJKKN-owned and read-only for TMS -- this only ever reads it.
  SELECT s.transport_route_id INTO v_route_id
  FROM staff s
  WHERE coalesce(s.bus_required, false) = true
    AND coalesce(s.is_active, false) = true
    AND (lower(s.email) = v_email OR lower(s.institution_email) = v_email)
  LIMIT 1;

  -- Surface it only if it still resolves to an ACTIVE route. SELECT INTO with no
  -- matching row sets the target to NULL, which is exactly the "unusable" signal.
  IF v_route_id IS NOT NULL THEN
    SELECT r.id INTO v_route_id FROM tms_route r
    WHERE r.id = v_route_id AND r.status = 'active';
  END IF;

  RETURN jsonb_build_object(
    'eligible', v_eligible,
    'assigned_route_count', v_count,
    'route_id', v_route_id,
    'has_route', (v_route_id IS NOT NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.tms_staff_boarding_eligibility(uuid)
  TO authenticated, service_role;
```

- [ ] **Step 2: Apply the migration to the live database**

Use the Supabase MCP tool `mcp__supabase__apply_migration` with:
- `name`: `staff_incharge_route_from_master`
- `query`: the full SQL above.

Expected: success with no error.

- [ ] **Step 3: Verify the RPC against real staff rows**

Use `mcp__supabase__execute_sql`:

```sql
select p.email, public.tms_staff_boarding_eligibility(p.id) as elig
from profiles p
join staff s
  on (lower(s.email) = lower(p.email) or lower(s.institution_email) = lower(p.email))
where s.bus_required = true and s.is_active = true
limit 3;
```

Expected: each `elig` is a jsonb object containing all four keys, with
`"eligible": true`, `"has_route": true`, and a non-null `"route_id"`. If `has_route`
is false for every row, the route lookup or the `status = 'active'` filter is wrong —
stop and investigate rather than continuing.

- [ ] **Step 4: Verify the original keys are unchanged**

Use `mcp__supabase__execute_sql`:

```sql
select public.tms_staff_boarding_eligibility('00000000-0000-0000-0000-000000000000'::uuid) as no_profile;
```

Expected: `{"eligible": false, "assigned_route_count": 0, "route_id": null, "has_route": false}` —
proving the no-profile path still fails closed.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260716120000_staff_incharge_route_from_master.sql
git commit -m "$(cat <<'EOF'
feat(boarding): eligibility RPC resolves the staffer's own route

Additive: adds route_id + has_route from staff.transport_route_id
(only when it resolves to an active tms_route). Existing keys keep
their meaning so the deployed code works mid-deploy.

This lets self-assign stop taking routeId from the client.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Surface `routeId` / `hasRoute` through the eligibility lib and access API

**Files:**
- Modify: `lib/boarding/eligibility.ts` (whole file)
- Modify: `app/api/boarding/access/route.ts` (the `getAccess` function)

**Interfaces:**
- Consumes: the RPC's `route_id` / `has_route` keys from Task 2.
- Produces:
  - `StaffBoardingEligibility { eligible: boolean; assignedRouteCount: number; routeId: string | null; hasRoute: boolean }` — Task 4 reads `.routeId`.
  - `GET /api/boarding/access` → `{ success: true, data: { allowed, assignedRouteCount, eligible, hasRoute } }` — Task 6 reads `hasRoute`. `routeId` is deliberately NOT published.

- [ ] **Step 1: Update the eligibility contract**

Replace the whole of `lib/boarding/eligibility.ts` with:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface StaffBoardingEligibility {
  eligible: boolean;
  assignedRouteCount: number;
  /**
   * The staffer's OWN route from the staff master, set only when
   * staff.transport_route_id resolves to an ACTIVE route. Server-side use only —
   * never publish this to the browser; the client has no need for it and must not
   * be able to name a route (see /api/boarding/self-assign).
   */
  routeId: string | null;
  hasRoute: boolean;
}

/**
 * Is this authenticated user an active bus_required staff member, how many active
 * route assignments do they already have, and what is their own route? Wraps the
 * SECURITY DEFINER RPC so proxy.ts, the OAuth callback, and the boarding API routes
 * share one contract — including one implementation of the staff-email match.
 * Fail-closed: any error → not eligible, no route.
 */
export async function getStaffBoardingEligibility(
  supabase: SupabaseClient,
  profileId: string
): Promise<StaffBoardingEligibility> {
  try {
    const { data } = await supabase.rpc('tms_staff_boarding_eligibility', { p_profile_id: profileId });
    const row = (data ?? {}) as {
      eligible?: boolean;
      assigned_route_count?: number;
      route_id?: string | null;
      has_route?: boolean;
    };
    return {
      eligible: !!row.eligible,
      assignedRouteCount: row.assigned_route_count ?? 0,
      routeId: row.route_id ?? null,
      hasRoute: !!row.has_route,
    };
  } catch {
    return { eligible: false, assignedRouteCount: 0, routeId: null, hasRoute: false };
  }
}
```

- [ ] **Step 2: Publish `hasRoute` from the access API**

In `app/api/boarding/access/route.ts`, make three edits inside `getAccess`.

The super-admin early return — replace:

```ts
      return NextResponse.json({ success: true, data: { allowed: true, assignedRouteCount: 0, eligible: false, superAdmin: true } });
```

with:

```ts
      return NextResponse.json({ success: true, data: { allowed: true, assignedRouteCount: 0, eligible: false, hasRoute: false, superAdmin: true } });
```

The main return — replace:

```ts
      data: { allowed: routeIds.length > 0, assignedRouteCount: elig.assignedRouteCount, eligible: elig.eligible },
```

with:

```ts
      // hasRoute lets the layout show the denied screen instead of offering a toggle
      // that cannot succeed. elig.routeId is deliberately NOT published — the client
      // has no use for it and must never be able to name a route.
      data: {
        allowed: routeIds.length > 0,
        assignedRouteCount: elig.assignedRouteCount,
        eligible: elig.eligible,
        hasRoute: elig.hasRoute,
      },
```

The fail-closed catch — replace:

```ts
    return NextResponse.json({ success: true, data: { allowed: false, assignedRouteCount: 0, eligible: false } });
```

with:

```ts
    return NextResponse.json({ success: true, data: { allowed: false, assignedRouteCount: 0, eligible: false, hasRoute: false } });
```

- [ ] **Step 3: Type-check the changed files**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "lib/boarding/eligibility|api/boarding/access" || echo "CLEAN"
```

Expected: `CLEAN`. (Unfiltered output will show ~828 pre-existing errors elsewhere — ignore them.)

- [ ] **Step 4: Commit**

```bash
git add lib/boarding/eligibility.ts app/api/boarding/access/route.ts
git commit -m "$(cat <<'EOF'
feat(boarding): eligibility contract gains routeId + hasRoute

The access API publishes hasRoute only; routeId stays server-side so
the client can never name a route.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Self-assign resolves the route server-side

This is the security fix: the `routeId` request parameter is deleted, not validated.

**Files:**
- Modify: `app/api/boarding/self-assign/route.ts` (whole file)

**Interfaces:**
- Consumes: `getStaffBoardingEligibility(...).routeId` from Task 3.
- Produces: `POST /api/boarding/self-assign` accepting **an empty body**. Returns
  `201 { success: true, message, assignment }` on success;
  `403` not eligible, `409` already assigned, `400` no route / no email, `500` otherwise.
  Task 5's page calls it.

- [ ] **Step 1: Rewrite the route**

Replace the whole of `app/api/boarding/self-assign/route.ts` with:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStaffBoardingEligibility } from '@/lib/boarding/eligibility';
import { grantBoardingRole } from '@/lib/boarding/roles';
import { logActivity } from '@/lib/activity/log';

/**
 * A bus_required staffer accepts the boarding in-charge duty.
 *
 * The route is NOT accepted from the client. It is resolved server-side from the
 * staff master (staff.transport_route_id, via the eligibility RPC), so a staffer can
 * only ever become in-charge of the bus they actually ride. This creates the
 * tms_staff_route_assignment (source='self') and grants the transport_boarding role,
 * after which the staffer flows through the exact gates an admin-assigned staffer
 * uses. One-time: a staffer with an existing active assignment is rejected.
 */
async function postSelfAssign(request: NextRequest, auth: AuthContext) {
  try {
    const svc = createServiceRoleClient();

    // The assignment key is the staffer's email (matches getAssignedRouteIdsForUser).
    const { data: prof } = await svc.from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    const email = ((prof as { email: string | null } | null)?.email ?? '').toLowerCase().trim();
    if (!email) {
      return NextResponse.json({ error: 'Your profile has no email on file' }, { status: 400 });
    }

    // Server-side authority: eligibility, the one-time guard, AND the route itself.
    const elig = await getStaffBoardingEligibility(auth.supabase, auth.userId);
    if (!elig.eligible) {
      return NextResponse.json({ error: 'You are not eligible to be a bus in-charge' }, { status: 403 });
    }
    if (elig.assignedRouteCount > 0) {
      return NextResponse.json(
        { error: 'You already have a route. Contact an admin to change it.' },
        { status: 409 }
      );
    }
    // Recomputed at confirm time, so a route deactivated since the page loaded is
    // caught here rather than assigned. The RPC already guarantees the route exists
    // and is active, so no separate tms_route lookup is needed.
    if (!elig.routeId) {
      return NextResponse.json(
        { error: 'Your route has not been allocated yet. Please contact an admin.' },
        { status: 400 }
      );
    }

    // ── PHASE 2 SEAM (staff fees) ──────────────────────────────────────────────
    // When staff transport fees exist, block here if this staffer is not cleared
    // (mirror the learner tms_student_transport_access gate). No-op in Phase 1.

    const { data: assignment, error } = await svc
      .from('tms_staff_route_assignment')
      .insert({
        staff_email: email,
        route_id: elig.routeId,
        assigned_by: auth.userId,
        source: 'self',
        is_active: true,
      })
      .select('*')
      .single();
    if (error) {
      // 23505 = the active (staff_email, route_id) unique index. Now that the route is
      // server-resolved, concurrent confirms resolve the SAME route — so this index,
      // not the check-then-act guard above, is what actually settles the race.
      if (error.code === '23505') {
        return NextResponse.json({ error: 'You already have this route.' }, { status: 409 });
      }
      console.error('self-assign insert error:', error);
      return NextResponse.json({ error: 'Failed to accept the in-charge duty' }, { status: 500 });
    }

    await grantBoardingRole(svc, email, auth.userId);
    await logActivity(auth, request, {
      module: 'staff-route-assignments',
      // ActivityAction has no distinct 'self-assign' value — reuse 'assign' (matches
      // the admin route's call shape) and carry source:'self' in metadata/description
      // instead, so this stays a same-shape drop-in with the existing action map.
      action: 'assign',
      entityType: 'tms_staff_route_assignment',
      entityId: (assignment as { id: string } | null)?.id,
      entityLabel: email,
      description: `${email} accepted bus in-charge for route ${elig.routeId}`,
      metadata: { staffEmail: email, routeId: elig.routeId, source: 'self' },
    });

    return NextResponse.json(
      { success: true, message: 'You are now the bus in-charge', assignment },
      { status: 201 }
    );
  } catch (e) {
    console.error('self-assign error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => postSelfAssign(request, auth));
```

- [ ] **Step 2: Verify the client can no longer name a route**

Run:

```bash
grep -n "routeId\|body" app/api/boarding/self-assign/route.ts | grep -v "elig.routeId\|metadata\|description"
```

Expected: no output. The route must not parse a request body or read a client `routeId`
anywhere. If anything prints, the parameter was not fully removed.

- [ ] **Step 3: Type-check the changed file**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "api/boarding/self-assign" || echo "CLEAN"
```

Expected: `CLEAN`.

- [ ] **Step 4: Commit**

```bash
git add app/api/boarding/self-assign/route.ts
git commit -m "$(cat <<'EOF'
fix(boarding): self-assign resolves the route server-side

Deletes the client-supplied routeId parameter. It was only validated
as 'active', never as the caller's own route, so any eligible staffer
could make themselves in-charge of any bus in the fleet and scan its
passengers.

Also makes the documented check-then-act race unreachable: concurrent
confirms now resolve the same route, so the existing active
(staff_email, route_id) unique index settles it with a 23505.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The willingness toggle page

**Files:**
- Create: `app/boarding/in-charge/page.tsx`

**Interfaces:**
- Consumes: `POST /api/boarding/self-assign` from Task 4; `useAuth()` from `@/providers/auth-provider` (destructures `signOut`).
- Produces: the page at `/boarding/in-charge`. Task 6 redirects to this path.

- [ ] **Step 1: Create the page**

Create `app/boarding/in-charge/page.tsx`. Per the spec the page shows NO route details —
only the fee-policy message and the toggle — so it needs no data fetch and no loading state.
The toggle markup reuses the house pattern from `app/(admin)/settings/page.tsx` (an
`sr-only peer` checkbox plus a styled div) in the boarding portal's green; there is no shared
`Switch` primitive in `components/ui`.

```tsx
'use client';

import { useState } from 'react';
import { Bus, Check, Loader2, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/providers/auth-provider';

/**
 * One-time willingness toggle for a bus_required staffer.
 *
 * Accepting auto-assigns their OWN route — the server resolves it from the staff
 * master, this page never names a route. Declining stores NOTHING: an active
 * tms_staff_route_assignment row IS "willing", so no row means "not willing (or
 * undecided)", and the toggle simply returns on the next login. That also means the
 * declined view must live HERE rather than in the layout, which still computes
 * 'choose' for a decliner.
 */
export default function InChargePage() {
  const { signOut } = useAuth();
  const [willing, setWilling] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!willing) {
      setDeclined(true);
      return;
    }
    setSaving(true);
    try {
      // No body: the server resolves the route from the staff master.
      const res = await fetch('/api/boarding/self-assign', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to set you as bus in-charge');
      toast.success('You are now the in-charge of your bus');
      // Hard nav: the boarding layout caches its 'access' decision in state keyed off
      // [loading, user, profile], so a soft router.replace() here would hit the
      // layout's stale 'choose' redirect and bounce back to this screen. A full page
      // load forces the layout to remount and recompute access fresh.
      window.location.assign('/boarding/attendance');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to set you as bus in-charge');
      setSaving(false);
    }
  };

  if (declined) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
          <Bus className="h-6 w-6 text-gray-400" />
        </div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Transport fees apply</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          You&apos;ve opted out of being a bus in-charge, so transport fees apply to your travel.
          Please contact the transport office.
        </p>
        <button
          onClick={() => signOut()}
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-green-600">
          <Bus className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Bus in-charge</h1>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <span className="font-semibold text-gray-900 dark:text-white">Willing to be the bus in-charge?</span>{' '}
          You will not pay transport fees.
        </p>
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
          <span className="font-semibold text-gray-900 dark:text-white">Not willing?</span>{' '}
          Transport fees apply.
        </p>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-5 dark:border-gray-800">
          <span className="min-w-0 text-sm font-medium text-gray-900 dark:text-white">
            I&apos;m willing to be the bus in-charge
          </span>
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              checked={willing}
              onChange={(e) => setWilling(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600 dark:bg-gray-700" />
          </label>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? 'Setting…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check the new file**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "boarding/in-charge" || echo "CLEAN"
```

Expected: `CLEAN`.

- [ ] **Step 3: Commit**

```bash
git add app/boarding/in-charge/page.tsx
git commit -m "$(cat <<'EOF'
feat(boarding): one-time bus in-charge willingness toggle

Shows the fee policy and a toggle, no route details. Accepting posts an
empty body (the server resolves the route); declining stores nothing and
just renders the opted-out message, so the toggle returns next login.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Rewire the layout and callback, delete the picker

Done last so the codebase never points at a page that doesn't exist yet.

**Files:**
- Modify: `app/boarding/layout.tsx`
- Modify: `app/auth/callback/route.ts`
- Delete: `app/boarding/select-route/page.tsx`
- Delete: `app/api/boarding/available-routes/route.ts`

**Interfaces:**
- Consumes: `deriveBoardingAccess` (Task 1), the `hasRoute` field of `GET /api/boarding/access` (Task 3), the page at `/boarding/in-charge` (Task 5).
- Produces: nothing downstream.

- [ ] **Step 1: Import the helper in the layout**

In `app/boarding/layout.tsx`, add after the `boardingNavigation` import:

```tsx
import { deriveBoardingAccess } from '@/lib/boarding/access-state';
```

- [ ] **Step 2: Rename the `select` state to `choose` and use the helper**

Replace:

```tsx
  const [access, setAccess] = useState<'checking' | 'allowed' | 'select' | 'denied'>('checking');
```

with:

```tsx
  const [access, setAccess] = useState<'checking' | 'allowed' | 'choose' | 'denied'>('checking');
```

Replace the body of the access `useEffect` — these three lines:

```tsx
        if (res.ok && d.allowed) setAccess('allowed');
        else if (res.ok && d.eligible) setAccess('select');
        else setAccess('denied');
```

with:

```tsx
        if (res.ok) {
          setAccess(deriveBoardingAccess({
            allowed: !!d.allowed,
            eligible: !!d.eligible,
            assignedRouteCount: d.assignedRouteCount ?? 0,
            hasRoute: !!d.hasRoute,
          }));
        } else setAccess('denied');
```

- [ ] **Step 3: Repoint the redirect**

Replace:

```tsx
  // Keep an unassigned-but-eligible staffer on the route picker.
  useEffect(() => {
    if (access === 'select' && pathname !== '/boarding/select-route') {
      router.replace('/boarding/select-route');
    }
  }, [access, pathname, router]);
```

with:

```tsx
  // Keep an undecided-but-eligible staffer on the in-charge toggle.
  useEffect(() => {
    if (access === 'choose' && pathname !== '/boarding/in-charge') {
      router.replace('/boarding/in-charge');
    }
  }, [access, pathname, router]);
```

- [ ] **Step 4: Rename the minimal-shell branch**

Replace:

```tsx
  if (access === 'select') {
```

with:

```tsx
  if (access === 'choose') {
```

- [ ] **Step 5: Repoint the post-login home**

In `app/auth/callback/route.ts`, replace:

```ts
    // Bus_required staff have no area permission until they pick a route. Admit
    // them via the eligibility oracle so they can reach /boarding/select-route.
```

with:

```ts
    // Bus_required staff have no area permission until they accept the in-charge
    // duty. Admit them via the eligibility oracle so they reach /boarding/in-charge.
```

and replace:

```ts
      else if (boardingEligible && staffAssignedCount === 0) home = '/boarding/select-route';
```

with:

```ts
      else if (boardingEligible && staffAssignedCount === 0) home = '/boarding/in-charge';
```

- [ ] **Step 6: Delete the picker page and its endpoint**

```bash
git rm app/boarding/select-route/page.tsx
git rm app/api/boarding/available-routes/route.ts
```

- [ ] **Step 7: Verify nothing still references the deleted files**

Run:

```bash
grep -rn "select-route\|available-routes" app lib components proxy.ts || echo "CLEAN"
```

Expected: `CLEAN`. (Matches under `docs/` are historical plan documents — those are fine and
should NOT be edited. If the grep prints anything from `app/`, `lib/`, `components/`, or
`proxy.ts`, a reference was missed.)

- [ ] **Step 8: Run the full unit suite**

Run: `npx vitest run`

Expected: all suites pass, including `lib/boarding/access-state.test.ts`.

- [ ] **Step 9: Type-check the changed files**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "boarding/layout|auth/callback" || echo "CLEAN"
```

Expected: `CLEAN`.

- [ ] **Step 10: Probe the routes on the dev server**

Start the dev server if it isn't running (`npm run dev`), then:

```bash
curl -s -o /dev/null -w "in-charge: %{http_code}\n" http://localhost:3000/boarding/in-charge
curl -s -o /dev/null -w "available-routes: %{http_code}\n" http://localhost:3000/api/boarding/available-routes
```

Expected: `in-charge: 307` (unauthenticated → redirected to login by proxy.ts, which proves
the route exists and is gated) and `available-routes: 404` (proving the deletion took effect).

- [ ] **Step 11: Commit**

```bash
git add app/boarding/layout.tsx app/auth/callback/route.ts
git commit -m "$(cat <<'EOF'
feat(boarding): route eligible staff to the in-charge toggle

Layout now derives access via deriveBoardingAccess, so an eligible
staffer whose staff-master route is missing or inactive gets the denied
screen instead of a toggle that cannot succeed.

Deletes the pick-any-route page and its available-routes endpoint (the
picker was its only consumer).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (must be done by the user)

The whole feature is auth-gated and the agent's Chrome is unauthenticated, so the end-to-end
flow **cannot** be verified headless. Ask the user to:

1. Log in as a `bus_required` staff member who has **no** active route assignment.
2. Confirm they land on `/boarding/in-charge` and see the message + toggle — **and no route details**.
3. Tap **Confirm** with the toggle **off** → the "Transport fees apply" screen appears.
4. Reload → the toggle is back (declining stored nothing).
5. Tap **Confirm** with the toggle **on** → they land in the boarding portal.
6. In the admin panel, open `/staff-route-assignments` → their row is listed with Source = **self**,
   and the route matches the one allocated to them in the staff module.
7. Log in again → they go straight to the portal, and the toggle does not reappear.

Do not claim the feature works until steps 1–7 have been confirmed by the user.
