# Bulk Staff Route Assignment (multi-staff in-charge) — Design

**Date:** 2026-07-25
**Module:** Staff Route Assignments (`/staff-route-assignments`) × Boarding (in-charge identity)
**Status:** Approved — implementation not started
**Related:**
- `2026-07-16-staff-incharge-willingness-toggle-design.md` (the self-assign path this mirrors)
- `2026-07-24-multi-staff-attendance-billing-design.md` (consumes multi-in-charge routes downstream)

## The ask

Assign **many staff to their routes in one action**, instead of running the single-staff
`Assign Route` form once per person.

## Framing correction — multi-staff already works

Multiple staff per route is **not** blocked and never was. The unique index is scoped to the
*pair*:

```sql
uq_tms_sra_email_route_active ON (staff_email, route_id) WHERE is_active
```

It prevents the *same* person being assigned to the *same* route twice; any number of different
staff on one route is permitted. The live data already depends on this — **94 active assignments
across 22 routes**. The `2026-07-24` spec likewise treats multi-in-charge routes as established
fact.

**The real gap is admin UX**, in two places:

1. `app/(admin)/staff-route-assignments/assign/page.tsx` holds a single `selectedStaff`, fires one
   POST, and redirects (line 118). Putting N staff on a route means running the form N times.
2. The module has create + soft-delete only. There is no update path and no route-centric view.

## Current state (verified against the live DB, 2026-07-25)

| Fact | Value |
|---|---|
| Active assignments (`is_active`) | 94, across 22 routes |
| Inactive (soft-deleted) rows | 7 (101 total) |
| Assignment `source` split | 92 `self`, 2 `admin` |
| Active `bus_required` staff | 125 |
| …already assigned (matched on **either** email) | 94 |
| **…unassigned = bulk-assign candidates** | **31, across 18 routes** |
| …with no master route, or an inactive one | 0 |
| Candidates whose `profiles.email` ≠ `staff.email` | **8 of the 31** |
| Candidates with no `profiles` row (would hit the `staff.email` fallback) | 0 |
| Active assignments mapping to **no** staff row (either address) | 0 |
| `source` CHECK constraint | `source IN ('admin','self')` — no migration needed |
| Permission enforced by the existing POST | `tms.drivers.assign` (super-admin bypass) |

Candidate distribution: Route 29 THIRUPPUR 5; Routes 07 POOLAMPATTI and 39 ATHANI 3 each; Routes
15, 16, 32, 36, 40 two each; the remaining 10 routes one each.

> **Counting caveat that cost a wrong number once already.** An earlier pass matched assignments on
> `staff.email` alone and reported *61 candidates across 21 routes*. That was wrong: 28 staff
> self-assigned under their `profiles.email` and so looked unassigned. Matching on either address
> gives the true 31. Any query answering "who is unassigned" **must** check both.

## The identity rule (load-bearing)

`tms_staff_route_assignment` is keyed by a raw email string, and this system holds **two addresses
per person** (`staff.email` and `profiles.email`, frequently divergent — the same hazard
`lib/fees/generate.ts` already works around by matching both).

`tms_staff_boarding_eligibility(p_profile_id)` resolves identity as `lower(profiles.email)` and
counts existing assignments against it:

```sql
SELECT lower(email) INTO v_email FROM profiles WHERE id = p_profile_id;
...
SELECT count(*) INTO v_count
FROM tms_staff_route_assignment a
WHERE a.is_active = true AND lower(a.staff_email) = v_email;
```

**Therefore bulk assign writes `lower(profiles.email)`**, resolved via `staff.profile_id`, falling
back to `lower(staff.email)` only when no profile row exists.

Writing `staff.email` instead would, for the **8 divergent candidates** (and every future one — the
divergence rate across all assigned staff is far higher, 28 of 94): leave the one-time guard
(`assigned_route_count > 0`) reading **zero**, let the staffer self-assign afterwards, and slip past
the unique index (which compares literal strings) — producing **two active rows for one human on one
route**. Those rows would be double-counted in the "Staff Members" KPI, iterated twice by the
attendance-strike cron, and billed twice on removal.

## Design

One new API file and one new page. **No migration, no new permission, no change to the existing
single-assign form, the strike cron, or billing.**

### Endpoint — `app/api/admin/staff-route-assignments/bulk/route.ts`

**`GET`** — picker candidates. Active `bus_required` staff with **no** active assignment under
either address and whose master route is `status='active'`. Each row returns
`{ staffId, name, email, staffCode, routeId, routeNumber, routeName }` — enough for the client to
group without a second fetch.

**`POST`** — body is `{ staffIds: string[] }` **and nothing else**. The client can never name a
route; that is the safety property, and it mirrors `/api/boarding/self-assign`, which resolves the
route server-side so *"a staffer can only ever become in-charge of the bus they actually ride"*
(self-assign/route.ts:12-14). Note the existing admin POST does the opposite (takes `routeId` from
the body) — that path is deliberately left alone as the exception route (see Non-goals).

Auth: `withAuth` + the existing `requireAssign(auth)` helper — identical to the single POST.
Batches larger than **100** ids are rejected outright.

Per staff id, in order:

| Step | Outcome on failure |
|---|---|
| Load staff row; require `bus_required` and `is_active` | `skipped_not_eligible` |
| Resolve email: `profiles.email` via `profile_id`, else `staff.email` | `skipped_no_email` |
| Resolve `staff.transport_route_id`; require `tms_route.status='active'` | `skipped_no_route` / `skipped_route_inactive` |
| Require no active assignment under that email (any route) | `skipped_already_assigned` |
| Insert `{staff_email, route_id, assigned_by, source:'admin', is_active:true}` | `23505` → `skipped_already_assigned` |
| `grantBoardingRole(svc, email, auth.userId)` | best-effort; reported, does not fail the row |
| `logActivity` — module `staff-route-assignments`, action `assign`, `metadata.source='admin_bulk'` | best-effort |

Response shape:

```json
{ "success": true,
  "summary": { "assigned": 5, "skipped": 2, "errors": 0 },
  "results": [ { "staffId": "…", "name": "…", "email": "…",
                 "routeId": "…", "routeLabel": "29 - THIRUPPUR",
                 "outcome": "assigned" } ] }
```

**One bad row never fails the batch.** Hard failures are limited to auth and a malformed body.

This enforces **one active route per staffer**, matching self-assign's `assignedRouteCount > 0`
guard. Bulk assign adds people to routes; it does not give an already-assigned person a second
route.

### UI — `app/(admin)/staff-route-assignments/bulk-assign/page.tsx`

`DetailPageHeader` breadcrumbs (same shell as the assign page), a search box filtering
name/email/route, then candidates grouped under their master route, sorted by count descending then
route number, each group with a count and a **select all**:

```
Bulk Assign In-Charges                    31 waiting
▾ 29 - THIRUPPUR             5   [select all]
▾ 07 - POOLAMPATTI           3   [select all]
▾ 39 - ATHANI (KAALIPATTI)   3   [select all]
…
     7 selected across 3 routes      [ Assign all ]
```

The route on each row is **displayed, not chosen**. A **Bulk Assign** button goes on the list page
beside *Assign Route*, gated by the same `canManage`. On success: render the summary (assigned, and
each skip with its reason), invalidate the `['staff-route-assignments']` query key so the KPI cards
and table refresh, then return to the list.

### Testing

Two pure helpers are extracted so they unit-test without a Supabase client:

- the **candidate predicate** — either-email matching, `bus_required`, active staff, active route;
- the **outcome partitioner** — results array → `{assigned, skipped, errors}` summary.

Cases: profile-email preferred; fallback to `staff.email` when no profile; a candidate already
assigned under the *other* address is excluded; inactive master route excluded; and **idempotency** —
re-POSTing the same ids inserts zero rows and reports every one as `skipped_already_assigned`.

## Non-goals (explicit)

- **A per-route roster edit screen** (open a route, add/remove its staff in place). Considered and
  deferred; this spec covers bulk *create* only.
- **Changing the single-assign form.** It stays as the exception path — for assigning a monitor to a
  bus they don't ride, and for an email outside the `bus_required` staff set (every *active*
  assignment today resolves to a staff member, but the soft-deleted `kalaivanicse6@gmail.com` row
  shows the capability has been used).
- **Back-filling the 28 assignments recorded under a `profiles.email` that differs from
  `staff.email`.** Out of scope; they are valid assignments and resolve correctly under the
  either-address rule.
- **Replacing the `tms.drivers.assign` permission** that gates staff assignment. It is an odd fit but
  changing it is a separate, wider decision.
- **Anything in the attendance-strike or fee-billing path.**

## Risks & edge cases

- **Bulk assignment arms the strike cron for 31 more people.** Every new in-charge immediately
  becomes subject to `/api/cron/incharge-attendance`, which at threshold removes the role *and*
  bills them. Assign in batches and inspect `?dryRun=1` before the next armed run.
- **Race with self-assign.** A staffer may accept the duty between `GET` candidates and `POST`. The
  unique index settles it; the row is reported `skipped_already_assigned`, not an error.
- **`grantBoardingRole` is best-effort in both existing paths** and stays so here — but a failure
  means an assigned staffer who cannot enter `/boarding`. It is surfaced per row rather than
  swallowed.
- **Candidate count is live.** 31 today; it shrinks as staff self-assign. The screen must render an
  empty state rather than look broken when it reaches zero.

## Verification

`npm run lint` crashes (circular config) and full `tsc` is chronically red without gating
`next build`; neither is a regression gate.

1. `npx vitest run` — the new pure-helper tests above; existing suites stay green.
2. Path-scoped `npx tsc --noEmit` over the changed files → zero lines.
3. `curl` the new route unauthenticated → `401` (confirms `withAuth` gating).
4. Live check after the first real batch: the selected staff appear in the list with `source='admin'`,
   the KPI cards move by exactly the number assigned, and re-running the same batch assigns nobody.
