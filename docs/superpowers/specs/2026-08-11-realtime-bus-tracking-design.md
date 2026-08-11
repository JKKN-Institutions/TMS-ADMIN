# Real-Time Bus Tracking — Design

**Date:** 2026-08-11
**Branch:** `feat/realtime-bus-tracking` (off `origin/main` @ `d86ba9b` + 4 carried commits)
**Status:** Design approved, ready for implementation planning

---

## 1. Context

The requirement asked for a real-time driver/bus tracking system: driver phone → backend →
realtime → admin all-bus map + student single-bus view, with n8n for meaningful events.

An architecture review of the existing codebase found that **most of the capture and display
layer already exists and works**. The genuine gaps are narrower and different from what the
requirement assumed.

### 1.1 What already exists (verified in code, 2026-08-11)

| Capability | Where |
|---|---|
| Driver GPS capture | `lib/driver/use-live-tracking.ts` + `lib/driver/tracking-controller.ts` — pure reducer, 7 states, wake lock, visibility resume, OS-location-off detection, 3× retry with backoff, abort-on-stop, re-entrancy latches |
| Ingest API | `POST /api/driver/location` — perm `tms.tracking.share`, coordinate range validation, monotonic capture guard (`lib/driver/tracking.ts`) |
| Live position store | `tms_vehicle.current_latitude/current_longitude/gps_speed/gps_heading/gps_accuracy`, `last_gps_update` (server receipt), `last_capture_at` (device clock) |
| Position history | `gps_location_history` (+ `source` column) |
| Freshness / status | `lib/gps/freshness.ts`, `lib/gps/route-status.ts` (8 states with plain-English reasons) |
| Admin fleet map | `/track-all` + `GET /api/admin/track-all/routes` (route-centric), `POST /api/admin/track-all/nudge`, perm `tms.tracking.view` |
| Maps / geo | `components/live-tracking-map.tsx` (admin), `components/live-position-map.tsx` (student/boarding/driver), `lib/geo/{osrm,geocode,route-to-campus}.ts`, `lib/gps/{distance,interpolate,campus}.ts` |
| Student single-bus view | `/student/live-track` + `GET /api/student/location` |
| Boarding in-charge view | `/boarding/live-track` + `GET /api/boarding/location` |
| Notifications | `tms_notification*` tables, `lib/notifications/dispatch.ts`, web push, 4-portal inbox |
| Realtime infrastructure | Supabase Realtime is live — `supabase_realtime` publication includes `tms_notification_recipient`; `hooks/use-tms-notifications.ts` is the working `postgres_changes` consumer |

### 1.2 Measured data reality (live DB, 2026-08-11)

| Fact | Value | Consequence |
|---|---|---|
| Routes | 24 | — |
| Drivers / vehicles | 31 / 35 | — |
| Route stops | 486 | — |
| Stops **with** coordinates | **14** — and known-wrong (auto-geocoded to wrong towns) | Geofencing and per-stop ETA are **data-blocked**, not code-blocked |
| Routes with start/end coords | 0 | Route polyline cannot be drawn from route data |
| `gps_location_history` rows | 27,767 (17,198 in last 30 days) | The feature is genuinely used |
| Vehicles that have **ever** reported | 4 of 35 | Adoption, not capability, is the constraint |
| Drivers flagged `location_sharing_enabled` | 2 — **0 of them reporting** | Stuck-session bug is live right now |
| Learners with a transport route | 1,320 | Student-side audience |
| Routes sharing a vehicle | 0 | `UNIQUE(vehicle_id) WHERE active` is safe |
| Drivers on multiple routes | 1 | Constrain active *trips*, not routes |
| Routes with evening stop times | 24 of 24 | Return trips are real |
| Routes with departure+arrival times | 24 of 24 | Direction can be derived |
| `tms_attendance.direction` values | `onward` only (1,468 rows) | The transport office **retired the return attendance leg** |
| `pg_cron` / `pg_net` | 1.6 / 0.10.0 installed | In-DB scheduling available |
| `realtime.messages` | RLS enabled, 1 policy (`induction_poll_realtime_receive`) | **Realtime Authorization works here, with a proven precedent** |

### 1.3 The actual gaps

1. **No trip entity.** No `tms_trip`. "START TRIP" today is *"Go On Duty"* — a boolean
   `tms_driver.location_sharing_enabled` plus `active_route_id`. There is therefore no
   `trip_id`, no trip status, no trip history, no trip summary, and no duplicate-session
   detection.
2. **Sessions never end.** Nothing clears `location_sharing_enabled` except an explicit tap.
   Route 19 was "sharing" for a month. Two drivers are stuck in that state today.
3. **No realtime distribution of location.** Every reader polls on a 5-second interval.
4. **No n8n.** No code, no env var, no webhook anywhere in the repository.
5. **Geofencing / stop ETA impossible on current data** (see 1.2).
6. **Background/locked-screen tracking impossible** in pure web. The Capacitor Android shell
   was built, merged, then reverted (`b3b55d5`); there is no `android/` directory today.

---

## 2. Goals and non-goals

### Goals

- A real trip lifecycle: START TRIP → tracking → END TRIP, with a durable `trip_id`.
- Live positions reach admin and student screens over Supabase Realtime, not polling.
- A student can only ever receive their own route's positions, enforced by the database.
- Status is honest: never display "Live" when the backend has not received a recent fix.
- Stuck sessions end themselves.
- Meaningful transport events raise notifications through the existing module.
- Unblock the stop-coordinate data problem so geofencing/stop-ETA become possible later.

### Non-goals (explicitly out of scope)

- Background / locked-screen GPS capture. Pure web cannot do it; the native shell is reverted.
- n8n integration. Decided out of scope for this round; the event emitter is written so a
  webhook can be added later as one function call.
- Google Maps migration. Leaflet/OSRM stays (see `project_google_maps_migration`).
- Turn-by-turn navigation.
- Backfilling the 486 stop coordinates. This design ships the *tool*; a human enters the data.

---

## 3. Architecture

```
Driver phone (PWA, foreground only)
  navigator.geolocation.watchPosition          [existing, unchanged]
        │  latest-fix-wins every 6s; bounded offline ring buffer
        ▼
  POST /api/driver/location { tripId, latitude, longitude, speed, heading, accuracy, capturedAt }
        │  authz: perm tms.tracking.share
        │       + trip belongs to THIS driver (resolved server-side)
        │       + trip.status = 'active'
        │  quality gate: reject fixes with accuracy worse than minAccuracyM
        │  monotonic guard: only advance when capturedAt is strictly newer  [existing]
        │
        ├─► tms_vehicle.current_*                 [existing — the live-location store]
        ├─► gps_location_history (+ trip_id)      [existing table, new column]
        ├─► tms_trip.last_fix_at / fix_count / distance_km      [new]
        └─► HTTP broadcast → Supabase Realtime    [new, fail-soft, ONE call, TWO topics]
                  │
      ┌───────────┴─────────────┐
      ▼                         ▼
  topic `tms_fleet`        topic `tms_bus:<routeId>`
  RLS: tms.tracking.view   RLS: own route only
      │                         │
  Admin /track-all         Student /student/live-track
                           Boarding /boarding/live-track
                           Driver self-view
```

**Fallback:** the existing 5-second poll is retained. When the realtime channel reports
`SUBSCRIBED`, the poll backs off to a 30-second reconcile. If the channel errors or closes, it
returns to 5 seconds. The page is therefore never worse than today.

---

## 4. Database changes

### 4.1 New table `tms_trip`

```sql
create table tms_trip (
  id                uuid primary key default gen_random_uuid(),
  route_id          uuid not null references tms_route(id),
  driver_id         uuid not null references tms_driver(id),
  vehicle_id        uuid not null references tms_vehicle(id),
  travel_date       date not null,
  direction         text not null check (direction in ('onward','return')),
  status            text not null check (status in ('active','completed','expired','cancelled')),
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  end_reason        text check (end_reason in ('driver','auto_expiry','admin')),
  last_fix_at       timestamptz,
  start_latitude    numeric, start_longitude numeric,
  end_latitude      numeric, end_longitude   numeric,
  distance_km       numeric not null default 0,
  fix_count         integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid
);

-- Duplicate-session prevention, enforced by the database rather than app logic.
create unique index tms_trip_one_active_per_route   on tms_trip(route_id)   where status = 'active';
create unique index tms_trip_one_active_per_driver  on tms_trip(driver_id)  where status = 'active';
create unique index tms_trip_one_active_per_vehicle on tms_trip(vehicle_id) where status = 'active';

create index tms_trip_route_date on tms_trip(route_id, travel_date desc);
create index tms_trip_active     on tms_trip(status) where status = 'active';
```

**Design note — why not `UNIQUE(route_id, travel_date, direction)`.** That key would cap a
route at one onward trip per day, so a driver who ends a trip early and restarts would be
blocked by a constraint violation. `UNIQUE(route_id) WHERE status='active'` delivers the
duplicate-session guarantee the requirement actually asks for while permitting re-runs.
`travel_date` and `direction` remain as descriptive columns so trips join cleanly to
`tms_attendance`, which is keyed `(route_id, trip_date, direction)`.

**Design note — `direction`.** `tms_attendance` only ever contains `onward` because the
transport office retired the *return attendance leg*. Buses still run both ways (all 24 routes
have `evening_time` and `departure_time`/`arrival_time`). Trips therefore support both values;
direction is derived from IST time-of-day against the route's `departure_time`/`arrival_time`,
defaulting to `onward`, and is overridable by the driver.

### 4.2 Column additions

- `gps_location_history.trip_id uuid null references tms_trip(id)` — nullable so the 27,767
  existing rows are untouched.

### 4.3 Settings

One `admin_settings` row, `setting_type = 'tracking'`:

```json
{
  "liveMaxSec": 120,
  "staleMaxSec": 300,
  "offlineMaxMin": 30,
  "tripExpiryMin": 30,
  "unexpectedStopMin": 10,
  "minAccuracyM": 100,
  "stopGeofenceM": 150
}
```

Code defaults are the fallback when the row is absent, matching today's constants
(`lib/gps/route-status.ts` `STUCK_AFTER_MIN = 30`, freshness 2 min / 5 min).

### 4.4 Permissions

- New: `tms.tracking.trip.manage`, seeded to the `driver` role.
- Reused unchanged: `tms.tracking.share` (driver broadcast), `tms.tracking.view` (admin).

### 4.5 Data cleanup (user-visible)

The two drivers currently stuck at `location_sharing_enabled = true` with zero reporting are
cleared in the migration. **Consequence: those two drivers must tap START TRIP again.** They
are not currently transmitting, so no live tracking is lost.

### 4.6 Trip expiry

An active trip whose `last_fix_at` is older than `tripExpiryMin` becomes
`status='expired', end_reason='auto_expiry'`.

Executed in **two** places, deliberately:

1. **Primary — lazily on the read path.** An idempotent `UPDATE ... WHERE status='active' AND
   last_fix_at < now() - interval` runs inside the admin fleet read and the driver trip-status
   read.
2. **Backstop — `pg_cron`**, every 5 minutes.

Rationale: this project has two Vercel cron jobs that have **never fired in production**. An
expiry mechanism that depends only on a scheduler which may never run would reproduce the exact
bug it exists to fix. The read path cannot silently not-run.

---

## 5. Realtime and security

### 5.1 Topics

| Topic | Audience | Payload |
|---|---|---|
| `tms_bus:<routeId>` | that route's students, its boarding in-charges, its driver, and staff with `tms.tracking.view` | one fix |
| `tms_fleet` | staff with `tms.tracking.view` | one fix, plus routeId |

### 5.2 Authorization

Modelled directly on the existing `induction_poll_realtime_receive` policy already present on
`realtime.messages` in this database.

```sql
create policy tms_bus_realtime_receive on realtime.messages
for select to authenticated
using (
  (topic like 'tms_bus:%'
     and tms_can_view_route_live(nullif(split_part(topic, ':', 2), '')::uuid))
  or (topic = 'tms_fleet' and user_has_permission('tms.tracking.view'))
);
```

`tms_can_view_route_live(uuid)` — `SECURITY DEFINER`, returns true only when the caller is:

- a user holding `tms.tracking.view` (admin / transport staff) — any route; or
- a learner whose `learners_profiles.transport_route_id` equals that route; or
- a boarding in-charge assigned to that route; or
- that route's driver.

**Verified building blocks** (these exist in the database today; do not invent new ones):

| Function | Signature | Notes |
|---|---|---|
| `user_has_permission` | `(permission_name text)` | `SECURITY DEFINER`. The same function every API route calls via `auth.supabase.rpc`. |
| `get_my_learner_id` | `()` | `SECURITY DEFINER`. Used by the existing `induction_poll_realtime_receive` policy for exactly this purpose. |

An earlier draft of this spec referenced `tms_user_has_perm()`, which does not exist. The
correct name is `user_has_permission`.

**A student who edits the topic string in devtools receives nothing** — the refusal happens in
the database, not the frontend.

The policy is prefix-scoped to `tms_bus:` / `tms_fleet`, so it is additive and cannot affect the
existing induction-poll subscription in this shared multi-app database.

### 5.3 Server-side broadcast

The ingest route publishes via the Realtime **HTTP** endpoint
(`POST {SUPABASE_URL}/realtime/v1/api/broadcast`) using the service role key, sending both
messages in a single request. HTTP rather than a websocket because the route runs on Vercel
serverless, where establishing a socket per invocation is wasteful.

Broadcast is **fail-soft**: the database writes have already committed, and pollers still
observe the fix, so a broadcast failure degrades latency but never correctness.

### 5.4 Existing API authorization is unchanged

Student route identity continues to come from `learners_profiles.transport_route_id`
server-side. No endpoint accepts a client-supplied bus, route, driver, or student id. The
"student swaps `bus_id` in the frontend" attack is already impossible and stays impossible.

---

## 6. API changes

| Endpoint | Change |
|---|---|
| `POST /api/driver/trips` | **New.** Start a trip. Body `{ routeId, direction? }`. Resolves driver from auth, validates route assignment via `getDriverRoutes`, requires a vehicle, derives direction, inserts `status='active'`. Unique-index violation → `409` with the existing trip. |
| `GET /api/driver/trips/active` | **New.** The driver's current active trip, plus derived status. Runs lazy expiry. |
| `POST /api/driver/trips/[id]/end` | **New.** `status='completed'`, `ended_at`, `end_reason='driver'`, writes the trip summary. |
| `POST /api/driver/location` | **Modified.** Accepts `tripId`; when absent, resolves the driver's active trip. **No active trip → `409`, no position is stored.** Adds an accuracy quality gate. Updates trip counters. Broadcasts. |
| `DELETE /api/driver/location` | **Modified.** Ends the active trip as well as clearing the sharing flags. |
| `GET /api/admin/track-all/routes` | **Modified.** Adds trip status/duration, `studentsAssigned`, `studentsBoarded`. Runs lazy expiry. |
| `GET /api/student/location` | **Modified.** Adds trip status, honest ETA field, and `realtimeTopic` so the client subscribes to a server-supplied topic rather than one it constructs. |
| `GET /api/boarding/location` | **Modified.** Same additions, scoped to assigned routes. |
| `PUT /api/admin/routes/[routeId]/stops/coords` | **New.** Bulk-save stop coordinates from the map picker. Perm `tms.routes.edit` (`TMS_PERMISSIONS.ROUTES_EDIT`). |

All new routes follow the project's modern pattern: `withAuth` + `AuthContext`,
`createServiceRoleClient`, an explicit `requirePerm`, and the `{ success, data }` / `{ error }`
response shape.

---

## 7. Driver experience

`/driver/location` becomes trip-centric, built from the existing `components/driver/ui.tsx`
primitives (no new visual language).

**Before the trip** — assigned-trip card: driver name, bus registration, route, start location →
destination, trip status. One large **START TRIP** button. The location permission is
*explained before it is requested*.

**During the trip** — a persistent tracking indicator, two independent honest status lines
(`GPS: Connected` and `Network: Reconnecting…`), fixes-sent count, trip duration, and
**END TRIP**. No further interaction is required while driving.

**Network loss** — fixes accumulate in a bounded in-memory ring buffer (~60 entries) and flush
as a batch on reconnect. In-memory rather than IndexedDB because capture is foreground-only
anyway; persisting across a page kill would buy nothing.

`tracking-controller.ts` gains a `no_active_trip` status and network state. Its existing 7
states and their unit tests are preserved.

---

## 8. Admin experience

`/track-all` is **improved, not replaced.** The fleet-health list, plain-English reasons, nudge
action, OSRM road-snapping, and basemap toggle all remain.

Added:

- Trip status and duration per route.
- Realtime marker updates (subscribe `tms_fleet`; poll backs off to 30s reconcile).
- Marker popup gains **Students Assigned** (count from `learners_profiles`) and
  **Students Boarded** (count from `tms_attendance` for today / `onward`).

The known defect class in this page is preserved as a constraint: **never place an object or
array from fetched data in a React dependency array** — it caused four separate bugs during the
fleet-health build, because the 5s poll yields fresh object identities every tick.

---

## 9. Student experience

`/student/live-track` gains:

- A **MY BUS** header: route number/name and start → destination.
- A trip-aware status chip driven by trip status + freshness.
- Realtime updates via a **server-supplied** topic.
- **Honest ETA** — minutes-to-campus shown only when the bus is both approaching and moving
  (reusing `lib/gps/distance.ts` `isApproaching`/`etaMinutes`); otherwise the UI states
  "ETA unavailable". No fabricated numbers.
- **Current / Next stop is hidden entirely until that route has real stop coordinates.** It
  lights up per-route as Phase 4 data lands.
- The existing empty state when the learner has no route allocation is kept.

---

## 10. Stop coordinates, geofencing, ETA

**Phase 4** adds an admin map-picker (`/routes/[routeId]/stops/map`): a Leaflet map where an
operator drops or drags a pin per stop, with save and a clear-bad-coordinate action for the 14
known-wrong rows.

The geofence engine (`lib/gps/geofence.ts`) is written and unit-tested in this project —
`STOP_REACHED`, `STOP_DEPARTED`, `CAMPUS_ARRIVAL` from radius crossings — but stays **dormant
per route until that route has stop coordinates**. It activates automatically as data arrives.

Per-stop ETA is **not** delivered in this design. It depends on the same missing coordinates.
Only bus→campus ETA ships, and only when honest.

---

## 11. Events and notifications

n8n is out of scope. Events are detected server-side and dispatched through the existing
`tms_notification` module and web push via `lib/notifications/dispatch.ts`.

| Event | Trigger | Audience |
|---|---|---|
| `TRIP_STARTED` | trip insert | learners on that route |
| `TRIP_COMPLETED` | explicit end | learners on that route |
| `UNEXPECTED_STOP` | stationary > `unexpectedStopMin` while active | transport admin |
| `BUS_DELAYED` | active past `arrival_time` + grace | learners on that route + admin |

All four are emitted from a single module (`lib/tracking/events.ts`) whose dispatch function is
the only integration point, so adding an n8n webhook later is one call, not a refactor.

`UNEXPECTED_STOP` deliberately does not treat every stop as an emergency: it requires a
configurable stationary duration and only alerts admins, never students.

---

## 12. Status model

`lib/gps/route-status.ts` is **extended, not forked**, to become trip-aware and to expose the
requested vocabulary:

| Displayed | Condition |
|---|---|
| `LIVE` | active trip, fix newer than `liveMaxSec` |
| `CONNECTING` | active trip, no fix yet this session |
| `STALE` | active trip, fix between `liveMaxSec` and `staleMaxSec` |
| `OFFLINE` | active trip, fix older than `staleMaxSec` |
| `TRIP_COMPLETED` | trip ended or expired |

The existing operational states (`stuck`, `no_vehicle`, `no_driver`, `unconfigured`, `off`) are
retained for the admin view, because they tell an admin what to *do*.

Freshness is measured from **server receipt** (`last_gps_update`), never device clock, so a
skewed phone cannot make a bus look live.

---

## 13. Error handling

| Condition | Behaviour |
|---|---|
| GPS disabled at OS level | `os_location_off` + instructions [existing] |
| Permission denied | `permission_denied`, terminal, resources released [existing] |
| Poor accuracy | Fix rejected before write; UI shows "weak GPS", tracking continues |
| Network disconnected | Ring-buffer fixes, `Network: Reconnecting…`, retry with backoff |
| Backend unavailable | Same path; trip stays active; no false "Live" |
| Driver logs out / page unmounts | `DELETE` fires with `keepalive` [existing] |
| Driver ends trip | Trip completed, sharing flags cleared, summary written |
| Duplicate START TRIP | `409` from the unique index; UI offers to resume the existing trip |
| Multiple devices | Second device gets the same trip; monotonic guard keeps positions ordered |
| Invalid / foreign trip id | `403`; trip ownership resolved server-side |
| Unauthorized location update | `403` from `tms.tracking.share` + ownership check |
| Stale location | Classified `STALE`/`OFFLINE`; never rendered as Live |
| Realtime reconnect | Channel status drives poll interval; reconcile fetch on resubscribe |

---

## 14. Testing strategy

Pure logic is unit-tested with vitest. Baseline on this branch: **61 files, 597 tests, all
passing** (~9s).

Two constraints from `vitest.config.ts`, both verified on this branch:

- `test.include` is `['lib/**/*.test.ts', 'proxy.test.ts']` — **test files must live under
  `lib/`**. A test placed beside an `app/` route will silently never run.
- The `@/*` alias **is** configured (`resolve.alias`) and does resolve. Older code in
  `lib/gps/` and `lib/geo/` uses relative imports because that alias did not always exist;
  new code may use `@/`.

- `lib/tracking/trip-state.ts` — lifecycle transitions, expiry boundaries, direction derivation.
- `lib/gps/route-status.ts` — extended vocabulary, threshold boundaries, trip-aware cases.
- `lib/gps/geofence.ts` — enter/exit/hysteresis, and the "no coordinates ⇒ dormant" case.
- `lib/tracking/events.ts` — each trigger fires once and only once.
- `lib/driver/tracking-controller.ts` — new network + `no_active_trip` states; existing cases kept.
- Ring buffer — bounded, ordered, flushes and clears.

Authorization is verified against the live database with `SET LOCAL ROLE` inside a `DO` block —
a plain `select` as service role falsely succeeds and would prove nothing.

**Cannot be automated here:** the agent's browser cannot authenticate against this app, so the
driver phone flow, admin map, and student view require manual verification by the user on a
real device. This is stated as an owed item, not quietly skipped.

---

## 15. Phasing

| Phase | Content |
|---|---|
| 1 | `tms_trip` + migration + trip APIs + driver START/END TRIP UI |
| 2 | Realtime broadcast + RLS policy + client hooks + poll backoff |
| 3 | Admin and student UI upgrades (trip-aware, boarded counts, honest ETA) |
| 4 | Stop coordinate map-picker + dormant geofence engine |
| 5 | Transport events → notifications |

---

## 16. Limitations carried forward

1. **Background / locked-screen tracking will still not work.** This design makes the
   limitation *honest*; it does not solve it. A native wrapper is the only fix.
2. **Geofencing and per-stop ETA will not function on real data at delivery.** They unblock
   only as Phase-4 coordinates are entered by a human.
3. **Authenticated flows cannot be smoke-tested by the agent.** Manual verification owed.
4. **`realtime.messages` is a shared multi-app surface.** The new policy is prefix-scoped and
   additive, but it is a change to shared infrastructure.
5. Only 4 of 35 vehicles have ever reported a position. This design does not, by itself,
   increase driver adoption.

---

## 17. Decisions taken

| Decision | Choice | Rationale |
|---|---|---|
| Trip model | New `tms_trip` table | The backbone for trip_id, lifecycle, history, summaries, and duplicate detection |
| Active-trip key | `UNIQUE(route_id/driver_id/vehicle_id) WHERE status='active'` | Gives duplicate-session prevention without capping trips per day |
| Realtime transport | Broadcast on private per-route channels | The only option where cross-bus access is refused by the database |
| n8n | Out of scope | No instance wired; events still fire via the existing notification module |
| Stop coordinates | Build the admin map-picker | Auto-geocoding already produced 14 wrong rows; a safety-adjacent feature must not ship plausible-wrong data |
| Expiry mechanism | Lazy on read + pg_cron backstop | Two Vercel crons in this project have never fired |
