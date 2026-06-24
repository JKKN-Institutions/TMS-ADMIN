# Driver Module Completion — Implementation Plan (for confirmation)

**Date:** 2026-06-23
**Status:** DRAFT — awaiting user confirmation before any implementation.

## 1. Current state (from team investigation)

- **Frontend:** only `/driver/dashboard` is built. `My Routes` (`/driver/routes`),
  `Passengers` (`/driver/passengers`), `Live Location` (`/driver/location`), `Profile`
  (`/driver/profile`) are `comingSoon: true` stubs with **no `page.tsx`** → 404 if visited.
- **Backend:** the only endpoint is `GET /api/driver/me` (`app/api/driver/me/route.ts`). It
  resolves the driver via `getDriverForUser` (`lib/driver/identity.ts`): `tms_driver.profile_id
  == userId`, else `staff.profile_id → staff.id → tms_driver.staff_id`. Auth = `withAuth` +
  `requirePerm(tms.driver.self.view)` + service-role reads. Returns license/ops stats + the
  assigned route's stop timetable.
- **Pattern to mirror:** the student portal's 4-layer recipe — client page (`useQuery` →
  `/api/...`, 404 = empty state) → `withAuth` API route (`requirePerm` + `createServiceRoleClient`)
  → `tms_*` tables → shared mappers (`loadPassengerRefs` / `mapLearner`) + `DataTable`.

## 2. THE BLOCKER — driver→route assignment reads the wrong column

| Fact | Value |
|---|---|
| Routes total / with stops | 24 / 24 |
| Routes assigned to a driver via `tms_route.driver_id` | **20** (all match `staff.id`) |
| Drivers with `tms_driver.assigned_route_id` set | **0** |
| `/api/driver/me` reads | `tms_driver.assigned_route_id` ← empty for everyone |

**Canonical assignment = `tms_route.driver_id = staff.id`.** The read path must use this, or
every driver shows "No route assigned." `tms_route.driver_id` has **no FK** (unconstrained uuid)
and points at `staff.id`. A driver may own **multiple** routes (hence "My Routes", plural).

## 3. Data readiness per module (drives scope)

| Module | Data source | Ready? |
|---|---|---|
| My Routes | `tms_route` (driver_id=staff.id) + `tms_route_stop` (stop_time/evening_time) | ✅ 20 routes |
| Passengers | `learners_profiles.transport_route_id/transport_stop_id` (static allocation) | ✅ 544 learners |
| Profile | `staff` (contact) + `tms_driver` (license/ops/emergency) | ✅ |
| Live Location | `tms_vehicle.current_latitude/longitude/last_gps_update` via route.vehicle_id | ❌ **0** vehicles have a GPS fix |

Daily `tms_booking` (2 rows) and `tms_attendance` (3 rows) are effectively empty — use the
**static** `learners_profiles` allocation for the roster, not bookings.

## 4. Phased plan

### Phase 0 — Fix the data pipeline (prerequisite for everything)
- Add a shared route resolver: a driver's routes = `tms_route WHERE driver_id = <driver.staff_id>`
  (ordered), not `tms_driver.assigned_route_id`. Update `/api/driver/me` to use it (keep returning
  the *primary* route for the dashboard timetable; gracefully handle 0/1/many).
- Backfill `tms_driver.profile_id` for the 3 drivers missing it (incl. the test account) so the
  primary resolver works without the staff fallback. (Migration under `supabase/migrations/`.)
- *(Optional, for the user's own live test)* assign the "Driver Testing" account a route by setting
  one `tms_route.driver_id` to its `staff.id` (`3b2950af-…`). Otherwise test with a real assigned driver.

### Phase 1 — My Routes  (`/driver/routes` + `GET /api/driver/routes`)
List the driver's route(s): route number/name, start/end, departure/arrival, vehicle + capacity,
and the full stop timetable (morning `stop_time` + evening `evening_time`, Major badges). Reuse the
dashboard's timetable rendering. Mirrors `app/student/routes`.

### Phase 2 — Passengers  (`/driver/passengers` + `GET /api/driver/passengers`)
Roster of learners allocated to the driver's route(s) (`learners_profiles.transport_route_id`),
grouped by stop, with names/contact via `loadPassengerRefs`/`mapLearner` + `DataTable`. Permission:
reuse `tms.driver.self.view` (simplest) or seed a new `tms.driver.passengers.view`.

### Phase 3 — Profile  (`/driver/profile`)
Read-only driver profile: staff contact (name/phone/email) + license (number/expiry) + ops stats
(status/rating/trips/experience) + emergency contact. Reuse `/api/driver/me` (extend if needed).
*(3b optional, later: editable self-fields — needs a new write permission + a self-update path,
since `tms_driver` RLS only allows admin writes.)*

### Phase 4 — Live Location  (`/driver/location`)
Data NOT ready (0 GPS fixes). Build **read-only "Where's my bus"**: the assigned route's vehicle
last-known position (`tms_vehicle.current_*` + `last_gps_update`) on a map, with a clear "no live
location yet" empty state. Driver-phone GPS **broadcasting** (POST ingest, device wiring) is a
larger separate effort — recommend deferring.

## 5. Cross-cutting
- **Recipe per module:** page `useQuery` → `/api/driver/X` (`withAuth` + `requirePerm` +
  service-role) → `tms_*` read → mapper → `{ success, data }`; 404→empty, error→notice, loading→spinner.
- **Reuse:** `getDriverForUser`, `loadPassengerRefs`/`mapLearner`, `DataTable`, `NoticeCard`,
  `StatTile`, `portal-user-menu`, the driver shell + nav already built.
- **Nav:** flip `comingSoon` off per route as it lands (`lib/driver/navigation.ts`).
- **Verification:** `tsc` per changed file (ESLint is broken project-wide); live login as an
  assigned driver (agent browser is unauthenticated, so the user confirms render).

## 6. Decisions to confirm
1. **Assignment source of truth:** read routes from `tms_route.driver_id = staff.id` (recommended). OK?
2. **Live Location:** read-only "where's my bus" + empty state now (recommended) / full broadcast / defer?
3. **Profile:** read-only first (recommended) / editable now?
4. **Passengers source:** static `learners_profiles` allocation (recommended) / daily `tms_booking`?
5. **Permissions:** reuse `tms.driver.self.view` everywhere (recommended) / add `tms.driver.passengers.view`?
6. **Test account:** want me to assign the "Driver Testing" account a route so you can see live data?
7. **Build order:** Phase 0 → My Routes → Passengers → Profile → Live Location (recommended)?
