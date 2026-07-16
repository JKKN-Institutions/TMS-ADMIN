# Staff bus in-charge — willingness toggle + auto-assign from the staff master

**Date:** 2026-07-16
**Status:** Design approved, ready for an implementation plan
**Base:** `origin/main` (the staff self-service in-charge work landed via PR #5 — verify with `git fetch && git merge-base --is-ancestor <sha> origin/main`, never against local `main`, which runs ~35 commits stale)

## Problem

A `bus_required` staff member who logs in today reaches `/boarding/select-route`, which lists
**every active route in the fleet** and lets them pick any one as the bus they are in-charge of.
Three things are wrong with that:

1. **It asks a question that is already answered.** All 107 `bus_required = true AND is_active = true`
   staff already have `staff.transport_route_id` (and `transport_stop_id`) populated by the admin in
   the staff module. The staffer's route is known; there is nothing to select.
2. **It is a privilege hole.** `POST /api/boarding/self-assign` takes `routeId` **from the client**
   and validates only that the route is `active` — never that it is the caller's own route. Any
   eligible staffer can make themselves in-charge of any bus in the fleet, gaining scanning and
   attendance powers over its passengers.
3. **It asks the wrong question.** The business rule is not "which bus?" but "will you take the
   in-charge duty?" — because serving as in-charge is what exempts a staffer from transport fees.

## What we are building

Replace the route picker with a **one-time willingness toggle**. The staffer sees no route details —
only the fee trade-off and a switch:

- **Willing to be bus in-charge** → they do not pay transport fees. Confirming auto-assigns
  *their own* route (from `staff.transport_route_id`) and opens the boarding portal. The assignment
  appears in the admin Staff Assignments module (`/staff-route-assignments`) with Source = `self`,
  through the existing plumbing.
- **Not willing** → transport fees apply. They get the existing blocked "contact an admin" screen.
  The answer is not stored; the toggle returns on their next login.

TMS never writes to the `staff` table — it is MyJKKN-owned and read-only here. The route is read
from the staff master and recorded only in `tms_staff_route_assignment`.

### Explicitly out of scope

**The transport-fee gate itself is NOT part of this feature.** Staff cannot be billed today: there
are zero `audience='staff'` fee structures, zero staff rows in `tms_fee_bill` (all 1,914 are
`person_type='learner'`), and `billing_student_bills.student_id` only accepts `learners_profiles`
— bill generation records staff as `status='staff_deferred'` with no money attached. Staff transport
fees will be specified as a separate feature. The two existing `PHASE 2 SEAM (staff fees)` comments
in `proxy.ts` and `app/api/boarding/self-assign/route.ts` stay exactly where they are.

Consequently the message on screen states the fee rule as **policy**, and no code enforces it yet.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Willingness storage | **None** (Approach A) | An active `tms_staff_route_assignment` row *is* "willing"; no row is "not willing / undecided". A stored `willing=false` would have no consumer, could contradict the assignment table, and would need syncing forever. |
| Decline reversibility | **Re-asked next login** | Only "yes" is one-time and final (it creates the assignment; only an admin can change it). "No" creates nothing, so an accidental tap costs one session, not a support ticket, and a staffer can opt in later. |
| Decline landing | **A blocked opted-out message, rendered by the toggle page itself** | No fees page is built now; the real one arrives with the staff-fees feature. It cannot be the layout's existing `denied` screen: because declining stores nothing, the layout still computes `choose`, so the blocked state has to live inside the page. Same spirit as the denied screen (blocked + contact + sign out), different component and copy. |
| Route source | `staff.transport_route_id`, resolved **server-side** | Deletes the client-supplied `routeId` parameter, so the privilege hole stops existing rather than gaining a check. |
| Missing/inactive route | **Denied screen, no toggle** | `bus_required` with no usable route means the admin has not finished allocating them. The existing denied copy ("Ask an admin to assign you to a route") already fits. Affects 0 staff today, but the column is nullable and routes can be deactivated. |
| Path | Rename `/boarding/select-route` → `/boarding/in-charge` | Nothing is selected anymore; the old name would lie. |

## Architecture

Nothing new is invented. The feature reuses the existing pipeline — assignment →
`transport_boarding` role → `/boarding` portal — and replaces one screen while deleting one
parameter and one endpoint.

### The access state machine

`app/boarding/layout.tsx` already fetches `/api/boarding/access` and switches on four states. The
states are unchanged; only the choice of one of them changes:

| Condition | State | Screen |
|---|---|---|
| Active assignment + `tms.attendance.scan` | `allowed` | Full boarding portal (unchanged) |
| Eligible, 0 assignments, `hasRoute` | `choose` | Message + toggle (new) |
| Eligible, 0 assignments, **no** `hasRoute` | `denied` | Existing "ask an admin" screen |
| Not eligible | `denied` | Same (unchanged) |

The missing-route case needs no new state and no new screen.

**Behaviour change to note:** a staffer who *has* an assignment but lacks the scan permission (a
failed role grant) currently sees a "your route is set" locked screen. Under this design they fall
to `denied`. That is rarer and more honest — they genuinely cannot use the portal and an admin must
intervene — but the message they see changes.

### Why the RPC returns `route_id` but the API does not

The staff-email match (`lower(email) = ? OR lower(institution_email) = ?`) already lives inside
`tms_staff_boarding_eligibility`. Resolving the route with separate service-role SQL in the API
would duplicate that rule and let it drift. Extending the RPC keeps **one** implementation; the API
layer then decides what to expose:

- `POST /api/boarding/self-assign` consumes `routeId` **server-side only**.
- `GET /api/boarding/access` publishes only the `hasRoute` boolean to the browser.

## The screen (`/boarding/in-charge`)

One card. No route details, no bus list, no loading state for route data.

```
                    🚌  Bus in-charge

    Willing to be the bus in-charge?  You will not pay
    transport fees.

    Not willing?  Transport fees apply.

    [ ●——  ]  I'm willing to be the bus in-charge

                              [  Confirm  ]
```

A toggle **plus a Confirm button**, not a bare toggle: a switch alone cannot express "no", and
Confirm makes declining a deliberate act rather than an accidental non-action.

- Confirm with the toggle **on** → assign, then hard-navigate to `/boarding/attendance`.
- Confirm with the toggle **off** → no network call; the page renders the opted-out message
  ("Transport fees will apply — please contact the transport office") with a sign-out button.

There is no shared `Switch` primitive in `components/ui`. Reuse the house pattern from
`app/(admin)/settings/page.tsx` — an `sr-only peer` checkbox plus a styled div — in the boarding
portal's green rather than the admin blue.

## Data flow

### Saying yes

1. Login → `/auth/callback` sees eligible + 0 assignments → home = `/boarding/in-charge`.
2. `proxy.ts` admits them to the boarding area via the eligibility RPC (unchanged).
3. Layout → `GET /api/boarding/access` → `{allowed:false, eligible:true, assignedRouteCount:0, hasRoute:true}` → `choose`.
4. Toggle on + Confirm → `POST /api/boarding/self-assign` with **an empty body**.
5. Server re-runs the RPC as its own authority:
   - not eligible → **403**
   - `assignedRouteCount > 0` → **409**
   - `routeId` null → **400** ("your route hasn't been allocated yet")
6. Insert `tms_staff_route_assignment {staff_email, route_id, source:'self', is_active:true, assigned_by}`.
   A `23505` from the active `(staff_email, route_id)` unique index → **409**.
7. `grantBoardingRole` (best-effort, never fails the assignment) → `logActivity`
   (module `staff-route-assignments`, action `assign`, `metadata.source = 'self'`).
8. **201** → client calls `window.location.assign('/boarding/attendance')`.

Step 8 must stay a **hard** navigation. The layout caches its access decision in `useState` keyed on
`[loading, user, profile]`, so a soft `router.replace` hits the stale `choose` and bounces the
staffer back to the toggle they just answered. Keep the existing explanatory comment.

### Saying no

Toggle off + Confirm → **no network call**. The page flips a local flag and renders the opted-out
message. A refresh or the next login restores the toggle. Nothing is stored, so nothing can drift
and nothing needs cleaning up.

## Failure handling

Fail-closed throughout, matching the existing code:

- Any RPC error is caught in `getStaffBoardingEligibility` → `eligible:false` → denied screen.
- `/api/boarding/access` throwing → `{allowed:false, eligible:false}` → denied.
- `hasRoute:false` → the layout shows denied and never offers the toggle; `self-assign` **also**
  400s on a null `routeId`, because the API cannot trust the client.
- A route deactivated between page load and Confirm → the RPC recomputes at confirm time →
  `routeId` null → 400 with a clear toast, rather than assigning a dead route.

**A known race becomes unreachable.** The existing one-time guard is check-then-act, and the
documented gotcha is that two concurrent self-assigns **to different routes** could both pass (the
partial unique index is on active `(staff_email, route_id)`, so different routes do not collide).
With the route resolved server-side from the staff master, both concurrent requests resolve the
**same** route and the existing index catches the second with `23505` → 409. The race is not
mitigated; removing the client parameter makes it impossible.

## Change set

**Migration (1, applied live as its own step before the code lands)**

- `supabase/migrations/20260716HHMMSS_staff_incharge_route_from_master.sql` —
  `CREATE OR REPLACE FUNCTION public.tms_staff_boarding_eligibility(uuid)` adding `route_id` and
  `has_route` to the returned jsonb. `route_id` is surfaced only when `staff.transport_route_id`
  resolves to an `active` `tms_route`; `has_route` is `route_id IS NOT NULL`.

  Purely **additive** — every existing key keeps its meaning, so `proxy.ts` and the current code
  keep working mid-deploy. It is nonetheless a live change to a function on an auth-critical login
  path, so it is applied and verified independently.

  `eligible` keeps its current meaning (`bus_required` + `is_active`), deliberately **not**
  including `has_route` — proxy must still admit a route-less staffer so they can reach the denied
  screen inside the portal rather than being bounced elsewhere.

**Edited (5)**

| File | Change |
|---|---|
| `lib/boarding/eligibility.ts` | Contract gains `routeId: string \| null` and `hasRoute: boolean` |
| `app/api/boarding/access/route.ts` | Returns `hasRoute`; deliberately **not** `routeId` |
| `app/api/boarding/self-assign/route.ts` | Drops the `routeId` body param; uses the RPC's `routeId`; keeps the PHASE 2 SEAM comment |
| `app/boarding/layout.tsx` | `choose` only when `eligible && assignedRouteCount === 0 && hasRoute`; redirect to `/boarding/in-charge` |
| `app/auth/callback/route.ts` | Post-login home → `/boarding/in-charge` |

**New (2)**

- `app/boarding/in-charge/page.tsx` — the screen above.
- `lib/boarding/access-state.ts` + `lib/boarding/access-state.test.ts` — a pure
  `deriveBoardingAccess({allowed, eligible, assignedRouteCount, hasRoute})` →
  `'allowed' | 'choose' | 'denied'`, consumed by the layout. The layout's fourth state,
  `'checking'`, stays layout-local — it means "the fetch has not resolved yet", not a decision, so
  it is not part of this function's domain.

**Deleted (2)**

- `app/boarding/select-route/page.tsx` — replaced.
- `app/api/boarding/available-routes/route.ts` — the picker was its only consumer (verified).

**Unchanged on purpose:** `proxy.ts` (including its PHASE 2 SEAM), `lib/boarding/roles.ts`,
`lib/boarding/identity.ts`, the Staff Assignments admin module (its `Source` column already badges
`self` vs `admin`), and `tms_staff_route_assignment`'s schema.

## Testing

Almost all of this feature is I/O — an RPC, an insert, a redirect — which is why the previous
session could only offer a manual smoke test. The one piece of real branching logic is extracted so
it can be tested properly.

- **vitest** on `deriveBoardingAccess`, covering all four states plus the assigned-but-no-permission
  case that would otherwise only surface in production. Project gotcha: the `@/` alias breaks
  vitest — import relatively.
- **tsc filtered to the changed files.** The repo carries ~828 pre-existing `never`-type errors and
  `next.config` sets `typescript.ignoreBuildErrors: true`, so an unfiltered run proves nothing.
- **curl probes:** `/boarding/in-charge` → 307 unauthenticated; `/api/boarding/available-routes` →
  404, confirming the deletion.
- **SQL check** via Supabase MCP that the replaced RPC returns `route_id` / `has_route` for a known
  `bus_required` staffer, and still returns the original keys unchanged.
- **User smoke test (required — cannot be done headless).** The agent's Chrome is unauthenticated
  and this is entirely an auth-gated flow. A `bus_required` staffer logs in → sees the message +
  toggle → confirms with it on → lands in the boarding portal → the row appears in
  `/staff-route-assignments` with Source = `self`.

## Follow-ups (not this feature)

- **Staff transport fees** — the gate, a staff billing target, and the `/boarding/fees` page. The
  PHASE 2 SEAM comments mark both hook points. Note that "who pays" stays derivable with no new
  column: a `bus_required` staffer with no active assignment pays.
- **Admin visibility of decliners** — deliberately not built (Approach A). If it turns out to matter
  once fees are real, it can be added as a table or an activity-log entry without unwinding
  anything here.
