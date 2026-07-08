# Booked-students visibility across portals — Design

**Date:** 2026-07-08
**Status:** Approved (design); pending implementation plan
**Author:** pairing session

## Problem

When a student books the bus for a day (`tms_booking`), the three staff-facing portals
should be able to see *who booked to ride*. Analysis of the current codebase shows:

- **Admin** already sees booked students two ways: the `/bookings` date-range list
  (`GET /api/admin/bookings`) and the per-route/day manifest inside `/schedules` →
  "Load & Manifest" tab (`GET /api/admin/bookings/summary` + `GET /api/admin/schedules/manifest`).
- **Boarding** already has a full date-scoped roster at `/boarding/routes/[routeId]`
  (`GET /api/boarding/routes/[routeId]/roster?date=`), including walk-ups and attendance marking.
- **Driver** has **nothing**. `/driver/passengers` shows the *static route-assignment*
  roster (everyone permanently allocated to the route via `learners_profiles`), and no
  driver page or API reads `tms_booking`. Verified: `grep tms_booking` across
  `app/api/driver/**` and `lib/driver/**` returns zero hits.

So the substantive gap is the **driver** portal. Admin/boarding need only discoverability polish.

## Scope

1. **Driver:** a new per-day "Boardings" view fed by `tms_booking`, grouped by boarding
   stop in pickup order, with a date picker.
2. **Shared helper:** extract one roster helper (`lib/booking/roster.ts`) so the driver
   view and the admin manifest share the same query (boarding can adopt the primitive too).
3. **Polish:** make the admin manifest discoverable (deep-link from `/bookings`); optional
   boarding roster nav shortcut.

**No database migration. No new permissions.** `tms_booking` and `tms.driver.self_view`
already exist.

## Non-goals (YAGNI)

- Admin book/cancel on a learner's behalf.
- Driver marking attendance (boarding staff do that).
- "Already boarded" attendance tick on the driver view (deferred; keeps v1 read-only and
  decoupled from `tms_attendance`).
- Printable / all-routes manifest export, walk-up handling on the driver view,
  booking notifications.

## Data model (existing — unchanged)

```
tms_booking  PK(learner_id, travel_date)
  route_id  uuid   -- snapshot of the learner's route at booking time
  stop_id   uuid   -- snapshot of boarding stop
  booked_at, booked_by
  index (route_id, travel_date) INCLUDE (learner_id, stop_id)  -- covering, roster-ready
```

Presence = booked; cancel = DELETE the row. One row authorizes both onward + return.

## Components

### 1. `lib/booking/roster.ts` (new) — shared roster helper

- `loadBookedRoster(svc, routeId, date)` → `{ counts: { booked, capacity }, riders }`
  where `riders: Array<{ learner_id: string; name: string; roll: string | null; stop_id: string | null }>`.
  - Reads `tms_booking` filtered by `route_id` + `travel_date`.
  - Denormalizes learner `name`/`roll` from `learners_profiles` (chunked `.in()`, ≤150 ids —
    per the large-`.in()` gateway limit).
  - Reuses `bookedCount` + `routeCapacity` from `lib/booking/repo.ts` for `counts`.
  - `42P01`-safe: returns empty roster + zero counts if the table is absent.
- `groupRosterByStop(riders, orderedStops)` → **pure, unit-tested**. `orderedStops` is the
  route's stop sequence `[{ id, name, time, order }]`. Returns
  `[{ stop_id, stop_name, stop_time, count, riders }]` ordered by `order`, with a trailing
  "Stop not set" bucket for `stop_id === null`, and riders inside each stop sorted by
  `roll` then `name`.

### 2. `app/api/driver/roster/route.ts` (new) — driver API

`GET /api/driver/roster?date=YYYY-MM-DD` (default `istToday()`). A near-sibling of
`app/api/driver/passengers/route.ts`:

- `requirePerm(auth, TMS_PERMISSIONS.DRIVER_SELF_VIEW)` — same gate as `/driver/passengers`.
- `getDriverForUser(auth)` → `getDriverRoutes(staff_id, assigned_route_id)`. **This is the
  authority boundary:** a driver only ever receives their own route(s), so no per-route
  ownership check is needed beyond this.
- Validate `date` (`^\d{4}-\d{2}-\d{2}$`); 400 on malformed.
- For each route: `loadBookedRoster(svc, route.id, date)` → `groupRosterByStop(riders, route.stops)`.
- Response:
  ```json
  {
    "success": true,
    "data": {
      "date": "2026-07-08",
      "routes": [
        { "id": "...", "label": "12 · Town–Campus",
          "counts": { "booked": 18, "capacity": 40 },
          "stops": [ { "stop_id": "...", "stop_name": "Gandhipuram", "stop_time": "07:15",
                       "count": 6, "riders": [ { "learner_id": "...", "name": "Arun Kumar", "roll": "21CS045" } ] } ] }
      ]
    }
  }
  ```
- Empty-safe: no routes → `{ routes: [] }`; no bookings → route present with empty `stops`.

### 3. `app/driver/boardings/page.tsx` (new) — driver page

- Nav label **"Boardings"**, path `/driver/boardings`.
- React Query fetch of `/api/driver/roster?date=<date>` keyed on `date`.
- **Date controls** (mirror `app/boarding/routes/[routeId]/page.tsx`): prev/next-day chevrons,
  `<input type="date">`, and a "Today" reset.
- **Route selector:** pill switch when `routes.length > 1`; single route renders directly.
- **Header card:** route label · formatted date · `{booked} booked / {capacity} seats`
  (+ subtle capacity fill bar).
- **Body:** one collapsible section per stop in pickup order; section header =
  stop name · stop time · count; rows = roll + name. Sections default expanded.
- **States:** "No route assigned to you", "No students have booked for this day yet",
  loading skeleton, error card.
- **Read-only.** Mobile-first; apply `min-w-0` / responsive guards (per the mobile-overflow
  recipe) so nothing clips on a phone.

### 4. Navigation + polish

- **Driver nav** (`lib/driver/navigation.ts`): add `{ label: 'Boardings', href: '/driver/boardings', icon: <ClipboardList> }`.
  This single config drives both the desktop sidebar and `components/driver-bottom-nav`;
  `deriveDriverPageTitle` sets the header title.
- **Admin polish:**
  - Refactor `app/api/admin/schedules/manifest/route.ts` to call `loadBookedRoster`
    (realizes the shared-helper goal; low-risk, read-only).
  - Add a "View day's manifest →" deep-link on `/bookings`
    (`app/(admin)/bookings/page.tsx`) into `/schedules` Load & Manifest, carrying the
    active route + date, so the manifest is no longer buried two levels deep.
- **Boarding polish (optional, light):** add a "Roster" shortcut in
  `lib/boarding/navigation.ts` deep-linking to the assigned route's roster; leave the
  roster route logic untouched.

## Authority & permissions

- Driver API: `tms.driver.self_view` + route ownership via `getDriverRoutes` (a driver
  cannot pass an arbitrary route id — routes are derived from their identity, never from input).
- Admin manifest/bookings: unchanged (`tms.schedules.view` / `tms.bookings.view`).
- No permission seeding, no `custom_roles` change.

## Testing & verification

- **Vitest** unit test `lib/booking/roster.test.ts` for `groupRosterByStop`: stop ordering by
  sequence, "Stop not set" bucket placed last, per-stop counts, rider sort by roll→name,
  empty input. Matches the repo's `lib/booking/*.test.ts` convention.
- `tsc --noEmit` filtered to changed files (ESLint is broken in this repo).
- Route probe (auth-gated → 307/403 headless).
- **Live verification by the user** on a real driver login (agent Chrome is unauthenticated).

## Files

**New**
- `lib/booking/roster.ts`
- `lib/booking/roster.test.ts`
- `app/api/driver/roster/route.ts`
- `app/driver/boardings/page.tsx`

**Modified**
- `lib/driver/navigation.ts` (nav entry)
- `app/api/admin/schedules/manifest/route.ts` (use shared helper)
- `app/(admin)/bookings/page.tsx` (manifest deep-link)
- `lib/boarding/navigation.ts` (optional roster shortcut)
