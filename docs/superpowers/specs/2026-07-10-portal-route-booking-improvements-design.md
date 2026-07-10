# Portal route / booking improvements — Design

**Date:** 2026-07-10
**Status:** Approved (design); pending implementation plan
**Author:** pairing session

## Problem

Four cross-portal gaps were reported:

1. **Route module doesn't show travel time / distance / fare** in the portals.
2. **Boarding portal doesn't surface today's booking list**, and there's no
   click-a-student → open-the-scanner flow.
3. **Driver portal doesn't show the students who booked** (it shows the static
   route allocation instead).
4. **Student route module doesn't list the boarding staff** for the route.

### Findings from codebase + live-DB analysis

- **Route fields already render** in student / driver / boarding portals and the admin
  route **detail** page. They look blank/zero because of **empty source data + one parse bug**:
  - `tms_route.distance = 0.00` for 23 of 24 routes; `tms_route.fare = 0.00` for 23 of 24
    (only route "01" has real values). Confirmed against the live DB.
  - `tms_route.duration` is **free text** (`"1h 25m"`), but `app/student/routes/page.tsx`
    and `components/routes/route-ticket.tsx` parse it as **minutes** (`Math.floor(mins/60)`)
    → `NaN` → blank. The driver card renders it raw, so it only works there.
  - The admin **list** table (`app/(admin)/routes/columns.tsx`) omits these three columns.
- **Boarding** already has a today-scoped roster at `/boarding/routes/[routeId]` reading
  `tms_booking` by route+date, and a working QR scanner at `/boarding/scan`. But the
  **dashboard** shows no booking list, and clicking a roster student opens a read-only
  Dialog — not the scanner. 78 bookings exist for today (data is real).
- **Driver** reads `tms_booking` nowhere; `/driver/passengers` is the static allocation.
  An **approved design** for the missing view already exists:
  `docs/superpowers/specs/2026-07-08-booked-students-portal-visibility-design.md`.
- **Boarding staff** = per-route supervisors in `tms_staff_route_assignment`
  (`staff_email` → `route_id`, `is_active`), holding the `transport_boarding` role.
  The student route page shows only the Driver name today.

## Decisions (confirmed with user)

1. **Fare source:** the **student** route view shows the learner's own
   `learners_profiles.transport_fee` (the real amount paid). Driver / boarding / admin
   keep `tms_route.fare`.
2. **Route data:** **display fix only** — fix the duration parse and hide distance/fare
   gracefully when empty. The user populates distance/fare via the existing admin form later.
3. **Boarding UX:** add a **"Today's Bookings"** list to the boarding **dashboard**
   (grouped by stop); clicking a student opens `/boarding/scan` pre-loaded to mark them.
4. **Boarding staff:** the **route supervisors** from `tms_staff_route_assignment`.

## Scope

- Feature 1 — route fare/distance/travel-time across student, driver, boarding, admin (detail + list).
- Feature 2 — boarding dashboard today's-bookings list → click-to-scan.
- Feature 3 — driver `/driver/boardings` booked-students view (per the 2026-07-08 spec).
- Feature 4 — boarding-staff names on the student route page.
- One shared helper `lib/booking/roster.ts` powering features 2 and 3.

## Non-goals (YAGNI)

- **No database migration and no new permissions.** Everything reuses `tms_booking`,
  `tms_attendance`, `tms_staff_route_assignment` and existing perms
  (`tms.attendance.scan`, `tms.attendance.manage`, `tms.driver.self_view`).
- No bulk import / data-entry tooling for route distance & fare (decision 2).
- No driver attendance marking (boarding staff do that); driver view stays read-only.
- No admin-manifest refactor / deep-link from the 2026-07-08 doc (deferred; out of scope now).
- No new pass table or change to the HMAC pass scheme.

## Data model (existing — unchanged)

```
tms_route(distance numeric, duration text, fare numeric, ...)        -- duration is TEXT
tms_booking  PK(learner_id, travel_date)                            -- presence = booked; cancel = DELETE
  route_id uuid, stop_id uuid, booked_at, booked_by
  index (route_id, travel_date) INCLUDE (learner_id, stop_id)
tms_attendance(learner_id, route_id, stop_id, trip_date, direction, status,
               method, is_walk_up, scanned_by, scanned_at)          -- unique (learner_id, trip_date, direction)
tms_staff_route_assignment(staff_email, route_id, is_active, ...)   -- boarding supervisors, keyed by email
learners_profiles(transport_route_id, transport_stop_id, transport_fee, bus_required)
```

"Today" = `istToday()` (IST +05:30) from `lib/booking/window.ts` — used for all new code
(avoids the UTC-slice date drift in some older boarding endpoints).

## Components

### 0. `lib/booking/roster.ts` (new) — shared roster helper

- `loadBookedRoster(svc, routeId, date)` → `{ counts: { booked, capacity }, riders }`
  where `riders: Array<{ learner_id; name; roll; stop_id }>`.
  - Reads `tms_booking` filtered by `route_id` + `travel_date`.
  - Resolves learner `name`/`roll` from `learners_profiles` (chunked `.in()`, ≤150 ids — per
    the large-`.in()` gateway-limit memory).
  - Reuses `bookedCount` + `routeCapacity` from `lib/booking/repo.ts` for `counts`.
  - `42P01`-safe (empty roster + zero counts if the table is absent).
- `groupRosterByStop(riders, orderedStops)` → **pure, unit-tested**. `orderedStops` is the
  route's stop sequence `[{ id, name, time, order }]`. Returns
  `[{ stop_id, stop_name, stop_time, count, riders }]` ordered by `order`, a trailing
  "Stop not set" bucket for `stop_id === null`, riders sorted by `roll` then `name`.

### Feature 1 — route fare / distance / travel-time

- **Duration:** treat `duration` as a display **string**. Remove the minutes math in
  `app/student/routes/page.tsx` (`fmtDuration`, ~lines 61-68, used ~line 286) and
  `components/routes/route-ticket.tsx` (`fmtDuration`, ~lines 24-31, used ~line 169); render
  the raw trimmed string, `—` when empty. Update the `duration` type to `string | null` in
  `lib/routes/detail.ts` and `app/api/student/route/route.ts` (they currently type it `number`).
- **Distance:** render `{n} km` only when `distance > 0`, else `—` (student page ~line 280,
  route-ticket ~line 168, driver card ~line 124, admin detail
  `app/(admin)/routes/[routeId]/page.tsx` ~line 187).
- **Fare — student view:** the student-route API (`app/api/student/route/route.ts`) already
  fetches the learner row; add `transport_fee` to its `select` and response, and render it as
  the "Fare" stat (`app/student/routes/page.tsx` ~line 274) as `₹{transport_fee}` (`—` when
  null/0). Driver / boarding / admin keep `route.fare`, shown only when `> 0`.
- **Admin list:** add **Distance**, **Duration**, **Fare** columns to
  `app/(admin)/routes/columns.tsx` (the `RouteRow` already carries the values and the list API
  selects `*`). Same empty-value guards.

### Feature 2 — boarding dashboard today's-bookings → scan

- **API** `GET /api/boarding/bookings-today?date=YYYY-MM-DD` (default `istToday()`):
  - `requirePerm(auth, tms.attendance.scan)`; routes from `getAssignedRouteIdsForUser(auth)`
    (`lib/boarding/identity.ts`) — the authority boundary.
  - For each assigned route: `loadBookedRoster` → `groupRosterByStop(riders, route.stops)`.
  - Response `{ success, data: { date, routes: [{ id, label, counts, stops:[{stop_id, stop_name, stop_time, count, riders:[{learner_id,name,roll}]}] }] } }`.
  - Empty-safe: no assignment → `{ routes: [] }`; no bookings → route with empty `stops`.
- **Dashboard** (`app/boarding/dashboard/page.tsx`): add a **"Today's Bookings"** section
  under the existing stat cards — one collapsible block per stop (pickup order), header =
  stop name · time · count, rows = roll + name. Multi-route → a small route pill switch.
  States: "No students booked today", loading, error. Mobile-first (`min-w-0` guards).
- **Row click → scanner:** each student row links to
  `/boarding/scan?learner=<id>&route=<route_id>&name=<name>&roll=<roll>&stop=<stop_name>`
  (all display fields already known to the dashboard — **no new lookup endpoint needed**;
  values URL-encoded).
- **Scan page** (`app/boarding/scan/page.tsx`) gains a **pre-selected-learner mode**: when
  `?learner=` is present, show a "Confirm boarding: [Name] · [Stop]" card with **Mark Present
  (Onward / Return)** buttons that call the existing `POST /api/boarding/attendance`
  (`{ routeId, direction, marks:[{learnerId, status:'present'}] }`, the same path the roster
  mark buttons use — re-checks route-assignment authority server-side + applies the window
  gate). The camera QR scanner remains available below for pass verification. The client-passed
  `route` is advisory only — the mark API independently validates the staff↔route assignment,
  so a forged query param cannot mark a learner on an unassigned route.

### Feature 3 — driver `/driver/boardings` (booked students)

Implement the 2026-07-08 spec, minus its admin-polish item:

- **API** `GET /api/driver/roster?date=` — sibling of `app/api/driver/passengers/route.ts`:
  `requirePerm(DRIVER_SELF_VIEW)`, `getDriverForUser` → `getDriverRoutes` (authority boundary),
  validate `date` (`^\d{4}-\d{2}-\d{2}$`), per route `loadBookedRoster` + `groupRosterByStop`.
- **Page** `app/driver/boardings/page.tsx` — read-only, React Query on `date`; prev/next-day
  chevrons + `<input type=date>` + Today reset (mirror the boarding roster date controls);
  route pill switch when >1 route; header `{booked} booked / {capacity} seats`; one collapsible
  section per stop in pickup order; states for no-route / no-bookings / loading / error.
- **Nav** — add `{ label: 'Boardings', href: '/driver/boardings', icon: <ClipboardList> }` to
  `lib/driver/navigation.ts` (drives sidebar + bottom nav + `deriveDriverPageTitle`).

### Feature 4 — boarding staff names on the student route

- **Resolver** `lib/routes/boarding-staff.ts`: `getBoardingStaffForRoute(svc, routeId)` →
  `Array<{ name; email }>`. Reads `tms_staff_route_assignment` where `route_id` + `is_active`,
  then resolves each `staff_email` to a name via `staff.first_name/last_name` (fallback
  `profiles.full_name`); email that resolves to nothing falls back to the email string.
  42P01-safe.
- **API** `GET /api/student/route` (`app/api/student/route/route.ts`): after resolving the
  learner's `transport_route_id`, call the resolver and add `boardingStaff: [{name,email}]` to
  the response (and `RouteData` type).
- **UI** `app/student/routes/page.tsx`: add a **"Boarding staff"** sidebar card next to the
  Driver card (~lines 428-440), listing names; empty state "Not assigned".

## Authority & permissions

- Boarding APIs: `tms.attendance.scan` + `getAssignedRouteIdsForUser` (staff only ever get
  their assigned routes; a learner id from the client is validated against those routes on mark).
- Driver API: `tms.driver.self_view` + `getDriverRoutes` (routes derived from identity, never
  from input).
- Student API: existing student-area gate; the boarding-staff resolver is read-only.
- No permission seeding, no `custom_roles` change, no migration.

## Testing & verification

- **Vitest** unit test `lib/booking/roster.test.ts` for `groupRosterByStop` (stop ordering,
  "Stop not set" bucket last, per-stop counts, rider sort by roll→name, empty input). Matches
  the repo's `lib/booking/*.test.ts` convention. Note: `@/` alias breaks vitest (per memory) —
  use a relative import in the test.
- `tsc --noEmit` filtered to changed files (ESLint is broken in this repo).
- Route probes (auth-gated → 307/403 headless).
- **Live verification by the user** on real student / driver / boarding logins (agent Chrome
  is unauthenticated): duration/distance/fare render; boarding dashboard list → scan marks
  present; driver Boardings lists today's booked students; student route shows boarding staff.

## Files

**New**
- `lib/booking/roster.ts`
- `lib/booking/roster.test.ts`
- `lib/routes/boarding-staff.ts`
- `app/api/boarding/bookings-today/route.ts`
- `app/api/driver/roster/route.ts`
- `app/driver/boardings/page.tsx`

**Modified**
- `app/student/routes/page.tsx` (duration/distance render, fare = transport_fee, boarding-staff card)
- `app/api/student/route/route.ts` (transport_fee + boardingStaff in response; duration type)
- `components/routes/route-ticket.tsx` (duration/distance render)
- `components/driver/route-card.tsx` (distance guard)
- `app/(admin)/routes/[routeId]/page.tsx` (distance/fare guards)
- `app/(admin)/routes/columns.tsx` (Distance / Duration / Fare columns)
- `lib/routes/detail.ts` (duration type → string)
- `app/boarding/dashboard/page.tsx` (Today's Bookings section)
- `app/boarding/scan/page.tsx` (pre-selected-learner mode)
- `lib/driver/navigation.ts` (Boardings nav entry)
