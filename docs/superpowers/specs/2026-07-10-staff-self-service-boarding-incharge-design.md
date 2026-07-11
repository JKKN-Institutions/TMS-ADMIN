# Staff self-service boarding in-charge selection — Design

- **Date:** 2026-07-10
- **Branch:** feat/weekly-booking-window
- **Status:** Approved (brainstorming complete) → ready for implementation plan
- **Author:** Sangeetha V (with Claude)

## 1. Problem

Today, making a staff member a **bus in-charge** (boarding scanner) is a fully manual
admin action. In **Staff Route Assignments → Assign Route**
(`app/(admin)/staff-route-assignments/assign/page.tsx`), an admin searches for a
staff member, picks a route, and saves. That single `POST`
(`app/api/admin/staff-route-assignments/route.ts`) does two things at once:

1. inserts a `tms_staff_route_assignment` row (staff email ↔ route), and
2. grants the staff the `transport_boarding` custom role, which carries the
   `tms.attendance.scan` permission that unlocks the `/boarding` portal.

Until that assignment exists, the staff member sees nothing useful — the boarding
portal shows *"No route assigned — ask an admin"* (`app/boarding/layout.tsx`).

**We want to flip the pairing to self-service:** a bus-required staff member opens
the app, sees a "pick the bus you're in-charge of" screen, taps a route, and is
**auto-assigned** — no admin doing the pairing. It is the staff member's own
decision which bus they take charge of.

## 2. Decisions (confirmed with the user)

| Question | Decision |
|---|---|
| Who may self-select? | **Any active `bus_required` staff** (the flag set in Passengers → Staff). No per-person admin step. |
| Routes per staff | **Exactly one** (single-select). |
| In-charges per route | **Multiple allowed** — no new uniqueness constraint. |
| Self-switching | **Not allowed** — one-time pick; only an admin can change it afterwards. |
| Eligibility bridge | **Approach A** — a just-in-time SECURITY-DEFINER RPC is the authority; no role pre-granting, no sync. |
| Fees rule (eventual) | **Block until paid** — an unpaid staff member cannot select in-charge; unpaid → a staff fees page. |
| Fees scope now | **Decompose** — build selection now (Phase 1); staff billing + payment gate later (Phase 2). |

## 3. Current-state analysis (why the design is shaped this way)

- **Chicken-and-egg gate.** `proxy.ts` only lets a user into `/boarding` if they
  already hold `tms.attendance.scan` (`AREA_PERMISSION.boarding` in
  `lib/auth/areas.ts`). But that permission is granted *by* the very assignment we
  want to make self-service. So an unassigned staff member cannot reach a picker.
- **Login gate.** `app/auth/callback/route.ts` signs out anyone lacking one of four
  area permissions. `bus_required` is a flag on the MyJKKN-owned `staff` table, tied
  to no permission — so **a bus-required staff member currently cannot log into TMS
  at all** unless already assigned.
- **`staff` is read-only for TMS.** `lib/passengers/types.ts` documents that MyJKKN
  owns `staff`; TMS only reads it. So the chosen route can live **only** in TMS's own
  `tms_staff_route_assignment`, never in `staff.transport_route_id`.
- **Fees for staff don't exist yet.** `lib/fees/bills.ts` shows transport billing is
  ledger-driven (`tms_fee_bill` → `billing_student_bills`) for **learners**; **staff
  ledger rows are `staff_deferred` — no money row, no amount, no payment tracking.**
  The learner payment gate `tms_student_transport_access`
  (`supabase/migrations/20260613110000_*.sql`) has no staff data to read. Hence Phase 2.

The good news: the whole **assignment → role → portal** pipeline already exists. We
change *who* triggers it (staff, not admin) and add an *entry path* for eligible but
unassigned staff. Once a staff picks, they rejoin the exact code path an
admin-assigned staff already uses.

## 4. User journey (Phase 1)

```
Bus-required staff signs in with Google (JKKN SSO)
  │
  ▼ auth/callback: no area permission, but eligibility RPC → active bus_required staff
  ▼ lands on /boarding/select-route  (the only page reachable pre-assignment)
  │
  │ picks ONE bus  →  "I'm the in-charge of this bus"
  ▼ POST /api/boarding/self-assign
  │   • re-checks eligibility (server-side)
  │   • rejects if they already have an active assignment (one-time, no self-switch)
  │   • inserts tms_staff_route_assignment (source='self', assigned_by=self)
  │   • grants transport_boarding role → now holds tms.attendance.scan
  ▼ redirect to /boarding/scan — full portal, route details, roster, scan
  │
  ▼ returning later: /boarding/select-route shows a LOCKED state
      "You're the in-charge of Route 12. Contact an admin to change."
```

Admin's manual flow is untouched; removing a staff's assignment lets them pick again.

## 5. Phase 1 — detailed design

### 5.1 Migration (additive only)

`supabase/migrations/20260710120000_staff_self_service_boarding_incharge.sql`

```sql
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

Notes:
- Match on **both** `staff.email` and `staff.institution_email` — the Google login
  email may be either. `mapStaff` uses `email ?? institution_email` for the same reason.
- No new unique constraint (multiple in-charges per route is allowed). The existing
  active `(staff_email, route_id)` unique index remains the duplicate guard.
- "Exactly one route" + "no self-switch" are enforced in the API (§5.4), not the schema.

### 5.2 Shared refactor — `lib/boarding/roles.ts`

Extract `grantBoardingRole(supabase, staffEmail, assignedBy)` and
`maybeRevokeBoardingRole(supabase, assignmentId)` verbatim out of
`app/api/admin/staff-route-assignments/route.ts` into a new `lib/boarding/roles.ts`.
Import them in both the admin route and the new self-assign route so the role
plumbing lives in one place.

### 5.3 Gate changes

**`app/auth/callback/route.ts`** — after the `AREA_KEYS` loop, if `!hasAnyTms` and
not super admin, call the eligibility RPC. If `eligible`, set `hasAnyTms = true` and
remember `boardingEligible`. When computing `home` with no explicit `redirect`:
- if `canScan` → `/boarding/scan` (existing),
- else if `boardingEligible` (and `assigned_route_count === 0`) → `/boarding/select-route`.

**`proxy.ts`** — in the area-gate **deny** branch only, and only for `area === 'boarding'`:
call the eligibility RPC; if `eligible`, treat as `hasAccess = true` (let the request
proceed to header-stamping/forward instead of redirecting). The hot path
(already-assigned staff who hold `tms.attendance.scan`) never reaches this RPC.

```ts
if (!profile.is_super_admin && !areaExempt) {
  let hasAccess = areaPermRes.data;
  // Staff self-service: a bus_required staff without the scan permission may still
  // enter the boarding area to PICK a route. JIT eligibility, paid only on the
  // boarding deny path (pre-assignment window; rare).
  if (!hasAccess && area === 'boarding') {
    const { data: elig } = await supabase.rpc('tms_staff_boarding_eligibility',
      { p_profile_id: user.id });
    if ((elig as { eligible?: boolean } | null)?.eligible) hasAccess = true;
  }
  if (!hasAccess) { /* ...existing redirect-to-home... */ }
}

// ── PHASE 2 SEAM (staff fees) ────────────────────────────────────────────────
// Symmetric to the learner gate (5b below): after the boarding area gate, an
// eligible staff whose fees are NOT cleared will be redirected to /boarding/fees.
// Not implemented in Phase 1 (no staff bills exist). Insert here.
```

**`app/api/boarding/access/route.ts`** — additionally return `eligible` so the layout
can branch in a single call. Compute it from the RPC regardless of the scan
permission (an eligible-unassigned staff lacks the permission but must still get
`eligible: true`). Response becomes `{ allowed, assignedRouteCount, eligible }`.

### 5.4 New API endpoints

**`GET /api/boarding/available-routes`** — active routes for the picker. Access:
super admin, OR holds `tms.attendance.scan`, OR eligibility RPC says `eligible`.
Returns a lightweight list from `tms_route WHERE status='active'`:
`{ id, route_number, route_name, start_location, end_location, departure_time,
arrival_time, total_capacity, current_passengers }`. (Reuse `loadRouteDetails` only
if the picker needs stops/driver; a flat select is enough for card summaries.)

**`POST /api/boarding/self-assign`** `{ routeId }` — the self-service write:
1. Resolve the caller's profile email.
2. `elig = tms_staff_boarding_eligibility(profileId)`; if `!elig.eligible` → **403**.
3. If `elig.assigned_route_count > 0` → **409** *"You already have a route. Contact an
   admin to change it."* (enforces one-route + no-self-switch).
4. **PHASE 2 SEAM:** fees precondition — when staff fees exist, block here if not
   cleared. No-op in Phase 1.
5. Validate the route exists and is `active` (`404`/`400` otherwise).
6. Insert `tms_staff_route_assignment { staff_email, route_id, assigned_by: userId,
   source: 'self', is_active: true }` via the service-role client.
7. `grantBoardingRole(svc, email, userId)` (shared lib).
8. `logActivity({ module: 'staff-route-assignments', action: 'self-assign',
   entityType: 'tms_staff_route_assignment', entityId, entityLabel: email })`.
9. Return `{ success: true }`.

The existing active `(staff_email, route_id)` unique index is the last-line
duplicate/double-submit guard.

### 5.5 UI

**`app/boarding/select-route/page.tsx`** (new, client):
- Fetches `/api/boarding/available-routes`.
- Heading + route cards; **single-select**; a confirm button ("I'm the in-charge of
  this bus"). On success → toast → `router.replace('/boarding/scan')`.
- If the access check reports an existing assignment, render a **locked** card:
  "You're the in-charge of {route}. Contact an admin to change." (no picker).

**`app/boarding/layout.tsx`** — access state becomes
`'checking' | 'allowed' | 'select' | 'denied'`, derived from `/api/boarding/access`:
- `allowed` (assignment exists / super admin) → normal portal (today's behavior).
- `select` (`!allowed && eligible`) → render a **minimal shell** (brand + sign-out)
  around `children`, and `router.replace('/boarding/select-route')` if the user is on
  any other `/boarding/*` path. No scanner sidebar/bottom-nav for an unassigned user.
- `denied` (`!allowed && !eligible`) → today's "No route assigned" dead-end.

**`app/(admin)/staff-route-assignments/columns.tsx`** — add a **Source** badge column
(`self` → "Self-selected", `admin` → "Admin"); add `source` to `AssignmentRow`. The
GET already returns `select('*')`, so `source` is present with no API change.

### 5.6 Security model

- Self-assign **re-verifies eligibility server-side** via the SECURITY-DEFINER RPC —
  a crafted request cannot forge `bus_required`.
- One-route + no-self-switch enforced by the `assigned_route_count > 0` → 409 guard.
- **Scanning still requires a real assignment** — `getAssignedRouteIdsForUser`
  (`lib/boarding/identity.ts`) is unchanged, so eligibility alone never lets anyone
  mark attendance.
- The picker/available-routes endpoint is gated by the same eligibility check.

### 5.7 Edge cases

- Google email ≠ directory email → RPC matches both `email` and `institution_email`.
- Staff later un-flagged `bus_required` → existing role/assignment persist until an
  admin removes them; only *new* picks are blocked (RPC returns `eligible:false`).
- Inactive/deleted route → self-assign validates `status='active'`.
- Double submit / race → `assigned_route_count` guard + active unique index.
- Super admin → bypasses all gates (unchanged).

## 6. Phase 2 — staff fees + "block until paid" (separate spec, later)

Out of scope for this spec; captured so the seams above have a destination:
- Build the **staff money side**: real staff bills (amount, due date, payment) — decide
  whether to extend `billing_student_bills` or add a staff-specific money row, and
  generate amounts from the existing staff-audience fee structures.
- Add RPC `tms_staff_transport_access(profile_id)` mirroring the learner gate.
- Add a `/boarding/fees` page (staff analog of `/student/fees`).
- Fill the two **Phase 2 seams**: `proxy.ts` (redirect unpaid eligible staff to
  `/boarding/fees`) and `POST /api/boarding/self-assign` (block unpaid before insert).
- Consider re-blocking a staff who self-assigned and later goes overdue.

## 7. Out of scope (YAGNI)

Multi-route in-charge, staff self-switching, an approval workflow, writes to the
MyJKKN `staff` table, a general staff *passenger* portal, per-stop selection.

## 8. File change list (Phase 1)

**New**
- `supabase/migrations/20260710120000_staff_self_service_boarding_incharge.sql`
- `lib/boarding/roles.ts`
- `app/api/boarding/available-routes/route.ts`
- `app/api/boarding/self-assign/route.ts`
- `app/boarding/select-route/page.tsx`

**Edited**
- `app/api/admin/staff-route-assignments/route.ts` (use shared roles lib; `source='admin'`)
- `app/api/boarding/access/route.ts` (return `eligible`)
- `app/auth/callback/route.ts` (eligibility → login + land on select-route)
- `proxy.ts` (boarding deny branch: allow eligible; Phase 2 fees seam comment)
- `app/boarding/layout.tsx` (`select` state + minimal shell)
- `app/(admin)/staff-route-assignments/columns.tsx` (Source badge)

## 9. Verification plan

- **Types:** `tsc` filtered to the changed files (project ESLint is broken — do not
  rely on `npm run lint`).
- **DB (Supabase MCP):** apply the migration; seed one `staff` row with
  `bus_required=true, is_active=true` whose email matches a loginable `profiles` row;
  confirm `tms_staff_boarding_eligibility` returns `eligible:true, assigned_route_count:0`;
  after a self-assign, confirm the row (`source='self'`), the `transport_boarding` role
  grant, and that a second self-assign returns 409.
- **Route probes:** unauthenticated `GET /boarding/select-route`,
  `/api/boarding/self-assign` → 307/401 (agent Chrome is unauthenticated).
- **Manual smoke (user):** login as the seeded staff → lands on `/boarding/select-route`
  → pick a route → arrives in the boarding portal with route details → revisiting the
  picker shows the locked state. (Auth-gated flows can't be verified headless.)
