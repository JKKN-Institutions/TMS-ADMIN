# Driver-Phone Live Tracking — Design

**Date:** 2026-06-24
**Status:** Approved (design). Next step: implementation plan (writing-plans).
**Author:** Brainstorming session with the user.

## Problem

The TMS live-tracking module is wired but non-functional end to end. Investigation (three
code agents + live DB verification) found three disconnected pieces:

1. **Capture — does not exist.** There is zero `navigator.geolocation` /
   `getCurrentPosition` / `watchPosition` anywhere in the repo. `app/api/driver/location/route.ts`
   is **GET-only**; the driver's phone never sends a position. `/driver/location` is a read-only
   "where's my bus" viewer that polls every 15s.
2. **Storage — exists but empty.** The `tms_` plane already caches the latest fix on the vehicle
   row (`tms_vehicle.current_latitude/current_longitude/gps_speed/gps_heading/gps_accuracy/
   last_gps_update`, plus `live_tracking_enabled`, `gps_provider`, `gps_device_id`), has an
   append-only ping log (`gps_location_history`), and an opt-in flag designed for this feature
   (`tms_driver.location_sharing_enabled`). The only writer today is the hardware/Mercyda path
   (`app/api/admin/gps/location` POST keyed by `device_id`; `lib/gps-services/mercyda-tracking.ts`,
   which carries hardcoded creds).
3. **Display — broken.** The admin "Track All" Leaflet map (`/track-all`) calls
   `/api/admin/track-all/drivers`, which queries the **legacy** `drivers` / `routes` / `vehicles`
   tables. Live DB check: those tables **no longer exist** (dropped in the `tms_` cutover), so the
   admin map shows nothing regardless of GPS.

### Live DB snapshot (2026-06-24, project kvizhngldtiuufknvehv)

| Metric | Value |
|---|---|
| Legacy `drivers`/`vehicles`/`routes`/`location_tracking`/`driver_route_assignments`/`settings` | **do not exist** |
| `tms_vehicle` total / tracking-enabled / with a fix / with gps_device | 35 / 0 / 0 / 0 |
| `tms_route` with a driver / with a vehicle | 21 / 22 |
| `tms_driver` total / `location_sharing_enabled` on | 31 / 0 |
| `gps_location_history` rows | 0 |
| `gps_devices` | 1 |

## Goal

Let a driver broadcast their **phone's GPS** from the driver portal, and surface that live
position to three consumers: the **admin Track-All map**, the **driver's own** page, and
**students** on the route.

## Decisions (from brainstorming)

| Axis | Decision |
|---|---|
| Capture mode | **Foreground "On Duty"** — `watchPosition` while the page is open and screen on. Native background tracking is an explicit later phase. |
| Active vehicle (driver owns ≥1 route) | **Driver picks the active route** before sharing; only that route's vehicle is updated. |
| Consumers | **All three:** admin Track-All map, driver self, students. |
| Update transport | **Polling** (consistent with existing 15s/30s patterns). No Supabase Realtime in v1. |
| Storage model | **Approach A — unify onto the existing `tms_` plane** (write the same columns the hardware path writes). No parallel tables. |
| Write permission | Reuse the existing-but-unused `TMS_PERMISSIONS.TRACKING_SHARE` (`tms.tracking.share`), granted to the driver role. |

## Architecture

One ingest, three readers. The vehicle row is the shared join point, so a single write is
visible to all consumers:

```
DRIVER PHONE                       SERVER                           DB (tms_ plane)          CONSUMERS
/driver/location                                                                            
 [Go On Duty]+route   POST /api/driver/location (every ~12s)                                
 watchPosition() ───► withAuth + requirePerm(TRACKING_SHARE)                                
                      getDriverForUser → owns routeId? → vehicle_id                          
                      UPDATE tms_vehicle.current_* ──────────────►  tms_vehicle ──┐         
                      INSERT gps_location_history ──────────────►  gps_location_  │         
                      SET tms_driver sharing flags                  history       │         
 [Go Off Duty] ─────► DELETE /api/driver/location                                 ├─► /track-all (Leaflet, 30s) — repointed
                      clear flags; live_tracking_enabled=false                    ├─► /driver/location (15s) — already reads tms_vehicle
                                                                                  └─► /student/track (15s) — NEW
```

### Linkage (already healthy)

`auth.userId` → `getDriverForUser` (`tms_driver.profile_id`, else `staff.profile_id`→`staff.id`
→`tms_driver.staff_id`) → driver's **`staff_id`** → `tms_route.driver_id` (and/or
`tms_driver.assigned_route_id`) via `getDriverRoutes` → `tms_route.vehicle_id` → `tms_vehicle`.
Students: `learners_profiles.transport_route_id` → `tms_route.vehicle_id` → `tms_vehicle`.

## Components (by phase)

### Phase 0 — Schema & permission
- Migration under `supabase/migrations/` adds duty-session state to `tms_driver`:
  `active_route_id uuid` (nullable), `location_sharing_started_at timestamptz` (nullable).
  (`location_sharing_enabled` already exists.) Add `source text` to `gps_location_history`
  (values `'driver_app'` | `'device'`) to distinguish phone vs hardware fixes.
- Grant `tms.tracking.share` to the driver role so the ingest passes `requirePerm`.
- Commit the migration file; apply via Supabase MCP (`apply_migration`).

### Phase 1 — Ingest API (`app/api/driver/location/route.ts`: add POST + DELETE)
- `POST`: `withAuth` + `requirePerm(TMS_PERMISSIONS.TRACKING_SHARE)` (super-admin bypass).
  Body `{ routeId, latitude, longitude, speed?, heading?, accuracy?, timestamp? }`.
  Steps: `getDriverForUser` → 404 if none; `getDriverRoutes` to assert the driver **owns**
  `routeId` and read its `vehicle_id` (reject 403 if not owned, 422 if route has no vehicle);
  validate lat ∈ [-90,90], lng ∈ [-180,180], accuracy sane; service-role
  `UPDATE tms_vehicle` of that vehicle (`current_latitude/longitude`, `gps_speed/heading/accuracy`,
  `last_gps_update=now()`, `live_tracking_enabled=true`, `gps_provider='driver_app'`);
  `INSERT gps_location_history` (`vehicle_id`, lat/lng/speed/heading/accuracy, `source='driver_app'`,
  `timestamp`); `UPDATE tms_driver` set `location_sharing_enabled=true, active_route_id=routeId,
  location_sharing_started_at=now()` (only set started_at if newly going on duty).
  Returns `{ success:true, data:{ accepted:true } }`.
- `DELETE` (go off duty): `getDriverForUser`; clear `tms_driver.location_sharing_enabled=false,
  active_route_id=null`; set the active vehicle's `live_tracking_enabled=false` (keeps the last
  fix but marks it not-live). Returns `{ success:true }`.
- `GET` unchanged (existing "where's my bus").
- Audit the on/off-duty transitions via `lib/activity/log.ts`.

### Phase 2 — Driver capture UI (`app/driver/location/page.tsx` rewrite)
- Active-route picker (rendered only when the driver owns >1 route; otherwise auto-select).
- **Go On Duty / Go Off Duty** toggle. On duty:
  `navigator.geolocation.watchPosition({ enableHighAccuracy:true, maximumAge:5000, timeout:15000 })`;
  keep only the latest fix in a ref and POST it on a ~12s interval (send-latest, not per-event —
  saves battery and data); best-effort `navigator.wakeLock.request('screen')` to keep the screen
  on; honest banner stating capture pauses if the tab is backgrounded / screen locks.
- Live status: sharing indicator, "last sent Ns ago", current accuracy, and a small self-position
  Leaflet map (reuse the dynamic-import, `ssr:false` pattern from the admin map).
- Keep the existing read-only "where's my bus" cards below the capture controls.
- Handle permission-denied / unavailable geolocation with a clear NoticeCard.

### Phase 3 — Admin Track-All repoint (`app/api/admin/track-all/drivers/route.ts` rewrite)
- Replace the dead legacy query with the `tms_` plane: `tms_route` where `driver_id is not null`
  → join driver name via `tms_driver`/`staff` (and `profiles`) → `tms_vehicle` (the fix). Compute
  `gps_status` from `last_gps_update` age (online ≤2min, recent ≤5min, else offline).
- Return the **same JSON shape** `components/live-tracking-map.tsx` already consumes
  (`current_latitude`, `current_longitude`, `route_number`, driver `name`, vehicle reg, last
  update, `gps_status`) so the Leaflet component and `/track-all/page.tsx` need no changes.

### Phase 4 — Student "where's my bus" (new)
- `GET /api/student/location` (student self permission): resolve the learner's
  `learners_profiles.transport_route_id` → `tms_route.vehicle_id` → `tms_vehicle` last fix +
  freshness. Returns `{ success, data:{ route, vehicle|null } }`.
- New `/student/track` page (or a card on `/student/routes`): Leaflet map + 15s polling + a
  clear "bus offline / not sharing yet" empty state. Mirrors the student portal recipe.

### Cross-cutting
- `lib/gps/freshness.ts` — shared `gpsStatus(lastUpdate)` helper so all three readers agree on
  online/recent/offline thresholds.
- Verification is headless: `tsc` on changed files (ESLint is broken project-wide) + dev-server
  route probes. A live authenticated render (driver login on a phone) is confirmed by the user,
  since the agent browser is unauthenticated.

## Constraints (documented, not hidden)
- **Foreground-only:** web GPS stops when the tab is backgrounded or the screen locks. Wake Lock
  mitigates while visible. True background tracking requires a native wrapper (Capacitor/RN) — an
  explicit later phase, out of scope for v1.
- **HTTPS required** for `geolocation` (production is HTTPS; `localhost` is exempt).
- **Privacy:** capture is opt-in and only while "On Duty"; off-duty clears the active route and
  stops writes.
- **Multi-route correctness:** only the driver-selected active route's vehicle is updated; other
  routes the driver owns are untouched.

## Out of scope (v1)
- Native/background tracking.
- Supabase Realtime (polling only).
- Reworking the Mercyda/hardware path or the hardcoded-credentials issue (tracked separately).
- Geofencing/ETA/stop-arrival alerts (`gps_alerts` exists but is not extended here).

## Build order
Phase 0 → 1 (ingest) → 2 (driver capture — the core deliverable) → 3 (admin map) → 4 (student).
Each phase is independently testable.
